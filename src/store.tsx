import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { db } from './data';
import type { Table, SessionUser } from './data/api';
import { DEFAULT_CATEGORIES } from './data/defaults';
import { BrandLogo } from './ui/BrandLogo';
import type { Account, AppNotification, Category, NewTransaction, Recurrence, Snapshot, Transaction } from './lib/types';
import { planRecurrences } from './lib/recurrence';
import { categoryAllowed } from './lib/categoryRules';
import { planNotifications } from './lib/alerts';
import { todayISO } from './lib/dates';
import { formatBRL } from './lib/money';
import { seedDemo } from './data/demoSeed';
import { clearCache, readCache, writeCache } from './data/cache';

/** O que a manutenção em segundo plano criou ou alterou. */
interface Delta { transactions: Transaction[]; recurrences: Recurrence[]; notifications: AppNotification[] }

interface Data {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  recurrences: Recurrence[];
  notifications: AppNotification[];
  investment_snapshots: Snapshot[];
}
const emptyData: Data = { accounts: [], categories: [], transactions: [], recurrences: [], notifications: [], investment_snapshots: [] };
type Row = { id: string };

export interface ToastMsg { id: number; message: string; action?: { label: string; run: () => void } }

interface Ctx extends Data {
  user: SessionUser;
  today: string;
  mode: 'supabase' | 'demo';
  reload: () => Promise<void>;
  /** Milissegundos até a tela principal aparecer (diagnóstico). */
  loadMs: number | null;
  /** Mostrando a cópia guardada enquanto busca a versão mais nova. */
  refreshing: boolean;
  /** Gera já os lançamentos devidos de uma recorrência recém-salva. */
  syncRecurrences: (saved?: Recurrence) => Promise<void>;
  addTransactions: (rows: NewTransaction[]) => Promise<Transaction[]>;
  save: <T extends Row>(table: Table, row: Partial<T> & object) => Promise<T>;
  insertMany: <T extends Row>(table: Table, rows: object[]) => Promise<T[]>;
  remove: (table: Table, ids: string[]) => Promise<void>;
  /** Apaga e oferece "Desfazer" por alguns segundos. */
  /** Apaga a categoria; com `moveToId`, os lançamentos, recorrências e palavras-chave vão para essa outra categoria. */
  removeCategoryWithUndo: (category: Category, moveToId?: string) => Promise<void>;
  removeWithUndo: (table: 'transactions' | 'recurrences' | 'investment_snapshots', rows: Row[], message: string) => Promise<void>;
  markRead: (ids: string[]) => Promise<void>;
  /** Exclui avisos da lista (ficam guardados como excluídos, para o mesmo aviso não voltar). */
  dismissNotifications: (ids: string[]) => Promise<void>;
  /** Marca um lançamento pendente como pago/recebido, com "Desfazer". */
  markPaid: (tx: Transaction) => Promise<void>;
  /** Ids de lançamentos recém-criados/alterados (destacados por um instante). */
  flash: ReadonlySet<string>;
  toasts: ToastMsg[];
  toast: (message: string, action?: ToastMsg['action']) => void;
  dismissToast: (id: number) => void;
  signOut: () => Promise<void>;
}

const StoreCtx = createContext<Ctx | null>(null);
export const useStore = () => {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('useStore fora do provider');
  return c;
};

