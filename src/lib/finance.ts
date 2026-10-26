import type { Account, Category, NewTransaction, Snapshot, Transaction } from './types';
import { addDays, addMonthsToDate, addMonthsToMonth, dateInMonth, endOfMonth, monthOf, monthRange } from './dates';
import { round2 } from './money';

/** Ordem das listas: dia mais recente primeiro e, dentro do dia, o último lançado em cima. */
export const newestFirst = (a: Transaction, b: Transaction) => b.date.localeCompare(a.date) || (b.created_at ?? '').localeCompare(a.created_at ?? '');

/** Conta no saldo: pago e já ocorrido (não pendente, não futuro). */
export const isEffective = (t: Transaction, asOf: string) => t.status === 'paid' && t.date <= asOf;

export function latestSnapshot(accountId: string, snaps: Snapshot[], asOf: string) {
  let best: Snapshot | undefined;
  for (const s of snaps) {
    if (s.account_id === accountId && s.date <= asOf && (!best || s.date >= best.date)) best = s;
  }
  return best;
}

/**
 * Saldo de uma conta numa data.
 * - Conta e cartão: saldo inicial + lançamentos efetivados (cartão negativo = dívida).
 * - Investimento: último saldo informado + aportes/resgates (transferências) feitos DEPOIS dele.
 *   Assim um aporte aparece na hora, e "Atualizar saldo" só precisa registrar o rendimento.
 */
export function accountBalance(acc: Account, txs: Transaction[], snaps: Snapshot[], asOf: string): number {
  if (acc.kind === 'investment') {
    const snap = latestSnapshot(acc.id, snaps, asOf);
    let bal = snap?.balance ?? acc.initial_balance;
    for (const t of txs) {
      if (t.kind !== 'transfer' || !isEffective(t, asOf)) continue;
      if (snap && t.date <= snap.date) continue; // já está contido no saldo informado
      if (t.to_account_id === acc.id) bal += t.amount;
      if (t.account_id === acc.id) bal -= t.amount;
    }
    return round2(bal);
  }
  // cartão de crédito não tem "saldo inicial": ele só poderia virar dinheiro (ou dívida) fantasma no patrimônio
  let bal = acc.kind === 'credit' ? 0 : acc.initial_balance;
  for (const t of txs) {
    if (!isEffective(t, asOf)) continue;
    if (t.kind === 'transfer') {
      if (t.account_id === acc.id) bal -= t.amount;
      if (t.to_account_id === acc.id) bal += t.amount;
    } else if (t.account_id === acc.id) {
      bal += t.kind === 'income' ? t.amount : -t.amount;
    }
  }
  return round2(bal);
}

export const activeAccounts = (accounts: Account[]) => accounts.filter((a) => !a.archived);

/** Patrimônio: contas + investimentos − dívida dos cartões. */
export function netWorth(accounts: Account[], txs: Transaction[], snaps: Snapshot[], asOf: string) {
  return round2(activeAccounts(accounts).reduce((s, a) => s + accountBalance(a, txs, snaps, asOf), 0));
}

/** Saldo disponível: só contas correntes. */
export function liquidBalance(accounts: Account[], txs: Transaction[], snaps: Snapshot[], asOf: string) {
  return round2(
    activeAccounts(accounts)
      .filter((a) => a.kind === 'checking')
      .reduce((s, a) => s + accountBalance(a, txs, snaps, asOf), 0),
  );
}

// ---------- Cartão de crédito ----------

/** Mês da fatura em que a compra cai: depois do fechamento, vai para a próxima. */
export function invoiceMonthOf(date: string, closingDay: number): string {
  const month = monthOf(date);
  return Number(date.slice(8, 10)) <= closingDay ? month : addMonthsToMonth(month, 1);
}

/** Vencimento da fatura: no mesmo mês do fechamento se o dia de vencimento for depois dele, senão no seguinte. */
export function invoiceDueDate(invoiceMonth: string, closingDay: number, dueDay: number): string {
  const dueMonth = dueDay > closingDay ? invoiceMonth : addMonthsToMonth(invoiceMonth, 1);
  return dateInMonth(dueMonth, dueDay);
}

export interface Invoice {
  month: string;
  total: number;
  paid: number;
  remaining: number;
  dueDate: string;
  closingDate: string;
  txs: Transaction[];
}

const cardDays = (card: Account) => ({ closing: card.closing_day ?? 28, due: card.due_day ?? 10 });

interface CardIndex {
  /** Compras do cartão agrupadas pelo mês da fatura. */
  byMonth: Map<string, Transaction[]>;
  /** Pagamentos efetivados que apontam para uma fatura. */
  explicit: Map<string, number>;
  /** Pagamentos soltos, abatidos da fatura mais antiga em aberto. */
  loose: Map<string, number>;
}

