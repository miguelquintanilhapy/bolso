import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { db } from './data';
import type { Table, SessionUser } from './data/api';
import { DEFAULT_CATEGORIES } from './data/defaults';
import type { Account, AppNotification, Category, NewTransaction, Recurrence, Snapshot, Transaction } from './lib/types';
import { planRecurrences } from './lib/recurrence';
import { planNotifications } from './lib/alerts';
import { todayISO } from './lib/dates';
import { formatBRL } from './lib/money';
import { seedDemo } from './data/demoSeed';

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
  /** Gera já os lançamentos devidos de uma recorrência recém-salva. */
  syncRecurrences: (saved?: Recurrence) => Promise<void>;
  addTransactions: (rows: NewTransaction[]) => Promise<Transaction[]>;
  save: <T extends Row>(table: Table, row: Partial<T> & object) => Promise<T>;
  insertMany: <T extends Row>(table: Table, rows: object[]) => Promise<T[]>;
  remove: (table: Table, ids: string[]) => Promise<void>;
  /** Apaga e oferece "Desfazer" por alguns segundos. */
  removeWithUndo: (table: 'transactions' | 'recurrences', rows: Row[], message: string) => Promise<void>;
  markRead: (ids: string[]) => Promise<void>;
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
  const [flash, setFlash] = useState<ReadonlySet<string>>(new Set());
  const today = useMemo(todayISO, []);
  const booted = useRef(false);
  const dataRef = useRef<Data>(emptyData);
  dataRef.current = data;

  const merge = useCallback(<K extends keyof Data>(table: K, rows: Data[K]) => {
    setData((d) => {
      const map = new Map((d[table] as Row[]).map((r) => [r.id, r]));
      for (const r of rows as Row[]) map.set(r.id, r);
      return { ...d, [table]: [...map.values()] };
    });
  }, []);

  const drop = useCallback((table: Table, ids: string[]) => {
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


  const processRecurrences = useCallback(async (d: Data): Promise<Data> => {
    const plan = planRecurrences(d.recurrences, d.accounts, today);
    if (!plan.length) return d;
    const next = { ...d };
    const created = await db.insert<Transaction>('transactions', plan.map((p) => p.tx), { ignoreDuplicates: 'recurrence_id,ref_month' });
    next.transactions = [...d.transactions, ...created];
    const lastByRec = new Map<string, string>();
    for (const p of plan) if (p.month > (lastByRec.get(p.recurrenceId) ?? '')) lastByRec.set(p.recurrenceId, p.month);
    for (const [id, month] of lastByRec) {
      const updated = await db.update<Recurrence>('recurrences', id, { last_generated_month: month });
      next.recurrences = next.recurrences.map((r) => (r.id === id ? updated : r));
    }
    const newNotifs = created
      .filter((t) => t.date <= today)
      .map((t) => ({ kind: 'recurrence', dedupe_key: `rec:${t.recurrence_id}:${t.ref_month}`, link: `/lancamentos/${t.id}`,
        title: `Lançamento recorrente criado: ${t.description}`, body: `${formatBRL(t.amount)} em ${t.date.split('-').reverse().join('/')}.` }));
    if (newNotifs.length) next.notifications = [...d.notifications, ...(await db.insert<AppNotification>('notifications', newNotifs, { ignoreDuplicates: 'user_id,dedupe_key' }))];
    return next;
  }, [today]);

  const syncRecurrences = useCallback(async (saved?: Recurrence) => {
    const cur = dataRef.current;
    const recs = saved ? [...cur.recurrences.filter((r) => r.id !== saved.id), saved] : cur.recurrences;
    setData(await processRecurrences({ ...cur, recurrences: recs }));
  }, [processRecurrences]);

  // Inicialização: carrega tudo, cria categorias padrão, gera recorrências e avisos.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      try {
        let d = await load();
        if (db.mode === 'demo' && !d.accounts.length && !d.categories.length && new URLSearchParams(location.search).has('demo')) {
          await seedDemo(db, today);
          d = await load();
        }
        if (!d.categories.length) {
          d.categories = await db.insert<Category>('categories', DEFAULT_CATEGORIES.map((c) => ({ ...c, budget_limit: null, archived: false })));
        }
        d = await processRecurrences(d);
        // avisos por regra
        const alerts = planNotifications({
          categories: d.categories, accounts: d.accounts, txs: d.transactions, today,
          existingKeys: new Set(d.notifications.map((n) => n.dedupe_key)),
        });
        if (alerts.length) d.notifications = [...d.notifications, ...(await db.insert<AppNotification>('notifications', alerts, { ignoreDuplicates: 'user_id,dedupe_key' }))];
        setData(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar os dados');
      } finally {
        setReady(true);
      }
    })();
  }, [load, today, processRecurrences]);

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

  const removeWithUndo = useCallback(async (table: 'transactions' | 'recurrences', rows: Row[], message: string) => {
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

  const markRead = useCallback(async (ids: string[]) => {
    const targets = data.notifications.filter((n) => ids.includes(n.id) && !n.read);
    for (const n of targets) merge('notifications', [await db.update<AppNotification>('notifications', n.id, { read: true })]);
  }, [data.notifications, merge]);

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
    ...data, user, today, mode: db.mode, reload, syncRecurrences, addTransactions, save, insertMany, remove, removeWithUndo, markRead, markPaid, flash,
    toasts, toast, dismissToast, signOut: () => db.signOut(),
  };

  if (!ready) return <div className="splash"><img className="brand-logo" src="/logo.png" alt="Bolso" /></div>;
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