export function StoreProvider({ user, children }: { user: SessionUser; children: ReactNode }) {
  const [data, setData] = useState<Data>(emptyData);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mutations = useRef(0); // conta alterações feitas pela pessoa (para não perder nada ao atualizar por trás)
  const [flash, setFlash] = useState<ReadonlySet<string>>(new Set());
  const today = useMemo(todayISO, []);
  const booted = useRef(false);
  const dataRef = useRef<Data>(emptyData);
  dataRef.current = data;

  const merge = useCallback(<K extends keyof Data>(table: K, rows: Data[K]) => {
    mutations.current++;
    setData((d) => {
      const map = new Map((d[table] as Row[]).map((r) => [r.id, r]));
      for (const r of rows as Row[]) map.set(r.id, r);
      return { ...d, [table]: [...map.values()] };
    });
  }, []);

  const drop = useCallback((table: Table, ids: string[]) => {
    mutations.current++;
    const set = new Set(ids);
    setData((d) => {
      const next = { ...d, [table]: (d[table as keyof Data] as Row[]).filter((r) => !set.has(r.id)) } as Data;
      if (table === 'accounts') {
        next.transactions = d.transactions.filter((t) => !set.has(t.account_id) && !(t.to_account_id && set.has(t.to_account_id)));
        next.recurrences = d.recurrences.filter((r) => !set.has(r.account_id));
        next.investment_snapshots = d.investment_snapshots.filter((s) => !set.has(s.account_id));
      }
      return next;
    });
  }, []);

  const toast = useCallback((message: string, action?: ToastMsg['action']) => {
    const id = Date.now() + Math.random();
    setToasts([{ id, message, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 3500);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const load = useCallback(async () => {
    const [accounts, categories, transactions, recurrences, notifications, investment_snapshots] = await Promise.all([
      db.list<Account>('accounts'), db.list<Category>('categories'), db.list<Transaction>('transactions'),
      db.list<Recurrence>('recurrences'), db.list<AppNotification>('notifications'), db.list<Snapshot>('investment_snapshots'),
    ]);
    return { accounts, categories, transactions, recurrences, notifications, investment_snapshots } as Data;
  }, []);

  const reload = useCallback(async () => setData(await load()), [load]);


  /** Gera as recorrências devidas e devolve só o que foi criado/alterado. */
  const processRecurrences = useCallback(async (d: Data): Promise<Delta> => {
    const none: Delta = { transactions: [], recurrences: [], notifications: [] };
    const plan = planRecurrences(d.recurrences, d.accounts, today);
    if (!plan.length) return none;
    // se a conta passou a limitar categorias e a recorrência usa outra, o lançamento é criado sem categoria (em vez de falhar o lote todo)
    const accById = new Map(d.accounts.map((x) => [x.id, x]));
    const rows = plan.map((p) => (categoryAllowed(accById.get(p.tx.account_id), p.tx.category_id) ? p.tx : { ...p.tx, category_id: null }));
    const created = await db.insert<Transaction>('transactions', rows, { ignoreDuplicates: 'recurrence_id,ref_month' });
    const lastByRec = new Map<string, string>();
    for (const p of plan) if (p.month > (lastByRec.get(p.recurrenceId) ?? '')) lastByRec.set(p.recurrenceId, p.month);
    const newNotifs = created
      .filter((t) => t.date <= today)
      .map((t) => ({ kind: 'recurrence', dedupe_key: `rec:${t.recurrence_id}:${t.ref_month}`, link: `/lancamentos/${t.id}`,
        title: `Lançamento recorrente criado: ${t.description}`, body: `${formatBRL(t.amount)} em ${t.date.split('-').reverse().join('/')}.` }));
    // atualizações e avisos não dependem uns dos outros: vão juntos
    const [recurrences, notifications] = await Promise.all([
      Promise.all([...lastByRec].map(([id, month]) => db.update<Recurrence>('recurrences', id, { last_generated_month: month }))),
      newNotifs.length ? db.insert<AppNotification>('notifications', newNotifs, { ignoreDuplicates: 'user_id,dedupe_key' }) : Promise.resolve([] as AppNotification[]),
    ]);
    return { transactions: created, recurrences, notifications };
  }, [today]);

  const applyDelta = useCallback((delta: Delta) => {
    if (delta.transactions.length) merge('transactions', delta.transactions);
    if (delta.recurrences.length) merge('recurrences', delta.recurrences);
    if (delta.notifications.length) merge('notifications', delta.notifications);
  }, [merge]);

  const syncRecurrences = useCallback(async (saved?: Recurrence) => {
    const cur = dataRef.current;
    const recs = saved ? [...cur.recurrences.filter((r) => r.id !== saved.id), saved] : cur.recurrences;
    applyDelta(await processRecurrences({ ...cur, recurrences: recs }));
  }, [processRecurrences, applyDelta]);

  // Inicialização. O que a pessoa espera para ver a tela é o mínimo:
  //  1) mostra na hora a cópia guardada da última vez (se existir);
  //  2) busca os dados novos e troca por trás;
  //  3) recorrências e avisos rodam depois, sem segurar a tela.
  const cacheKey = `v1:${user.id}`;
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const t0 = performance.now();
    (async () => {
      let shown = false;
      const cached = await readCache<Data>(cacheKey);
      if (cached) {
        setData({ ...emptyData, ...cached });
        setReady(true);
        setLoadMs(Math.round(performance.now() - t0));
        setRefreshing(true);
        shown = true;
      }
      try {
        const startedAt = mutations.current;
        let d = await load();
        if (db.mode === 'demo' && !d.accounts.length && !d.categories.length && new URLSearchParams(location.search).has('demo')) {
          await seedDemo(db, today);
          d = await load();
        }
        // as categorias padrão precisam existir antes do primeiro lançamento
        if (!d.categories.length) {
          d.categories = await db.insert<Category>('categories', DEFAULT_CATEGORIES.map((c) => ({ ...c, budget_limit: null, archived: false })));
        }
        // a pessoa mexeu enquanto buscávamos: busca de novo para não mostrar dado velho
        if (mutations.current !== startedAt) d = await load();
        setData(d);
        setReady(true);
        if (!shown) setLoadMs(Math.round(performance.now() - t0));

        // manutenção em segundo plano
        const delta = await processRecurrences(d);
        applyDelta(delta);
        const alerts = planNotifications({
          categories: d.categories, accounts: d.accounts, txs: [...d.transactions, ...delta.transactions], today,
          existingKeys: new Set([...d.notifications, ...delta.notifications].map((n) => n.dedupe_key)),
        });
        if (alerts.length) merge('notifications', await db.insert<AppNotification>('notifications', alerts, { ignoreDuplicates: 'user_id,dedupe_key' }));
      } catch (e) {
        if (shown) toast('Sem conexão. Mostrando os dados salvos neste aparelho.');
        else setError(e instanceof Error ? e.message : 'Erro ao carregar os dados');
      } finally {
        setReady(true);
        setRefreshing(false);
      }
    })();
  }, [load, today, processRecurrences, applyDelta, merge, toast, cacheKey]);

  // mantém a cópia local em dia depois de cada mudança
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => void writeCache(cacheKey, data), 500);
    return () => clearTimeout(t);
  }, [data, ready, cacheKey]);

  const flashFor = useCallback((ids: string[]) => {
    setFlash((f) => new Set([...f, ...ids]));
    setTimeout(() => setFlash((f) => { const n = new Set(f); ids.forEach((i) => n.delete(i)); return n; }), 1700);
  }, []);

  const addTransactions = useCallback(async (rows: NewTransaction[]) => {
    const created = await db.insert<Transaction>('transactions', rows);
    merge('transactions', created);
    flashFor(created.map((t) => t.id));
    return created;
  }, [merge, flashFor]);

  const save = useCallback(async <T extends Row>(table: Table, row: Partial<T> & object) => {
    const id = (row as Partial<Row>).id;
    const saved = id
      ? await db.update<T>(table, id, (({ id: _i, ...rest }) => rest)(row as Row))
      : (await db.insert<T>(table, [row]))[0];
    merge(table as keyof Data, [saved] as never);
    return saved;
  }, [merge]);

  const insertMany = useCallback(async <T extends Row>(table: Table, rows: object[]) => {
    const created = await db.insert<T>(table, rows);
    merge(table as keyof Data, created as never);
    return created;
  }, [merge]);

  const remove = useCallback(async (table: Table, ids: string[]) => {
    await db.remove(table, ids);
    drop(table, ids);
  }, [drop]);

  const removeWithUndo = useCallback(async (table: 'transactions' | 'recurrences' | 'investment_snapshots', rows: Row[], message: string) => {
    const copies = structuredClone(rows) as Record<string, unknown>[];
    await remove(table, rows.map((r) => r.id));
    toast(message, {
      label: 'Desfazer',
      run: async () => {
        const restored = await db.insert<Row>(table, copies);
        merge(table, restored as never);
      },
    });
  }, [remove, toast, merge]);

  // apagar categoria: lançamentos e recorrências ficam sem categoria; "Desfazer" devolve tudo
  const removeCategoryWithUndo = useCallback(async (category: Category, moveToId?: string) => {
    const copy = structuredClone(category) as unknown as Record<string, unknown>;
    const txIds = data.transactions.filter((t) => t.category_id === category.id).map((t) => t.id);
    const recIds = data.recurrences.filter((r) => r.category_id === category.id).map((r) => r.id);
    const dest = moveToId ? data.categories.find((c) => c.id === moveToId) : undefined;
    const mergedDefaults = dest ? { ...(category.keyword_defaults ?? {}), ...(dest.keyword_defaults ?? {}) } : {};
    const hasDefaults = Object.keys(mergedDefaults).length > 0; // só mexe na coluna quando há o que guardar
    const destBefore = dest ? { keywords: [...dest.keywords], ...(hasDefaults ? { keyword_defaults: { ...(dest.keyword_defaults ?? {}) } } : {}) } : null;
    if (dest) {
      // os lançamentos vão para a outra categoria, e as palavras-chave junto, para o campo rápido continuar acertando
      for (const id of txIds) await db.update('transactions', id, { category_id: dest.id });
      for (const id of recIds) await db.update('recurrences', id, { category_id: dest.id });
      const keywords = [...new Set([...dest.keywords, ...category.keywords])];
      await db.update('categories', dest.id, { keywords, ...(hasDefaults ? { keyword_defaults: mergedDefaults } : {}) });
    }
    await db.remove('categories', [category.id]);
    await reload();
    toast(dest ? `"${category.name}" apagada · ${txIds.length} lançamento${txIds.length === 1 ? '' : 's'} movido${txIds.length === 1 ? '' : 's'} para "${dest.name}"` : `Categoria "${category.name}" apagada`, {
      label: 'Desfazer',
      run: async () => {
        await db.insert<Row>('categories', [copy]);
        if (dest && destBefore) await db.update('categories', dest.id, destBefore);
        for (const id of txIds) await db.update('transactions', id, { category_id: category.id });
        for (const id of recIds) await db.update('recurrences', id, { category_id: category.id });
        await reload();
      },
    });
  }, [data.transactions, data.recurrences, data.categories, reload, toast]);

  const markRead = useCallback(async (ids: string[]) => {
    const targets = data.notifications.filter((n) => ids.includes(n.id) && !n.read);
    for (const n of targets) merge('notifications', [await db.update<AppNotification>('notifications', n.id, { read: true })]);
  }, [data.notifications, merge]);

  const dismissNotifications = useCallback(async (ids: string[]) => {
    const targets = data.notifications.filter((n) => ids.includes(n.id) && !n.dismissed);
    if (!targets.length) return;
    try {
      for (const n of targets) merge('notifications', [await db.update<AppNotification>('notifications', n.id, { dismissed: true, read: true })]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      toast(/dismissed/.test(msg) ? 'Para excluir avisos, rode o arquivo supabase/schema.sql de novo no Supabase (veja docs/SETUP.md).' : 'Não consegui excluir.');
      return;
    }
    toast(targets.length === 1 ? 'Aviso excluído' : `${targets.length} avisos excluídos`, {
      label: 'Desfazer',
      run: async () => { for (const n of targets) merge('notifications', [await db.update<AppNotification>('notifications', n.id, { dismissed: false })]); },
    });
  }, [data.notifications, merge, toast]);

  const paying = useRef(new Set<string>());
  const markPaid = useCallback(async (tx: Transaction) => {
    if (paying.current.has(tx.id)) return;
    paying.current.add(tx.id);
    try {
      const updated = await db.update<Transaction>('transactions', tx.id, { status: 'paid' });
      merge('transactions', [updated]);
      flashFor([tx.id]);
      toast(tx.kind === 'income' ? 'Marcado como recebido' : 'Marcado como pago', {
        label: 'Desfazer',
        run: async () => merge('transactions', [await db.update<Transaction>('transactions', tx.id, { status: 'pending' })]),
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não consegui atualizar.');
    } finally {
      paying.current.delete(tx.id);
    }
  }, [merge, flashFor, toast]);

  // ao voltar para o app depois de um tempo, busca de novo (ex.: lançou pelo computador)
  useEffect(() => {
    let hiddenAt = 0;
    const onVisible = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 60_000) void reload().catch(() => {});
      hiddenAt = 0;
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  const value: Ctx = {
    ...data, user, today, mode: db.mode, reload, syncRecurrences, loadMs, refreshing, addTransactions, save, insertMany, remove, removeWithUndo, removeCategoryWithUndo, markRead, dismissNotifications, markPaid, flash,
    toasts, toast, dismissToast, signOut: async () => { await clearCache(); await db.signOut(); },
  };

  if (!ready) return <div className="splash"><BrandLogo /></div>;
  if (error) return (
    <div className="splash">
      <div className="splash-error">
        <h2>Não consegui carregar seus dados</h2>
        <p>{error}</p>
        <p className="muted">Se você acabou de criar o projeto no Supabase, confirme que rodou o arquivo supabase/schema.sql.</p>
        <button className="btn primary" onClick={() => location.reload()}>Tentar de novo</button>
      </div>
    </div>
  );
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
