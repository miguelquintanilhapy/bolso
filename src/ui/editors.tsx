import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { Sheet, SheetClosing } from './Sheet';
import { useConfirm } from './confirm';
import { Segmented, Switch } from './common';
import { CATEGORY_ICONS, CategoryIcon, COLORS } from './icons';
import type { Account, AccountKind, Category, NewTransaction, Recurrence, Snapshot, Transaction, TxKind } from '../lib/types';
import { buildInstallments, invoiceMonths, buildInvoice } from '../lib/finance';
import { formatBRL, parseAmount } from '../lib/money';
import { addDays, monthLabel, monthOf } from '../lib/dates';
import { norm } from '../lib/quickEntry';

export type TxInit = Partial<{
  kind: TxKind; amount: number; description: string; category_id: string | null; account_id: string; to_account_id: string | null;
  date: string; status: 'paid' | 'pending'; installments: number; tags: string[]; invoice_ref: string | null; keyword: string | null;
}>;

type Open =
  | { type: 'tx'; id?: string; init?: TxInit }
  | { type: 'account'; id?: string }
  | { type: 'category'; id?: string; kind?: 'expense' | 'income' }
  | { type: 'recurrence'; id?: string }
  | { type: 'snapshot'; accountId: string };

interface EditorApi {
  newTx: (init?: TxInit) => void;
  editTx: (id: string) => void;
  openAccount: (id?: string) => void;
  openCategory: (id?: string, kind?: 'expense' | 'income') => void;
  openRecurrence: (id?: string) => void;
  openSnapshot: (accountId: string) => void;
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
    openAccount: (id) => show({ type: 'account', id }),
    openCategory: (id, kind) => show({ type: 'category', id, kind }),
    openRecurrence: (id) => show({ type: 'recurrence', id }),
    openSnapshot: (accountId) => show({ type: 'snapshot', accountId }),
  }), [show]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <SheetClosing.Provider value={closing}>
        {open?.type === 'tx' && <TxEditor key={open.id ?? 'new'} id={open.id} init={open.init} onClose={close} />}
        {open?.type === 'account' && <AccountEditor id={open.id} onClose={close} />}
        {open?.type === 'category' && <CategoryEditor id={open.id} kind={open.kind} onClose={close} />}
        {open?.type === 'recurrence' && <RecurrenceEditor id={open.id} onClose={close} />}
        {open?.type === 'snapshot' && <SnapshotEditor accountId={open.accountId} onClose={close} />}
      </SheetClosing.Provider>
    </Ctx.Provider>
  );
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="field"><span className="lbl">{label}</span>{children}</div>
);

const defaultAccount = (accounts: Account[]) =>
  accounts.find((a) => a.is_default && !a.archived) ?? accounts.find((a) => a.kind === 'checking' && !a.archived) ?? accounts.find((a) => !a.archived);

// ───────────────────────── Lançamento ─────────────────────────

type DateMode = 'today' | 'yest' | 'other';

