import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { Sheet, SheetClosing } from './Sheet';
import { useConfirm } from './confirm';
import { Segmented, Switch } from './common';
import { MoneyInput } from './MoneyInput';
import { TimeInput } from './TimeInput';
import { BANK_TEMPLATES, templateName } from '../lib/bankTemplates';
import { effectiveTime, launchInfo, validTime } from '../lib/launch';
import { CATEGORY_ICONS, CategoryIcon, COLORS } from './icons';
import type { Account, AccountKind, Category, NewTransaction, Recurrence, Snapshot, Transaction, TxKind } from '../lib/types';
import { accountBalance, buildInstallments, buildInvoice, cardOverview, invoiceMonths } from '../lib/finance';
import { amountError, formatBRL, parseAmount, round2 } from '../lib/money';
import { addDays, monthLabel, monthOf } from '../lib/dates';
import { norm } from '../lib/quickEntry';
import { allowedCategories, categoryAllowed, isRestricted, restrictionText } from '../lib/categoryRules';
import { findDuplicate, getLastUsed, previewEffect, setLastUsed, suggestDescriptions } from '../lib/ux';

export type TxInit = Partial<{
  kind: TxKind; amount: number; description: string; category_id: string | null; account_id: string; to_account_id: string | null;
  date: string; status: 'paid' | 'pending'; installments: number; tags: string[]; invoice_ref: string | null; keyword: string | null;
}>;

export type RecInit = { description?: string; kind?: 'expense' | 'income' };

type Open =
  | { type: 'tx'; id?: string; init?: TxInit }
  | { type: 'account'; id?: string; thenTx?: TxInit }
  | { type: 'category'; id?: string; kind?: 'expense' | 'income' }
  | { type: 'recurrence'; id?: string; init?: RecInit }
  | { type: 'snapshot'; accountId: string }
  | { type: 'adjust'; accountId: string };

interface EditorApi {
  newTx: (init?: TxInit) => void;
  editTx: (id: string) => void;
  openAccount: (id?: string, thenTx?: TxInit) => void;
  openCategory: (id?: string, kind?: 'expense' | 'income') => void;
  openRecurrence: (id?: string, init?: RecInit) => void;
  openSnapshot: (accountId: string) => void;
  openAdjust: (accountId: string) => void;
}
const Ctx = createContext<EditorApi | null>(null);
export const useEditor = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useEditor fora do provider');
  return c;
};

export function EditorProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const close = useCallback(() => {
    setClosing(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setOpen(null); setClosing(false); }, 210);
  }, []);
  const show = useCallback((o: Open) => {
    clearTimeout(timer.current);
    setClosing(false);
    setOpen(o);
  }, []);
  const api = useMemo<EditorApi>(() => ({
    newTx: (init) => show({ type: 'tx', init }),
    editTx: (id) => show({ type: 'tx', id }),
    openAccount: (id, thenTx) => show({ type: 'account', id, thenTx }),
    openCategory: (id, kind) => show({ type: 'category', id, kind }),
    openRecurrence: (id, init) => show({ type: 'recurrence', id, init }),
    openSnapshot: (accountId) => show({ type: 'snapshot', accountId }),
    openAdjust: (accountId) => show({ type: 'adjust', accountId }),
  }), [show]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <SheetClosing.Provider value={closing}>
        {open?.type === 'tx' && <TxEditor key={open.id ?? 'new'} id={open.id} init={open.init} onClose={close} />}
        {open?.type === 'account' && <AccountEditor id={open.id} thenTx={open.thenTx} reopenTx={(init) => show({ type: 'tx', init })} onClose={close} />}
        {open?.type === 'category' && <CategoryEditor id={open.id} kind={open.kind} onClose={close} />}
        {open?.type === 'recurrence' && <RecurrenceEditor id={open.id} init={open.init} onClose={close} />}
        {open?.type === 'snapshot' && <SnapshotEditor accountId={open.accountId} onClose={close} />}
        {open?.type === 'adjust' && <AdjustEditor accountId={open.accountId} onClose={close} />}
      </SheetClosing.Provider>
    </Ctx.Provider>
  );
}