// Uma passada pelos lançamentos por cartão (em vez de uma por fatura): com milhares de lançamentos a tela inicial ficava lenta.
// A lista de lançamentos é imutável no app (cada mudança cria um array novo), então o cache por array é seguro.
const indexCache = new WeakMap<Transaction[], Map<string, { len: number; idx: CardIndex }>>();

function cardIndex(card: Account, txs: Transaction[]): CardIndex {
  const { closing } = cardDays(card);
  const key = `${card.id}|${closing}`;
  let perCard = indexCache.get(txs);
  if (!perCard) indexCache.set(txs, (perCard = new Map()));
  const hit = perCard.get(key);
  if (hit && hit.len === txs.length) return hit.idx;

  const byMonth = new Map<string, Transaction[]>();
  const explicit = new Map<string, number>();
  let pool = 0;
  for (const t of txs) {
    if (t.account_id === card.id && t.kind !== 'transfer') {
      const m = invoiceMonthOf(t.date, closing);
      const list = byMonth.get(m);
      if (list) list.push(t); else byMonth.set(m, [t]);
    } else if (t.kind === 'transfer' && t.to_account_id === card.id && t.status === 'paid') {
      if (t.invoice_ref) explicit.set(t.invoice_ref, (explicit.get(t.invoice_ref) ?? 0) + t.amount);
      else pool += t.amount;
    }
  }
  // pagamentos que não indicam a fatura são abatidos da mais antiga em aberto (como no banco)
  const loose = new Map<string, number>();
  for (const m of [...byMonth.keys()].sort()) {
    const need = (byMonth.get(m) ?? []).reduce((sum, t) => sum + (t.kind === 'income' ? -t.amount : t.amount), 0);
    const open = Math.max(0, round2(need - (explicit.get(m) ?? 0)));
    const used = Math.min(pool, open);
    if (used > 0) { loose.set(m, round2(used)); pool = round2(pool - used); }
  }
  const idx = { byMonth, explicit, loose };
  perCard.set(key, { len: txs.length, idx });
  return idx;
}

export function buildInvoice(card: Account, txs: Transaction[], month: string): Invoice {
  const { closing, due } = cardDays(card);
  const idx = cardIndex(card, txs);
  const own = [...(idx.byMonth.get(month) ?? [])];
  const total = round2(own.reduce((s, t) => s + (t.kind === 'income' ? -t.amount : t.amount), 0));
  // só pagamento efetivado conta: um pagamento agendado (pendente) ainda não pagou a fatura
  const paid = round2((idx.explicit.get(month) ?? 0) + (idx.loose.get(month) ?? 0));
  return {
    month,
    total,
    paid,
    remaining: round2(Math.max(0, total - paid)),
    dueDate: invoiceDueDate(month, closing, due),
    closingDate: dateInMonth(month, closing),
    txs: own.sort(newestFirst),
  };
}

/** Meses com movimento no cartão + o mês da fatura atual. */
export function invoiceMonths(card: Account, txs: Transaction[], today: string): string[] {
  const { closing } = cardDays(card);
  const set = new Set<string>([invoiceMonthOf(today, closing), ...cardIndex(card, txs).byMonth.keys()]);
  return [...set].sort();
}

// ---------- Parcelamento ----------

/** Divide em centavos; a última parcela absorve a diferença. */
export function splitInstallments(total: number, n: number): number[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  return Array.from({ length: n }, (_, i) => (i < n - 1 ? base : cents - base * (n - 1)) / 100);
}

export function buildInstallments(
  base: NewTransaction,
  n: number,
  isCard: boolean,
  today: string,
  groupId: string,
): NewTransaction[] {
  const parts = splitInstallments(base.amount, n);
  return parts.map((amount, i) => {
    const date = addMonthsToDate(base.date, i);
    return {
      ...base,
      amount,
      date,
      status: isCard ? 'paid' : date <= today && base.status === 'paid' ? 'paid' : 'pending',
      installment_group: groupId,
      installment_number: i + 1,
      installment_total: n,
    };
  });
}

// ---------- Resumos ----------

const inMonth = (t: Transaction, month: string) => monthOf(t.date) === month;

export function monthSummary(txs: Transaction[], month: string) {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (t.kind === 'transfer' || !inMonth(t, month)) continue;
    if (t.kind === 'income') income += t.amount;
    else expense += t.amount;
  }
  return { income: round2(income), expense: round2(expense), net: round2(income - expense) };
}