function TxEditor({ id, init, onClose }: { id?: string; init?: TxInit; onClose: () => void }) {
  const s = useStore();
  const existing = id ? s.transactions.find((t) => t.id === id) : undefined;
  const live = s.accounts.filter((a) => !a.archived);
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
  const [invoiceRef, setInvoiceRef] = useState<string | null>(existing?.invoice_ref ?? init?.invoice_ref ?? null);
  const [learn] = useState(init?.keyword ?? null);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false); // trava contra duplo toque (o estado `busy` só atualiza no próximo render)

  const account = s.accounts.find((a) => a.id === accountId);
  const toAccount = s.accounts.find((a) => a.id === toId);
  const isCard = account?.kind === 'credit';
  const catKind = kind === 'income' ? 'income' : 'expense';
  // categorias que você mais usa aparecem primeiro
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of s.transactions.slice(-500)) if (t.category_id && t.kind === catKind) m.set(t.category_id, (m.get(t.category_id) ?? 0) + 1);
    return m;
  }, [s.transactions, catKind]);
  const cats = s.categories
    .filter((c) => !c.archived && c.kind === catKind)
    .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.name.localeCompare(b.name));
  const value = parseAmount(amount);
  const cardMonths = toAccount?.kind === 'credit' ? invoiceMonths(toAccount, s.transactions, s.today) : [];
  const effStatus = isCard && kind !== 'transfer' ? 'paid' : status;
  const canInstall = !existing && kind !== 'transfer';
  const yesterday = addDays(s.today, -1);
  const dateMode: DateMode = showDate ? 'other' : date === s.today ? 'today' : date === yesterday ? 'yest' : 'other';

  const fail = (msg: string) => { setError(msg); setShake((n) => n + 1); };

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
    if (!value) return fail('Informe um valor maior que zero.');
    if (!accountId) return fail('Crie uma conta primeiro (aba Mais → Contas e cartões).');
    if (kind === 'transfer' && (!toId || toId === accountId)) return fail('Escolha uma conta de destino diferente da origem.');
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const finalTags = tagInput.trim() ? [...new Set([...tags, norm(tagInput.replace(/^#/, '').trim())])] : tags;
      const base: NewTransaction = {
        kind, amount: value, date, description: description.trim(), notes: notes.trim(), tags: finalTags,
        status: effStatus, account_id: accountId, to_account_id: kind === 'transfer' ? toId : null,
        category_id: kind === 'transfer' ? null : categoryId, installment_group: null, installment_number: null,
        installment_total: null, recurrence_id: null, ref_month: null,
        invoice_ref: kind === 'transfer' && toAccount?.kind === 'credit' ? invoiceRef : null,
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
      onClose();
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Não consegui salvar.');
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
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } };

  return (
    <Sheet title={existing ? 'Editar lançamento' : kind === 'income' ? 'Nova receita' : kind === 'transfer' ? 'Nova transferência' : 'Nova despesa'} onClose={onClose}
      footer={
        <>
          {error && <p key={shake} className="error-text shake" role="alert">{error}</p>}
          <div className="foot-actions">
            {existing && <button className="btn danger icon" onClick={del} aria-label="Apagar lançamento"><Trash2 size={19} /></button>}
            <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </>
      }>
      <Segmented<TxKind> value={kind} onChange={(k) => { setKind(k); setCategoryId(null); setCategoryTouched(false); }}
        options={[{ id: 'expense', label: 'Despesa' }, { id: 'income', label: 'Receita' }, { id: 'transfer', label: 'Transferência' }]} />
      <div className="amount-wrap">
        <small>Valor (R$)</small>
        <input className="amount-input" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)}
          onKeyDown={onEnter} aria-label="Valor" autoFocus={!existing} enterKeyHint="done" />
        {installments > 1 && value ? <small>{installments}x de {formatBRL(value / installments)}</small> : null}
      </div>

      {kind !== 'transfer' && (
        <Field label="Descrição">
          <input className="input" value={description} onChange={(e) => onDescription(e.target.value)} onKeyDown={onEnter} placeholder="Ex.: Mercado" enterKeyHint="done" />
        </Field>
      )}
      {kind !== 'transfer' && (
        <Field label="Categoria">
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
        {live.length <= 4 ? (
          <div className="chips">
            {live.map((a) => (
              <button key={a.id} type="button" className={`chip ${accountId === a.id ? 'active' : ''}`} aria-pressed={accountId === a.id} onClick={() => setAccountId(a.id)}>
                <span className="dot-color" style={{ background: a.color }} /> {a.name}
              </button>
            ))}
          </div>
        ) : (
          <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {live.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </Field>
      {kind === 'transfer' && (
        <>
          <Field label="Para">
            <div className="chips">
              {live.filter((a) => a.id !== accountId).map((a) => (
                <button key={a.id} type="button" className={`chip ${toId === a.id ? 'active' : ''}`} aria-pressed={toId === a.id} onClick={() => { setToId(a.id); setInvoiceRef(null); }}>
                  <span className="dot-color" style={{ background: a.color }} /> {a.name}
                </button>
              ))}
            </div>
          </Field>
          {cardMonths.length > 0 && toAccount && (
            <Field label="Pagamento da fatura de">
              <select className="select" value={invoiceRef ?? ''} onChange={(e) => setInvoiceRef(e.target.value || null)}>
                <option value="">Não é pagamento de fatura</option>
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

      {!(isCard && kind !== 'transfer') && (
        <Field label="Situação">
          <Segmented value={status} onChange={(v) => { setStatus(v); setStatusTouched(true); }}
            options={[{ id: 'paid', label: kind === 'income' ? 'Recebido' : 'Pago' }, { id: 'pending', label: 'Pendente' }]} />
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

      <Field label="Tags">
        <div className="chips">
          {tags.map((t) => (
            <span key={t} className="chip active">#{t}<button type="button" className="x" aria-label={`Remover ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}>×</button></span>
          ))}
        </div>
        <input className="input" value={tagInput} placeholder="Digite e pressione Enter" onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }} onBlur={addTag} />
      </Field>
      <Field label="Observação">
        <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
      </Field>
      {existing?.installment_group && <button className="btn danger block" onClick={delGroup}>Apagar todas as parcelas</button>}
    </Sheet>
  );
}

// ───────────────────────── Conta ─────────────────────────

function AccountEditor({ id, onClose }: { id?: string; onClose: () => void }) {
  const s = useStore();
  const confirm = useConfirm();
  const existing = id ? s.accounts.find((a) => a.id === id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(existing?.kind ?? 'checking');
  const [initial, setInitial] = useState(existing ? String(existing.initial_balance).replace('.', ',') : '');
  const [closing, setClosing] = useState(String(existing?.closing_day ?? 10));
  const [due, setDue] = useState(String(existing?.due_day ?? 17));
  const [limit, setLimit] = useState(existing?.credit_limit ? String(existing.credit_limit).replace('.', ',') : '');
  const [color, setColor] = useState(existing?.color ?? COLORS[9]);
  const [isDefault, setIsDefault] = useState(existing?.is_default ?? !s.accounts.some((a) => a.is_default));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  const submit = async () => {
    if (sending.current) return;
    if (!name.trim()) return setError('Dê um nome para a conta.');
    const init = initial.trim() ? (initial.trim().startsWith('-') ? -(parseAmount(initial.trim().slice(1)) ?? NaN) : parseAmount(initial)) : 0;
    if (init === null || Number.isNaN(init)) return setError('Saldo inicial inválido.');
    const c = Number(closing), d = Number(due);
    if (kind === 'credit' && !(c >= 1 && c <= 31 && d >= 1 && d <= 31)) return setError('Informe dias de fechamento e vencimento entre 1 e 31.');
    sending.current = true;
    setBusy(true);
    try {
      if (isDefault) for (const a of s.accounts.filter((a) => a.is_default && a.id !== existing?.id)) await s.save<Account>('accounts', { id: a.id, is_default: false });
      await s.save<Account>('accounts', {
        ...(existing ? { id: existing.id } : {}), name: name.trim(), kind, initial_balance: init,
        closing_day: kind === 'credit' ? c : null, due_day: kind === 'credit' ? d : null,
        credit_limit: kind === 'credit' && limit ? parseAmount(limit) : null, color, is_default: kind === 'checking' && isDefault,
        archived: existing?.archived ?? false,
      });
      s.toast(existing ? 'Conta atualizada' : 'Conta criada');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui salvar.');
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

  return (
    <Sheet title={existing ? 'Editar conta' : 'Nova conta'} onClose={onClose}
      footer={
        <>
          {error && <p key={error} className="error-text shake" role="alert">{error}</p>}
          <div className="foot-actions"><button className="btn primary" onClick={submit} disabled={busy}>Salvar</button></div>
        </>
      }>
      {!existing && (
        <Segmented<AccountKind> value={kind} onChange={setKind}
          options={[{ id: 'checking', label: 'Conta' }, { id: 'credit', label: 'Cartão' }, { id: 'investment', label: 'Investimento' }]} />
      )}
      <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()} placeholder={kind === 'credit' ? 'Ex.: Nubank Cartão' : kind === 'investment' ? 'Ex.: Tesouro Selic' : 'Ex.: Nubank Conta'} /></Field>
      <Field label={kind === 'investment' ? 'Saldo atual (R$)' : kind === 'credit' ? 'Saldo inicial do cartão (R$) — normalmente 0' : 'Saldo inicial (R$)'}>
        <input className="input" inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0,00" />
      </Field>
      {kind === 'credit' && (
        <>
          <div className="grid2">
            <Field label="Dia do fechamento"><input className="input" inputMode="numeric" value={closing} onChange={(e) => setClosing(e.target.value)} /></Field>
            <Field label="Dia do vencimento"><input className="input" inputMode="numeric" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          </div>
          <Field label="Limite (R$, opcional)"><input className="input" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="0,00" /></Field>
        </>
      )}
      <Field label="Cor">
        <div className="swatches">
          {COLORS.map((c) => <button key={c} type="button" aria-label={`Cor ${c}`} className={`swatch ${color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />)}
        </div>
      </Field>
      {kind === 'checking' && (
        <div className="row-field"><span>Conta padrão (campo rápido)</span><Switch checked={isDefault} onChange={setIsDefault} label="Conta padrão" /></div>
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
  const confirm = useConfirm();
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
    if (budget.trim() && limit === null) return setError('Limite inválido.');
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
    const ok = await confirm({ title: 'Apagar categoria?', danger: true, confirmLabel: 'Apagar',
      message: `Os lançamentos da categoria "${existing.name}" continuam, mas ficam sem categoria.` });
    if (!ok) return;
    await s.remove('categories', [existing.id]);
    onClose();
  };

  return (
    <Sheet title={existing ? 'Editar categoria' : 'Nova categoria'} onClose={onClose}
      footer={
        <>
          {error && <p key={error} className="error-text shake" role="alert">{error}</p>}
          <div className="foot-actions"><button className="btn primary" onClick={submit}>Salvar</button></div>
        </>
      }>
      {!existing && <Segmented value={kind} onChange={setKind} options={[{ id: 'expense', label: 'Despesa' }, { id: 'income', label: 'Receita' }]} />}
      <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      {kind === 'expense' && (
        <Field label="Limite mensal (R$, opcional)"><input className="input" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Sem limite" /></Field>
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

function RecurrenceEditor({ id, onClose }: { id?: string; onClose: () => void }) {
  const s = useStore();
  const existing = id ? s.recurrences.find((r) => r.id === id) : undefined;
  const [kind, setKind] = useState<'expense' | 'income'>(existing?.kind ?? 'expense');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [amount, setAmount] = useState(existing ? String(existing.amount).replace('.', ',') : '');
  const [accountId, setAccountId] = useState(existing?.account_id ?? defaultAccount(s.accounts)?.id ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(existing?.category_id ?? null);
  const [day, setDay] = useState(String(existing?.day_of_month ?? new Date().getDate()));
  const [start, setStart] = useState(existing?.start_month ?? monthOf(s.today));
  const [end, setEnd] = useState(existing?.end_month ?? '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [error, setError] = useState('');
  const cats = s.categories.filter((c) => !c.archived && c.kind === kind);
  const sending = useRef(false);

  const submit = async () => {
    if (sending.current) return;
    const value = parseAmount(amount);
    const d = Number(day);
    if (!description.trim()) return setError('Dê um nome (ex.: Aluguel, Netflix).');
    if (!value) return setError('Informe um valor maior que zero.');
    if (!accountId) return setError('Crie uma conta primeiro.');
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
    <Sheet title={existing ? 'Editar recorrência' : 'Nova recorrência'} onClose={onClose}
      footer={
        <>
          {error && <p key={error} className="error-text shake" role="alert">{error}</p>}
          <div className="foot-actions"><button className="btn primary" onClick={submit}>Salvar</button></div>
        </>
      }>
      <Segmented value={kind} onChange={(k) => { setKind(k); setCategoryId(null); }} options={[{ id: 'expense', label: 'Despesa' }, { id: 'income', label: 'Receita' }]} />
      <Field label="Nome"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Aluguel, Netflix" /></Field>
      <Field label="Valor mensal (R$)"><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></Field>
      <Field label="Conta">
        <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {s.accounts.filter((a) => !a.archived && a.kind !== 'investment').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Categoria">
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
  const submit = async () => {
    if (sending.current) return;
    const v = parseAmount(balance) ?? (balance.trim() === '0' ? 0 : null);
    if (v === null) return setError('Informe o saldo atual.');
    sending.current = true;
    try {
      await s.insertMany<Snapshot>('investment_snapshots', [{ account_id: accountId, date, balance: v }]);
      s.toast('Saldo atualizado');
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
      <p className="muted">Quanto tem hoje em <b>{acc?.name}</b>? O Bolso guarda o histórico para montar o gráfico do patrimônio.</p>
      <Field label="Saldo (R$)"><input className="input" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} autoFocus placeholder="0,00" /></Field>
      <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
    </Sheet>
  );
}