const Field = ({ label, children, optional, error, hint }: { label: string; children: ReactNode; optional?: boolean; error?: string; hint?: string }) => (
  <div className="field">
    <span className="lbl">{label}{optional && <em className="opt"> · opcional</em>}</span>
    {children}
    {hint && !error && <p className="field-hint">{hint}</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </div>
);

/** Pergunta antes de descartar o que a pessoa já digitou; sem alterações, fecha direto. */
function useGuardedClose(onClose: () => void, snapshot: unknown) {
  const confirm = useConfirm();
  const now = JSON.stringify(snapshot);
  const first = useRef<string | undefined>(undefined);
  if (first.current === undefined) first.current = now;
  const dirty = now !== first.current;
  const asking = useRef(false);
  return useCallback(async () => {
    if (!dirty) return onClose();
    if (asking.current) return;
    asking.current = true;
    const ok = await confirm({ title: 'Descartar alterações?', message: 'O que você digitou ou mudou será perdido.', confirmLabel: 'Descartar', danger: true });
    asking.current = false;
    if (ok) onClose();
  }, [dirty, onClose, confirm]);
}

const defaultAccount = (accounts: Account[]) =>
  accounts.find((a) => a.id === getLastUsed().account && !a.archived) ?? accounts.find((a) => a.is_default && !a.archived) ?? accounts.find((a) => a.kind === 'checking' && !a.archived) ?? accounts.find((a) => !a.archived);

// ───────────────────────── Lançamento ─────────────────────────

type DateMode = 'today' | 'yest' | 'other';

function TxEditor({ id, init, onClose }: { id?: string; init?: TxInit; onClose: () => void }) {
  const s = useStore();
  const existing = id ? s.transactions.find((t) => t.id === id) : undefined;
  const live = s.accounts.filter((a) => !a.archived);
  const { openAccount } = useEditor();
  const [kind, setKind] = useState<TxKind>(existing?.kind ?? init?.kind ?? 'expense');
  const [amount, setAmount] = useState(existing ? String(existing.amount).replace('.', ',') : init?.amount ? String(init.amount).replace('.', ',') : '');
  const [description, setDescription] = useState(existing?.description ?? init?.description ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(existing ? existing.category_id : init?.category_id ?? null);
  const [categoryTouched, setCategoryTouched] = useState(!!existing || !!init?.category_id);
  const [accountId, setAccountId] = useState(existing?.account_id ?? init?.account_id ?? defaultAccount(s.accounts)?.id ?? '');
  const [toId, setToId] = useState(existing?.to_account_id ?? init?.to_account_id ?? '');
  const [date, setDate] = useState(existing?.date ?? init?.date ?? s.today);
  const [showDate, setShowDate] = useState(false);
  const [statusTouched, setStatusTouched] = useState(!!existing || !!init?.status);
  const [status, setStatus] = useState<'paid' | 'pending'>(existing?.status ?? init?.status ?? 'paid');
  const [installments, setInstallments] = useState(init?.installments ?? 1);
  const [tags, setTags] = useState<string[]>(existing?.tags ?? init?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [time, setTime] = useState(existing?.occurred_time ?? '');
  const [invoiceRef, setInvoiceRef] = useState<string | null>(existing?.invoice_ref ?? init?.invoice_ref ?? null);
  const [learn] = useState(init?.keyword ?? null);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [errField, setErrField] = useState<'amount' | 'to' | 'category' | 'time' | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const sending = useRef(false); // trava contra duplo toque (o estado `busy` só atualiza no próximo render)

  const account = s.accounts.find((a) => a.id === accountId);
  // de onde o dinheiro pode sair numa transferência: não de um cartão de crédito
  const fromOptions = kind === 'transfer' ? live.filter((a) => a.kind !== 'credit') : live;
  const toAccount = s.accounts.find((a) => a.id === toId);
  const isCard = account?.kind === 'credit';
  const catKind = kind === 'income' ? 'income' : 'expense';
  // categorias que você mais usa aparecem primeiro
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of s.transactions.slice(-500)) if (t.category_id && t.kind === catKind) m.set(t.category_id, (m.get(t.category_id) ?? 0) + 1);
    return m;
  }, [s.transactions, catKind]);
  const restricted = isRestricted(account);
  const cats = allowedCategories(account, s.categories)
    .filter((c) => !c.archived && c.kind === catKind)
    .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.name.localeCompare(b.name));
  const value = parseAmount(amount);
  const cardMonths = toAccount?.kind === 'credit' ? invoiceMonths(toAccount, s.transactions, s.today) : [];
  const effStatus = isCard && kind !== 'transfer' ? 'paid' : status;
  const canInstall = !existing && kind !== 'transfer';
  const yesterday = addDays(s.today, -1);
  const dateMode: DateMode = showDate ? 'other' : date === s.today ? 'today' : date === yesterday ? 'yest' : 'other';

  const fail = (msg: string, field: 'amount' | 'to' | 'category' | 'time' | null = null) => { setError(msg); setErrField(field); setShake((n) => n + 1); };

  const addTag = () => {
    const t = norm(tagInput.replace(/^#/, '').trim());
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  const onDate = (d: string) => {
    setDate(d);
    if (!statusTouched) setStatus(d > s.today ? 'pending' : 'paid');
  };

  // sugere a categoria enquanto a pessoa digita a descrição (até ela escolher uma)
  const onDescription = (text: string) => {
    setDescription(text);
    if (categoryTouched || kind === 'transfer') return;
    const words = norm(text).split(/\s+/).filter(Boolean);
    const hit = cats.find((c) => words.some((w) => c.keywords.map(norm).includes(w) || norm(c.name) === w));
    if (hit) setCategoryId(hit.id);
  };

  const submit = async () => {
    if (sending.current) return;
    if (!value) return fail(amountError(amount), 'amount');
    if (time && !validTime(time)) return fail('Horário inválido. Use hora e minutos, por exemplo 14:32 (ou deixe em branco).', 'time');
    if (installments > 1 && value / installments < 0.01) return fail(`Valor pequeno demais para ${installments} parcelas (mínimo de R$ 0,01 cada).`);
    if (!accountId) return fail('Você ainda não tem conta. Toque em “Criar conta agora” no topo.');
    if (kind !== 'transfer' && account && !existing && restricted && !categoryId) return fail(`Escolha uma categoria. ${restrictionText(account, s.categories)}`, 'category');
    if (kind !== 'transfer' && account && !categoryAllowed(account, categoryId) && categoryId !== existing?.category_id) return fail(restrictionText(account, s.categories), 'category');
    if (kind === 'transfer' && account?.kind === 'credit') return fail('Não dá para transferir a partir de um cartão. Para pagar a fatura, transfira de uma conta para o cartão.');
    if (kind === 'transfer' && (!toId || toId === accountId)) return fail('Escolha para qual conta o dinheiro vai (diferente da origem).', 'to');
    const candidate = { kind, amount: value, date, description: description.trim(), account_id: accountId, to_account_id: kind === 'transfer' ? toId : null };
    if (!existing && findDuplicate(s.transactions, candidate)) {
      const again = await confirm({ title: 'Parece repetido', message: 'Já existe um lançamento igual neste dia (mesmo valor, conta e descrição). Salvar mesmo assim?', confirmLabel: 'Salvar mesmo assim' });
      if (!again) return;
    }
    sending.current = true;
    setBusy(true);
    setError('');
    setErrField(null);
    try {
      const finalTags = tagInput.trim() ? [...new Set([...tags, norm(tagInput.replace(/^#/, '').trim())])] : tags;
      const base: NewTransaction = {
        kind, amount: value, date, description: description.trim(), notes: notes.trim(), tags: finalTags,
        status: effStatus, account_id: accountId, to_account_id: kind === 'transfer' ? toId : null,
        category_id: kind === 'transfer' ? null : categoryId, installment_group: null, installment_number: null,
        installment_total: null, recurrence_id: null, ref_month: null,
        invoice_ref: kind === 'transfer' && toAccount?.kind === 'credit' ? invoiceRef : null,
        // só envia quando há o que guardar (quem nunca usa o horário não depende da atualização do banco)
        ...(time ? { occurred_time: time } : existing?.occurred_time ? { occurred_time: null } : {}),
      };
      if (existing) {
        await s.save<Transaction>('transactions', { id: existing.id, ...base, recurrence_id: existing.recurrence_id, ref_month: existing.ref_month,
          installment_group: existing.installment_group, installment_number: existing.installment_number, installment_total: existing.installment_total });
        s.toast('Lançamento atualizado');
      } else if (installments > 1 && kind !== 'transfer') {
        await s.addTransactions(buildInstallments(base, installments, !!isCard, s.today, crypto.randomUUID()));
        s.toast(`${installments} parcelas de ${formatBRL(value / installments)} criadas`);
      } else {
        const [created] = await s.addTransactions([base]);
        s.toast('Lançamento salvo', { label: 'Desfazer', run: () => void s.remove('transactions', [created.id]) });
      }
      // aprende a palavra-chave quando a categoria foi escolhida manualmente
      if (learn && categoryId && kind !== 'transfer') {
        const cat = s.categories.find((c) => c.id === categoryId);
        if (cat && !cat.keywords.map(norm).includes(learn)) await s.save<Category>('categories', { id: cat.id, keywords: [...cat.keywords, learn] });
      }
      setLastUsed({ account: accountId });
      setSaved(true);
      setTimeout(onClose, 380);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não consegui salvar.';
      fail(/occurred_time/.test(msg) ? 'Para guardar o horário, rode o arquivo supabase/schema.sql de novo no Supabase (passo a passo em docs/SETUP.md) e tente de novo.' : msg);
      sending.current = false;
      setBusy(false);
    }
  };

  const del = async () => {
    if (!existing || sending.current) return;
    sending.current = true;
    onClose();
    await s.removeWithUndo('transactions', [existing], 'Lançamento apagado');
  };
  const delGroup = async () => {
    if (!existing?.installment_group || sending.current) return;
    sending.current = true;
    const group = s.transactions.filter((t) => t.installment_group === existing.installment_group);
    onClose();
    await s.removeWithUndo('transactions', group, `${group.length} parcelas apagadas`);
  };
  // transferir para um cartão = pagar fatura: já escolhe a fatura que pede pagamento e sugere o valor
  const pickDestination = (a: Account) => {
    setToId(a.id);
    if (a.kind !== 'credit') return setInvoiceRef(null);
    const focus = cardOverview(a, s.transactions, s.today).focus;
    if (focus.remaining > 0) {
      setInvoiceRef(focus.month);
      if (!amount.trim()) setAmount(String(focus.remaining).replace('.', ','));
    } else setInvoiceRef(null);
  };
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } };

  useEffect(() => { if (categoryId && !categoryAllowed(account, categoryId) && categoryId !== existing?.category_id) setCategoryId(null); }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps
  const guardedClose = useGuardedClose(onClose, { kind, amount, description, categoryId, accountId, toId, date, status, installments, tags, tagInput, notes, time });
  const hints = existing || kind === 'transfer' ? [] : suggestDescriptions(s.transactions, kind, description);
  const effect = !value ? [] : previewEffect({
    base: {
      kind, amount: value, date, description: description.trim(), notes: '', tags: [], status: effStatus, account_id: accountId,
      to_account_id: kind === 'transfer' && toId ? toId : null, category_id: null, installment_group: null, installment_number: null,
      installment_total: null, recurrence_id: null, ref_month: null, invoice_ref: null,
    },
    installments: canInstall ? installments : 1, accounts: s.accounts, txs: s.transactions, snaps: s.investment_snapshots, today: s.today, ignoreId: existing?.id,
  });
  const addToAmount = (n: number) => setAmount(String(round2((value ?? 0) + n)).replace('.', ','));

  return (
    <Sheet title={existing ? 'Editar lançamento' : kind === 'income' ? 'Nova receita' : kind === 'transfer' ? 'Nova transferência' : 'Nova despesa'} onClose={guardedClose}
      footer={
        <>
          {error && <p key={shake} className="error-text shake" role="alert">{error}</p>}
          <div className="foot-actions">
            {existing && <button className="btn danger icon" onClick={del} aria-label="Apagar lançamento"><Trash2 size={19} /></button>}
            <button className={`btn primary ${saved ? 'saved' : ''}`} onClick={submit} disabled={busy}>
              {saved ? <><Check size={19} strokeWidth={3} className="check-pop" /> Salvo</> : busy ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </>
      }>
      {live.length === 0 && (
        <div className="no-account" role="note">
          <b>Você ainda não tem conta</b>
          <p>Todo lançamento fica numa conta (onde o dinheiro está). Crie a primeira, leva 20 segundos, e volte aqui com tudo preenchido.</p>
          <button type="button" className="btn primary" onClick={() => openAccount(undefined, { kind, amount: value ?? undefined, description, category_id: categoryId, date, status, tags, installments })}>Criar conta agora</button>
        </div>
      )}
      <Segmented<TxKind> value={kind} onChange={(k) => {
        setKind(k); setCategoryId(null); setCategoryTouched(false);
        // cartão de crédito não pode ser a origem de uma transferência
        if (k === 'transfer' && account?.kind === 'credit') setAccountId(live.find((a) => a.kind !== 'credit')?.id ?? '');
      }}
        options={[{ id: 'expense', label: 'Despesa' }, { id: 'income', label: 'Receita' }, { id: 'transfer', label: 'Transferência' }]} />
      <div className="amount-wrap">
        <small>Valor (R$)</small>
        <MoneyInput className="amount-input" placeholder="0,00" value={amount} onChange={setAmount}
          onKeyDown={onEnter} aria-label="Valor" autoFocus={!existing} enterKeyHint="done" aria-invalid={errField === 'amount'} />
        {installments > 1 && value ? <small>{installments}x de {formatBRL(value / installments)}</small> : null}
        {errField === 'amount' && error && <p className="field-error" role="alert">{error}</p>}
      </div>
      <div className="quick-amounts" aria-label="Somar ao valor">
        {[10, 50, 100, 500].map((n) => <button key={n} type="button" onClick={() => addToAmount(n)}>+{n}</button>)}
        {amount && <button type="button" className="clear" onClick={() => setAmount('')} aria-label="Limpar valor">Limpar</button>}
      </div>
      {effect.length > 0 && (
        <div className="effect" aria-live="polite">
          {effect.map((l) => <p key={l}>{l}</p>)}
        </div>
      )}

      {kind !== 'transfer' && (
        <Field label="Descrição" optional>
          <input className="input" value={description} onChange={(e) => onDescription(e.target.value)} onKeyDown={onEnter} placeholder="Ex.: Mercado" enterKeyHint="done" autoCapitalize="sentences" />
          {hints.length > 0 && (
            <div className="chips suggest" aria-label="Sugestões">
              {hints.map((h) => (
                <button key={h.description} type="button" className="chip" onClick={() => {
                  setDescription(h.description);
                  if (h.category_id && cats.some((c) => c.id === h.category_id)) { setCategoryId(h.category_id); setCategoryTouched(true); }
                  if (!value) setAmount(String(h.amount).replace('.', ','));
                }}>{h.description}</button>
              ))}
            </div>
          )}
        </Field>
      )}
      {kind !== 'transfer' && (
        <Field label="Categoria" optional={!restricted || !!existing} error={errField === 'category' ? error : undefined}
          hint={restricted && account ? restrictionText(account, s.categories) : categoryId ? undefined : 'Sem escolher, fica como “Sem categoria”.'}>
          <div className="chips">
            {cats.map((c) => (
              <button key={c.id} type="button" className={`chip ${categoryId === c.id ? 'active' : ''}`} aria-pressed={categoryId === c.id}
                onClick={() => { setCategoryTouched(true); setCategoryId(categoryId === c.id ? null : c.id); }}>
                <CategoryIcon name={c.icon} size={16} /> {c.name}
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label={kind === 'transfer' ? 'De' : 'Conta'}>
        {fromOptions.length <= 4 ? (
          <div className="chips">
            {fromOptions.map((a) => (
              <button key={a.id} type="button" className={`chip ${accountId === a.id ? 'active' : ''}`} aria-pressed={accountId === a.id} onClick={() => { setAccountId(a.id); if (toId === a.id) setToId(''); }}>
                <span className="dot-color" style={{ background: a.color }} /> {a.name}
              </button>
            ))}
          </div>
        ) : (
          <select className="select" value={accountId} onChange={(e) => { setAccountId(e.target.value); if (toId === e.target.value) setToId(''); }}>
            {fromOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </Field>
      {kind === 'transfer' && (
        <>
          <Field label="Para" error={errField === 'to' ? error : undefined}>
            <div className="chips">
              {live.filter((a) => a.id !== accountId).map((a) => (
                <button key={a.id} type="button" className={`chip ${toId === a.id ? 'active' : ''}`} aria-pressed={toId === a.id} onClick={() => pickDestination(a)}>
                  <span className="dot-color" style={{ background: a.color }} /> {a.name}
                </button>
              ))}
            </div>
          </Field>
          {cardMonths.length > 0 && toAccount && (
            <Field label="Pagamento da fatura de">
              <select className="select" value={invoiceRef ?? ''} onChange={(e) => setInvoiceRef(e.target.value || null)}>
                <option value="">Outro valor (abate da fatura mais antiga)</option>
                {cardMonths.map((m) => <option key={m} value={m}>{monthLabel(m)} — resta {formatBRL(buildInvoice(toAccount, s.transactions, m).remaining)}</option>)}
              </select>
            </Field>
          )}
        </>
      )}

      <Field label="Data">
        <Segmented<DateMode> value={dateMode} onChange={(m) => {
          if (m === 'today') { onDate(s.today); setShowDate(false); }
          else if (m === 'yest') { onDate(yesterday); setShowDate(false); }
          else setShowDate(true);
        }} options={[{ id: 'today', label: 'Hoje' }, { id: 'yest', label: 'Ontem' }, { id: 'other', label: 'Outra data' }]} />
        {dateMode === 'other' && <input className="input" type="date" value={date} onChange={(e) => e.target.value && onDate(e.target.value)} aria-label="Data do lançamento" />}
      </Field>

      <Field label="Horário" optional error={errField === 'time' ? error : undefined}
        hint={time ? 'Hora em que aconteceu.' : existing ? (launchInfo(existing) ? `Em branco: vale a hora do registro (${launchInfo(existing)!.time}).` : 'Em branco: sem horário.') : 'Em branco: vale a hora em que você salvar. Preencha se estiver lançando depois.'}>
        <div className="tag-add">
          <TimeInput className="input" value={time} onChange={setTime} aria-label="Horário do lançamento" />
          <button type="button" className="btn sm" onClick={() => { const d = new Date(); setTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`); }}>Agora</button>
          {time && <button type="button" className="btn sm" onClick={() => setTime('')} aria-label="Limpar horário">Limpar</button>}
        </div>
      </Field>

      {!(isCard && kind !== 'transfer') && (
        <Field label={kind === 'income' ? 'Recebimento' : kind === 'transfer' ? 'Transferência' : 'Pagamento'}>
          <Segmented value={status} onChange={(v) => { setStatus(v); setStatusTouched(true); }}
            options={kind === 'income' ? [{ id: 'paid', label: 'Já recebi' }, { id: 'pending', label: 'A receber' }]
              : kind === 'transfer' ? [{ id: 'paid', label: 'Já fiz' }, { id: 'pending', label: 'Agendada' }]
              : [{ id: 'paid', label: 'Já paguei' }, { id: 'pending', label: 'A pagar' }]} />
        </Field>
      )}

      {canInstall && (
        <Field label="Parcelas">
          <div className="row-between">
            <div className="seg" style={{ width: 168 }}>
              <button type="button" onClick={() => setInstallments(Math.max(1, installments - 1))} aria-label="Menos parcelas">−</button>
              <button type="button" className="active" style={{ cursor: 'default' }}>{installments}x</button>
              <button type="button" onClick={() => setInstallments(Math.min(48, installments + 1))} aria-label="Mais parcelas">+</button>
            </div>
            <span className="muted" style={{ fontSize: 13 }}>{installments > 1 ? 'valor total dividido' : 'à vista'}</span>
          </div>
        </Field>
      )}
      {existing?.installment_total ? <p className="muted">Parcela {existing.installment_number} de {existing.installment_total}</p> : null}
      {existing && (launchInfo(existing) ? <p className="muted launched">{effectiveTime(existing)?.typed ? `Horário informado: ${existing.occurred_time} · ` : ''}Registrado em {launchInfo(existing)!.full}</p> : existing.recurrence_id ? <p className="muted launched">Criado automaticamente pela recorrência</p> : null)}

      <Field label="Tags" optional hint="Para agrupar gastos, ex.: viagem, mae. Toque em + para adicionar.">
        <div className="chips">
          {tags.map((t) => (
            <span key={t} className="chip active">#{t}<button type="button" className="x" aria-label={`Remover ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}>×</button></span>
          ))}
        </div>
        <div className="tag-add">
          <input className="input" value={tagInput} placeholder="Ex.: viagem" maxLength={30} enterKeyHint="done" autoCapitalize="none" onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }} onBlur={addTag} />
          <button type="button" className="icon-btn" onClick={addTag} aria-label="Adicionar tag" disabled={!tagInput.trim()}><Plus size={20} /></button>
        </div>
      </Field>
      <Field label="Observação" optional>
        <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
      </Field>
      {existing?.installment_group && <button className="btn danger block" onClick={delGroup}>Apagar todas as parcelas</button>}
    </Sheet>
  );
}

// ───────────────────────── Conta ─────────────────────────

const KIND_INFO: Record<AccountKind, { noun: string; hint: string; color: string }> = {
  checking: { noun: 'conta', color: '#4a8fe5', hint: 'Onde o dinheiro está agora: conta corrente, poupança ou carteira. Entradas somam e saídas subtraem do saldo.' },
  credit: { noun: 'cartão', color: '#111111', hint: 'As compras vão para a fatura e você paga depois. O que aparece é o que você deve, não dinheiro seu.' },
  investment: { noun: 'investimento', color: '#2f9e5b', hint: 'Dinheiro guardado que rende. Aportes e resgates você lança como transferência; o rendimento, atualizando o saldo.' },
};

const TITLES: Record<AccountKind, [string, string]> = {
  checking: ['Nova conta', 'Editar conta'],
  credit: ['Novo cartão', 'Editar cartão'],
  investment: ['Novo investimento', 'Editar investimento'],
};

function AccountEditor({ id, thenTx, reopenTx, onClose }: { id?: string; thenTx?: TxInit; reopenTx: (init: TxInit) => void; onClose: () => void }) {
  const s = useStore();
  const confirm = useConfirm();
  const existing = id ? s.accounts.find((a) => a.id === id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(existing?.kind ?? 'checking');
  const [initial, setInitial] = useState(existing && existing.initial_balance !== 0 ? String(existing.initial_balance).replace('.', ',') : ''); // zero = campo vazio (o campo de valor não guarda "0")
  const [closing, setClosing] = useState(existing?.closing_day ? String(existing.closing_day) : '');
  const [due, setDue] = useState(existing?.due_day ? String(existing.due_day) : '');
  const [limit, setLimit] = useState(existing?.credit_limit ? String(existing.credit_limit).replace('.', ',') : '');
  const [color, setColor] = useState(existing?.color ?? KIND_INFO.checking.color);
  const [colorTouched, setColorTouched] = useState(!!existing);
  const [isDefault, setIsDefault] = useState(existing?.is_default ?? !s.accounts.some((a) => a.is_default));
  const [limitCats, setLimitCats] = useState(isRestricted(existing));
  const [allowedIds, setAllowedIds] = useState<string[]>(() => (existing?.allowed_category_ids ?? []).filter((id) => s.categories.some((c) => c.id === id)));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const info = KIND_INFO[kind];
  const liveCats = s.categories.filter((c) => !c.archived);
  const outside = existing && limitCats ? s.transactions.filter((t) => t.account_id === existing.id && t.category_id && !allowedIds.includes(t.category_id)).length : 0;
  const duplicate = s.accounts.some((a) => a.id !== existing?.id && !a.archived && norm(a.name) === norm(name.trim()) && name.trim() !== '');
  const closingDay = Number(closing), dueDay = Number(due);
  const daysOk = closingDay >= 1 && closingDay <= 31 && dueDay >= 1 && dueDay <= 31;
  const [template, setTemplate] = useState<string | null>(null);
  const pickKind = (k: AccountKind) => {
    setKind(k);
    const t = BANK_TEMPLATES.find((x) => x.id === template);
    if (t) setName(templateName(t, k)); // trocar Conta ↔ Cartão ajusta o nome sugerido
    else if (!colorTouched) setColor(KIND_INFO[k].color);
  };
  const pickTemplate = (id: string) => {
    const t = BANK_TEMPLATES.find((x) => x.id === id)!;
    if (template === id) { setTemplate(null); return; }
    setTemplate(id); setName(templateName(t, kind)); setColor(t.color); setColorTouched(true);
  };

  const submit = async () => {
    if (sending.current) return;
    if (!name.trim()) return setError(`Dê um nome para o ${info.noun}.`);
    const init = kind === 'credit' ? 0 : initial.trim() ? (initial.trim().startsWith('-') ? -(parseAmount(initial.trim().slice(1)) ?? NaN) : parseAmount(initial)) : 0;
    if (init === null || Number.isNaN(init)) return setError(amountError(initial.trim().replace(/^-/, '')) || 'Saldo inicial inválido.');
    const c = closingDay, d = dueDay;
    if (kind === 'credit' && !daysOk) return setError('Informe o dia do fechamento e o do vencimento (1 a 31). Estão no app do seu banco.');
    if (kind !== 'investment' && limitCats && !allowedIds.length) return setError('Escolha pelo menos uma categoria, ou desligue o limite de categorias.');
    sending.current = true;
    setBusy(true);
    try {
      if (isDefault) for (const a of s.accounts.filter((a) => a.is_default && a.id !== existing?.id)) await s.save<Account>('accounts', { id: a.id, is_default: false });
      const savedAccount = await s.save<Account>('accounts', {
        ...(existing ? { id: existing.id } : {}), name: name.trim(), kind, initial_balance: init,
        closing_day: kind === 'credit' ? c : null, due_day: kind === 'credit' ? d : null,
        credit_limit: kind === 'credit' && limit ? parseAmount(limit) : null, color, is_default: kind === 'checking' && isDefault,
        archived: existing?.archived ?? false,
        // só envia o campo quando há o que guardar (assim quem não usa o recurso não depende da atualização do banco)
        ...(kind !== 'investment' && limitCats ? { allowed_category_ids: allowedIds } : isRestricted(existing) ? { allowed_category_ids: null } : {}),
      });
      s.toast(existing ? 'Conta atualizada' : 'Conta criada');
      // veio de um lançamento sem conta: volta para ele com a conta nova já escolhida e o que foi digitado
      if (!existing && thenTx) reopenTx({ ...thenTx, account_id: savedAccount.id });
      else onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não consegui salvar.';
      setError(/allowed_category_ids/.test(msg) ? 'Para limitar categorias, rode o arquivo supabase/schema.sql de novo no Supabase (passo a passo em docs/SETUP.md) e tente de novo.' : msg);
      sending.current = false;
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!existing) return;
    await s.save<Account>('accounts', { id: existing.id, archived: !existing.archived });
    onClose();
  };
  const del = async () => {
    if (!existing) return;
    const n = s.transactions.filter((t) => t.account_id === existing.id || t.to_account_id === existing.id).length;
    const ok = await confirm({ title: 'Apagar conta?', danger: true, confirmLabel: 'Apagar tudo',
      message: `"${existing.name}" e seus ${n} lançamento${n === 1 ? '' : 's'} serão apagados para sempre. Se só quer parar de usar a conta, prefira arquivar.` });
    if (!ok) return;
    await s.remove('accounts', [existing.id]);
    onClose();
  };

  const guardedClose = useGuardedClose(onClose, { name, kind, initial, closing, due, limit, color, isDefault, limitCats, allowedIds, template });
  return (
    <Sheet title={TITLES[kind][existing ? 1 : 0]} onClose={guardedClose}
      footer={
        <>
          {error && <p key={error} className="error-text shake" role="alert">{error}</p>}
          <div className="foot-actions"><button className="btn primary" onClick={submit} disabled={busy}>Salvar</button></div>
        </>
      }>
      {!existing && (
        <Segmented<AccountKind> value={kind} onChange={pickKind}
          options={[{ id: 'checking', label: 'Conta' }, { id: 'credit', label: 'Cartão' }, { id: 'investment', label: 'Investimento' }]} />
      )}
      <p className="muted kind-hint" key={kind}>{info.hint}</p>
      {!existing && kind !== 'investment' && (
        <Field label="Começar por um modelo" optional hint="Preenche o nome e a cor; você pode mudar depois.">
          <div className="chips" role="group" aria-label="Modelos de banco">
            {BANK_TEMPLATES.map((t) => (
              <button key={t.id} type="button" className={`chip ${template === t.id ? 'active' : ''}`} aria-pressed={template === t.id} onClick={() => pickTemplate(t.id)}>
                <span className="dot-color" style={{ background: t.color }} /> {t.label}
              </button>
            ))}
          </div>
        </Field>
      )}
      <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()} placeholder={kind === 'credit' ? 'Ex.: Nubank Cartão' : kind === 'investment' ? 'Ex.: Tesouro Selic' : 'Ex.: Nubank Conta'} />
        {duplicate && <small className="warn-text">Já existe uma conta com esse nome. Use nomes diferentes para o lançamento rápido saber qual escolher.</small>}
      </Field>
      {kind !== 'credit' && (
        <Field label={existing ? 'Saldo inicial (R$)' : 'Saldo atual (R$)'}>
          <MoneyInput className="input" value={initial} onChange={setInitial} allowNegative placeholder="0,00" />
          <small className="muted" style={{ paddingLeft: 4 }}>
            {existing ? 'Valor de partida. Para corrigir o saldo de hoje, use "Ajustar saldo" na tela da conta.'
              : kind === 'investment' ? 'Quanto você tem investido hoje.' : 'Quanto tem hoje. É a partir daqui que o Bolso soma e subtrai.'}
          </small>
        </Field>
      )}
      {kind === 'credit' && (
        <>
          <div className="grid2">
            <Field label="Dia do fechamento"><input className="input" inputMode="numeric" maxLength={2} value={closing} onChange={(e) => setClosing(e.target.value.replace(/\D/g, ''))} placeholder="Ex.: 10" /></Field>
            <Field label="Dia do vencimento"><input className="input" inputMode="numeric" maxLength={2} value={due} onChange={(e) => setDue(e.target.value.replace(/\D/g, ''))} placeholder="Ex.: 17" /></Field>
          </div>
          {daysOk ? (
            <p className="callout">Compras feitas até o dia <b>{closingDay}</b> entram na fatura do mês; depois disso, na do mês seguinte. A fatura vence no dia <b>{dueDay}</b>{dueDay <= closingDay ? ' do mês seguinte ao do fechamento' : ''}.</p>
          ) : (
            <p className="muted" style={{ fontSize: 13.5 }}>Fechamento e vencimento aparecem no app do seu banco, na tela da fatura.</p>
          )}
          <Field label="Limite do cartão (R$, opcional)">
            <MoneyInput className="input" value={limit} onChange={setLimit} placeholder="0,00" />
            <small className="muted" style={{ paddingLeft: 4 }}>Com o limite, o Bolso mostra quanto ainda está disponível.</small>
          </Field>
        </>
      )}
      {kind !== 'investment' && (
        <div className="field">
          <div className="row-field">
            <span>Limitar categorias<small className="field-hint" style={{ display: 'block', padding: 0 }}>{kind === 'credit' ? 'O cartão só aceita compras nas categorias que você escolher.' : 'Ex.: um vale-refeição que só aceita Alimentação, Lazer e Transporte.'}</small></span>
            <Switch checked={limitCats} onChange={setLimitCats} label="Limitar categorias" />
          </div>
          {limitCats && (
            <div className="stack" style={{ gap: 10 }}>
              {(['expense', 'income'] as const).map((k) => (
                <div key={k}>
                  <span className="lbl" style={{ display: 'block', marginBottom: 6 }}>{k === 'expense' ? 'Despesas' : 'Receitas'}</span>
                  <div className="chips">
                    {liveCats.filter((c) => c.kind === k).map((c) => (
                      <button key={c.id} type="button" className={`chip ${allowedIds.includes(c.id) ? 'active' : ''}`} aria-pressed={allowedIds.includes(c.id)}
                        onClick={() => setAllowedIds(allowedIds.includes(c.id) ? allowedIds.filter((x) => x !== c.id) : [...allowedIds, c.id])}>
                        <CategoryIcon name={c.icon} size={16} /> {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {outside > 0 && <p className="field-hint">{outside} lançamento{outside > 1 ? 's' : ''} antigo{outside > 1 ? 's' : ''} desta conta usa{outside > 1 ? 'm' : ''} outras categorias e continua{outside > 1 ? 'm' : ''} como {outside > 1 ? 'estão' : 'está'}.</p>}
            </div>
          )}
        </div>
      )}
      <Field label="Cor">
        <div className="swatches">
          {COLORS.map((c) => <button key={c} type="button" aria-label={`Cor ${c}`} className={`swatch ${color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => { setColor(c); setColorTouched(true); }} />)}
        </div>
      </Field>
      {kind === 'checking' && (
        <div className="row-field"><span>Usar no lançamento rápido<small className="field-hint" style={{ display: 'block', padding: 0 }}>Onde caem os lançamentos do campo da tela inicial.</small></span><Switch checked={isDefault} onChange={setIsDefault} label="Usar no lançamento rápido" /></div>
      )}
      {existing && (
        <div className="stack" style={{ marginTop: 8 }}>
          <button className="btn block" onClick={archive}>{existing.archived ? 'Reativar conta' : 'Arquivar conta'}</button>
          <button className="btn danger block" onClick={del}><Trash2 size={18} /> Apagar conta</button>
        </div>
      )}
    </Sheet>
  );
}

// ───────────────────────── Categoria ─────────────────────────

function CategoryEditor({ id, kind: initKind, onClose }: { id?: string; kind?: 'expense' | 'income'; onClose: () => void }) {
  const s = useStore();
  const existing = id ? s.categories.find((c) => c.id === id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState<'expense' | 'income'>(existing?.kind ?? initKind ?? 'expense');
  const [icon, setIcon] = useState(existing?.icon ?? 'tag');
  const [color, setColor] = useState(existing?.color ?? COLORS[0]);
  const [keywords, setKeywords] = useState((existing?.keywords ?? []).join(', '));
  const [budget, setBudget] = useState(existing?.budget_limit ? String(existing.budget_limit).replace('.', ',') : '');
  const [error, setError] = useState('');
  const sending = useRef(false);

  const submit = async () => {
    if (sending.current) return;
    if (!name.trim()) return setError('Dê um nome para a categoria.');
    const limit = budget.trim() ? parseAmount(budget) : null;
    if (budget.trim() && limit === null) return setError(amountError(budget));
    sending.current = true;
    try {
      await s.save<Category>('categories', {
        ...(existing ? { id: existing.id } : {}), name: name.trim(), kind, icon, color,
        keywords: [...new Set(keywords.split(/[,\n]/).map((k) => norm(k.trim())).filter(Boolean))],
        budget_limit: kind === 'expense' ? limit : null, archived: existing?.archived ?? false,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui salvar.');
      sending.current = false;
    }
  };
  const del = async () => {
    if (!existing) return;
    onClose();
    await s.removeCategoryWithUndo(existing);
  };

  const guardedClose = useGuardedClose(onClose, { name, kind, icon, color, keywords, budget });
  return (
    <Sheet title={existing ? 'Editar categoria' : 'Nova categoria'} onClose={guardedClose}
      footer={
        <>
          {error && <p key={error} className="error-text shake" role="alert">{error}</p>}
          <div className="foot-actions"><button className="btn primary" onClick={submit}>Salvar</button></div>
        </>
      }>
      {!existing && <Segmented value={kind} onChange={setKind} options={[{ id: 'expense', label: 'Despesa' }, { id: 'income', label: 'Receita' }]} />}
      <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      {kind === 'expense' && (
        <Field label="Limite mensal (R$, opcional)"><MoneyInput className="input" value={budget} onChange={setBudget} placeholder="Sem limite" /></Field>
      )}
      <Field label="Palavras-chave do campo rápido (separe por vírgula)">
        <input className="input" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="mercado, padaria, ifood" />
      </Field>
      <Field label="Ícone">
        <div className="icon-grid">
          {Object.keys(CATEGORY_ICONS).map((k) => (
            <button key={k} type="button" aria-label={k} className={icon === k ? 'active' : ''} onClick={() => setIcon(k)}><CategoryIcon name={k} size={20} /></button>
          ))}
        </div>
      </Field>
      <Field label="Cor">
        <div className="swatches">
          {COLORS.map((c) => <button key={c} type="button" aria-label={`Cor ${c}`} className={`swatch ${color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />)}
        </div>
      </Field>
      {existing && <button className="btn danger block" onClick={del}><Trash2 size={18} /> Apagar categoria</button>}
    </Sheet>
  );
}

// ───────────────────────── Recorrência ─────────────────────────

function RecurrenceEditor({ id, init, onClose }: { id?: string; init?: RecInit; onClose: () => void }) {
  const s = useStore();
  const existing = id ? s.recurrences.find((r) => r.id === id) : undefined;
  const [kind, setKind] = useState<'expense' | 'income'>(existing?.kind ?? init?.kind ?? 'expense');
  const [description, setDescription] = useState(existing?.description ?? init?.description ?? '');
  const [amount, setAmount] = useState(existing ? String(existing.amount).replace('.', ',') : '');
  const [accountId, setAccountId] = useState(existing?.account_id ?? defaultAccount(s.accounts)?.id ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(existing?.category_id ?? null);
  const [day, setDay] = useState(String(existing?.day_of_month ?? new Date().getDate()));
  const [start, setStart] = useState(existing?.start_month ?? monthOf(s.today));
  const [end, setEnd] = useState(existing?.end_month ?? '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [error, setError] = useState('');
  const recAccount = s.accounts.find((a) => a.id === accountId);
  const cats = allowedCategories(recAccount, s.categories.filter((c) => !c.archived && c.kind === kind));
  const sending = useRef(false);
  useEffect(() => { if (categoryId && !categoryAllowed(recAccount, categoryId)) setCategoryId(null); }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps
  const guardedClose = useGuardedClose(onClose, { kind, description, amount, accountId, categoryId, day, start, end, active });

  const submit = async () => {
    if (sending.current) return;
    const value = parseAmount(amount);
    const d = Number(day);
    if (!description.trim()) return setError('Dê um nome (ex.: Aluguel, Netflix).');
    if (!value) return setError(amountError(amount));
    if (!accountId) return setError('Crie uma conta primeiro.');
    if (recAccount && isRestricted(recAccount) && !categoryId) return setError(`Escolha uma categoria. ${restrictionText(recAccount, s.categories)}`);
    if (!(d >= 1 && d <= 31)) return setError('Dia do mês entre 1 e 31.');
    if (end && end < start) return setError('O mês final não pode ser antes do inicial.');
    sending.current = true;
    try {
      const saved = await s.save<Recurrence>('recurrences', {
        ...(existing ? { id: existing.id } : { last_generated_month: null }), description: description.trim(), amount: value, kind,
        account_id: accountId, category_id: categoryId, tags: existing?.tags ?? [], day_of_month: d, start_month: start,
        end_month: end || null, active,
      });
      if (active) await s.syncRecurrences(saved);
      s.toast(existing ? 'Recorrência atualizada' : 'Recorrência criada');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui salvar.');
      sending.current = false;
    }
  };
  const del = async () => {
    if (!existing) return;
    onClose();
    await s.removeWithUndo('recurrences', [existing], 'Recorrência apagada (lançamentos já criados foram mantidos)');
  };

  return (
    <Sheet title={existing ? 'Editar recorrência' : 'Nova recorrência'} onClose={guardedClose}
      footer={
        <>
          {error && <p key={error} className="error-text shake" role="alert">{error}</p>}
          <div className="foot-actions"><button className="btn primary" onClick={submit}>Salvar</button></div>
        </>
      }>
      <Segmented value={kind} onChange={(k) => { setKind(k); setCategoryId(null); }} options={[{ id: 'expense', label: 'Despesa' }, { id: 'income', label: 'Receita' }]} />
      <Field label="Nome"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Aluguel, Netflix" /></Field>
      <Field label="Valor mensal (R$)"><MoneyInput className="input" value={amount} onChange={setAmount} placeholder="0,00" /></Field>
      <Field label="Conta">
        <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {s.accounts.filter((a) => !a.archived && a.kind !== 'investment').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Categoria" hint={recAccount && isRestricted(recAccount) ? restrictionText(recAccount, s.categories) : undefined}>
        <div className="chips">
          {cats.map((c) => (
            <button key={c.id} type="button" className={`chip ${categoryId === c.id ? 'active' : ''}`} onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}>
              <CategoryIcon name={c.icon} size={16} /> {c.name}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid2">
        <Field label="Dia do mês"><input className="input" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
        <Field label="Começa em"><input className="input" type="month" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      </div>
      <Field label="Termina em (opcional)"><input className="input" type="month" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      <div className="row-field"><span>Ativa</span><Switch checked={active} onChange={setActive} label="Ativa" /></div>
      {existing && <button className="btn danger block" onClick={del}><Trash2 size={18} /> Apagar recorrência</button>}
    </Sheet>
  );
}

// ───────────────────────── Saldo de investimento ─────────────────────────

function SnapshotEditor({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const s = useStore();
  const acc = s.accounts.find((a) => a.id === accountId);
  const [balance, setBalance] = useState('');
  const [date, setDate] = useState(s.today);
  const [error, setError] = useState('');
  const sending = useRef(false);
  // o que o Bolso espera ter na data (último saldo + aportes): a diferença para o que você informa é o rendimento
  const expected = acc ? accountBalance(acc, s.transactions, s.investment_snapshots, date) : 0;
  const typed = balance.trim() === '0' ? 0 : parseAmount(balance);
  const gain = typed === null ? null : round2(typed - expected);
  const submit = async () => {
    if (sending.current) return;
    if (typed === null) return setError(balance.trim() ? amountError(balance) : 'Informe o saldo atual.');
    sending.current = true;
    try {
      await s.insertMany<Snapshot>('investment_snapshots', [{ account_id: accountId, date, balance: typed }]);
      s.toast(gain ? `Saldo atualizado · ${gain > 0 ? 'rendeu' : 'variou'} ${gain > 0 ? '+' : ''}${formatBRL(gain)}` : 'Saldo atualizado');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui salvar.');
      sending.current = false;
    }
  };
  return (
    <Sheet title="Atualizar saldo" onClose={onClose}
      footer={
        <>
          {error && <p key={error} className="error-text shake" role="alert">{error}</p>}
          <div className="foot-actions"><button className="btn primary" onClick={submit}>Salvar</button></div>
        </>
      }>
      <p className="muted">Olhe quanto tem hoje em <b>{acc?.name}</b> no app da corretora ou do banco e informe abaixo. O Bolso calcula o rendimento.</p>
      <Field label="Saldo atual (R$)"><MoneyInput className="input" value={balance} onChange={setBalance} onKeyDown={(e) => e.key === 'Enter' && void submit()} autoFocus placeholder="0,00" /></Field>
      {gain !== null && (
        <p className="callout">
          O Bolso esperava <b>{formatBRL(expected)}</b> (último saldo + aportes). {gain === 0 ? 'Bateu exatamente.' : <>Diferença: <b className={gain > 0 ? 'green' : 'red'}>{gain > 0 ? '+' : ''}{formatBRL(gain)}</b> {gain > 0 ? 'de rendimento' : 'de variação negativa'}.</>}
        </p>
      )}
      <Field label="Data do saldo"><input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
    </Sheet>
  );
}

// ───────────────────────── Ajustar saldo ─────────────────────────

function AdjustEditor({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const s = useStore();
  const acc = s.accounts.find((a) => a.id === accountId);
  const current = acc ? accountBalance(acc, s.transactions, s.investment_snapshots, s.today) : 0;
  const [real, setReal] = useState('');
  const [error, setError] = useState('');
  const sending = useRef(false);
  const neg = real.trim().startsWith('-');
  const parsed = real.trim() === '0' ? 0 : parseAmount(neg ? real.trim().slice(1) : real);
  const target = parsed === null ? null : neg ? -parsed : parsed;
  const diff = target === null ? null : round2(target - current);
  const submit = async () => {
    if (sending.current || !acc) return;
    if (diff === null) return setError('Informe o saldo que aparece no seu banco.');
    if (diff === 0) { s.toast('O saldo já está certo'); return onClose(); }
    sending.current = true;
    try {
      await s.addTransactions([{
        kind: diff > 0 ? 'income' : 'expense', amount: Math.abs(diff), date: s.today, description: 'Ajuste de saldo',
        notes: `Saldo informado: ${formatBRL(target ?? 0)}`, tags: ['ajuste'], status: 'paid', account_id: acc.id, to_account_id: null, category_id: null,
        installment_group: null, installment_number: null, installment_total: null, recurrence_id: null, ref_month: null, invoice_ref: null,
      }]);
      s.toast(`Saldo ajustado para ${formatBRL(target ?? 0)}`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui salvar.');
      sending.current = false;
    }
  };
  return (
    <Sheet title="Ajustar saldo" onClose={onClose}
      footer={
        <>
          {error && <p key={error} className="error-text shake" role="alert">{error}</p>}
          <div className="foot-actions"><button className="btn primary" onClick={submit}>Ajustar</button></div>
        </>
      }>
      <p className="muted">Compare com o saldo que aparece no app do banco. Se for diferente, o Bolso cria um lançamento de ajuste para os números baterem.</p>
      <div className="mini-stats solo" style={{ marginTop: 0 }}>
        <div className="mini"><span>Saldo no Bolso</span><b>{formatBRL(current)}</b></div>
        <div className="mini"><span>{acc?.name}</span><b>hoje</b></div>
      </div>
      <Field label="Saldo real (R$)"><MoneyInput className="input" value={real} onChange={setReal} allowNegative onKeyDown={(e) => e.key === 'Enter' && void submit()} autoFocus placeholder="0,00" /></Field>
      {diff !== null && (
        <p className="callout">{diff === 0 ? 'Já está certo, nada a ajustar.' : <>Será criado um lançamento de <b className={diff > 0 ? 'green' : 'red'}>{diff > 0 ? 'receita' : 'despesa'} de {formatBRL(Math.abs(diff))}</b> chamado "Ajuste de saldo", com a tag #ajuste.</>}</p>
      )}
    </Sheet>
  );
}