export function spendingByCategory(txs: Transaction[], month: string, kind: 'expense' | 'income' = 'expense') {
  const map = new Map<string | null, number>();
  for (const t of txs) {
    if (t.kind !== kind || !inMonth(t, month)) continue;
    map.set(t.category_id, (map.get(t.category_id) ?? 0) + t.amount);
  }
  return [...map.entries()]
    .map(([categoryId, total]) => ({ categoryId, total: round2(total) }))
    .sort((a, b) => b.total - a.total);
}

export type BudgetLevel = 'ok' | 'warn' | 'over';
export interface BudgetStatus {
  category: Category;
  limit: number;
  spent: number;
  remaining: number;
  ratio: number;
  level: BudgetLevel;
}

export function budgetStatuses(categories: Category[], txs: Transaction[], month: string): BudgetStatus[] {
  const spent = new Map(spendingByCategory(txs, month).map((s) => [s.categoryId, s.total]));
  return categories
    .filter((c) => c.kind === 'expense' && !c.archived && c.budget_limit != null && c.budget_limit > 0)
    .map((category) => {
      const limit = category.budget_limit as number;
      const s = spent.get(category.id) ?? 0;
      const ratio = s / limit;
      const level: BudgetLevel = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok';
      return { category, limit, spent: s, remaining: round2(limit - s), ratio, level };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

export interface Forecast {
  liquidNow: number;
  pendingIn: number;
  pendingOut: number;
  invoicesDue: number;
  projected: number;
}

/** Saldo previsto para o fim do mês: disponível agora ± pendentes do mês − faturas a vencer no mês. */
export function forecast(
  accounts: Account[],
  txs: Transaction[],
  snaps: Snapshot[],
  today: string,
): Forecast {
  const month = monthOf(today);
  const live = activeAccounts(accounts);
  const checking = new Set(live.filter((a) => a.kind === 'checking').map((a) => a.id));
  const liquidNow = liquidBalance(accounts, txs, snaps, today);

  let pendingIn = 0;
  let pendingOut = 0;
  for (const t of txs) {
    if (t.status !== 'pending' || monthOf(t.date) > month) continue; // atrasadas (mês anterior) também contam
    if (t.kind === 'transfer') {
      // pagamento agendado de fatura já está contado em "faturas a vencer": não desconta duas vezes
      const toCard = live.some((a) => a.id === t.to_account_id && a.kind === 'credit');
      if (checking.has(t.account_id) && !toCard) pendingOut += t.amount;
      if (t.to_account_id && checking.has(t.to_account_id)) pendingIn += t.amount;
    } else if (checking.has(t.account_id)) {
      if (t.kind === 'income') pendingIn += t.amount;
      else pendingOut += t.amount;
    }
  }

  let invoicesDue = 0;
  for (const card of live.filter((a) => a.kind === 'credit')) {
    for (const m of invoiceMonths(card, txs, today)) {
      const inv = buildInvoice(card, txs, m);
      if (inv.remaining > 0 && monthOf(inv.dueDate) <= month) invoicesDue += inv.remaining;
    }
  }

  return {
    liquidNow,
    pendingIn: round2(pendingIn),
    pendingOut: round2(pendingOut),
    invoicesDue: round2(invoicesDue),
    projected: round2(liquidNow + pendingIn - pendingOut - invoicesDue),
  };
}

export function monthlyEvolution(txs: Transaction[], endMonth: string, count: number) {
  const months = monthRange(addMonthsToMonth(endMonth, -(count - 1)), endMonth);
  return months.map((month) => ({ month, ...monthSummary(txs, month) }));
}

export function netWorthSeries(
  accounts: Account[],
  txs: Transaction[],
  snaps: Snapshot[],
  endMonth: string,
  count: number,
  today: string,
) {
  const months = monthRange(addMonthsToMonth(endMonth, -(count - 1)), endMonth);
  return months.map((month) => {
    const asOf = endOfMonth(month) > today ? today : endOfMonth(month);
    return { month, value: netWorth(accounts, txs, snaps, asOf) };
  });
}

/** Compromissos nos próximos `days` dias: pendentes e faturas a vencer. */
export interface Upcoming {
  id: string;
  title: string;
  date: string;
  amount: number;
  kind: 'bill' | 'income' | 'invoice';
  link: string;
}

export function upcoming(accounts: Account[], txs: Transaction[], today: string, days: number): Upcoming[] {
  const limit = addDays(today, days);
  const out: Upcoming[] = [];
  const byId = new Map(accounts.map((a) => [a.id, a]));
  for (const t of txs) {
    if (t.status !== 'pending' || t.date > limit) continue;
    if (byId.get(t.account_id)?.archived) continue;
    out.push({
      id: t.id,
      title: t.description || 'Lançamento',
      date: t.date,
      amount: t.amount,
      kind: t.kind === 'income' ? 'income' : 'bill',
      link: `/lancamentos/${t.id}`,
    });
  }
  for (const card of activeAccounts(accounts).filter((a) => a.kind === 'credit')) {
    for (const m of invoiceMonths(card, txs, today)) {
      const inv = buildInvoice(card, txs, m);
      if (inv.remaining > 0 && inv.dueDate <= limit) {
        out.push({ id: `inv-${card.id}-${m}`, title: `Fatura ${card.name}`, date: inv.dueDate, amount: inv.remaining, kind: 'invoice', link: `/contas/${card.id}` });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}


// ---------- Investimentos ----------

export interface InvestmentStats {
  balance: number;
  /** Aportes − resgates desde o começo. */
  contributed: number;
  /** Quanto rendeu: saldo − saldo inicial − aportes líquidos. */
  yieldTotal: number;
  /** Rendimento sobre o que foi colocado (saldo inicial + aportes), em %. null se não dá para calcular. */
  yieldPct: number | null;
  /** Rendimento do mês corrente (saldo agora − saldo do fim do mês passado − aportes do mês). */
  monthYield: number;
  /** Datas dos saldos informados (para saber se há histórico). */
  snapshots: number;
}

export function investmentStats(acc: Account, txs: Transaction[], snaps: Snapshot[], today: string): InvestmentStats {
  const balance = accountBalance(acc, txs, snaps, today);
  const flow = (from: string, to: string) =>
    round2(txs.reduce((sum, t) => {
      if (t.kind !== 'transfer' || !isEffective(t, to) || t.date <= from) return sum;
      return sum + (t.to_account_id === acc.id ? t.amount : t.account_id === acc.id ? -t.amount : 0);
    }, 0));
  const contributed = flow('0000-00-00', today);
  const yieldTotal = round2(balance - acc.initial_balance - contributed);
  const put = acc.initial_balance + txs.reduce((s, t) => s + (t.kind === 'transfer' && t.to_account_id === acc.id && isEffective(t, today) ? t.amount : 0), 0);
  const prevEnd = endOfMonth(addMonthsToMonth(monthOf(today), -1));
  const monthYield = round2(balance - accountBalance(acc, txs, snaps, prevEnd) - flow(prevEnd, today));
  return {
    balance, contributed, yieldTotal, monthYield,
    yieldPct: put > 0 ? Math.round((yieldTotal / put) * 10000) / 100 : null,
    snapshots: snaps.filter((x) => x.account_id === acc.id).length,
  };
}

// ---------- Cartão: visão geral ----------

export type InvoiceStatus = 'paid' | 'overdue' | 'closed' | 'open' | 'future';

/** paga · vencida · fechada (a pagar) · aberta (recebendo compras agora) · futura (parcelas) */
export function invoiceStatus(inv: Invoice, today: string): InvoiceStatus {
  if (inv.total > 0 && inv.remaining === 0) return 'paid';
  if (inv.remaining > 0 && inv.dueDate < today) return 'overdue';
  if (inv.closingDate < today) return inv.total > 0 ? 'closed' : 'paid';
  return inv.closingDate >= today && inv.month > monthOf(today) && inv.txs.every((t) => t.date > today) ? 'future' : 'open';
}

export interface CardOverview {
  invoices: Invoice[];
  /** Total ainda a pagar em todas as faturas (inclui parcelas futuras): é o que ocupa o limite. */
  committed: number;
  limitAvailable: number | null;
  limitUsedPct: number | null;
  /** Fatura que abre primeiro: a vencida mais antiga, senão a fechada a pagar, senão a atual. */
  focus: Invoice;
  overdue: Invoice[];
  toPay: Invoice[];
}

export function cardOverview(card: Account, txs: Transaction[], today: string): CardOverview {
  const invoices = invoiceMonths(card, txs, today).map((m) => buildInvoice(card, txs, m));
  const status = (i: Invoice) => invoiceStatus(i, today);
  const overdue = invoices.filter((i) => status(i) === 'overdue');
  const toPay = invoices.filter((i) => status(i) === 'closed' && i.remaining > 0);
  const current = invoices.find((i) => status(i) === 'open') ?? invoices[invoices.length - 1];
  const committed = round2(invoices.reduce((s, i) => s + i.remaining, 0));
  const limit = card.credit_limit;
  return {
    invoices, committed, overdue, toPay,
    focus: overdue[0] ?? toPay[0] ?? current,
    limitAvailable: limit ? round2(Math.max(0, limit - committed)) : null,
    limitUsedPct: limit ? Math.min(100, Math.round((committed / limit) * 100)) : null,
  };
}
