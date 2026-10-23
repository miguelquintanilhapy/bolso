import type { Account, Snapshot, Transaction } from './types';
import { accountBalance, cardOverview, invoiceStatus, investmentStats, type InvoiceStatus } from './finance';
import { monthLabel } from './dates';
import { formatBRL, round2 } from './money';

export interface AccountInfo {
  /** O número que importa para esse tipo de conta (saldo, o que falta pagar na fatura, saldo investido). */
  main: number;
  /** Texto curto sob o número: "a pagar", "fatura de outubro"… */
  caption: string;
  /** Linha de apoio: vencimento, limite livre, rendimento do mês… */
  sub: string;
  tone?: 'green' | 'red';
  /** Só cartão: situação da fatura em foco. */
  status?: InvoiceStatus;
  limitUsedPct: number | null;
}

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${formatBRL(Math.abs(n))}`;
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Como cada tipo de conta é resumido: conta mostra o saldo; cartão, a fatura; investimento, o saldo e o rendimento. */
export function describeAccount(a: Account, txs: Transaction[], snaps: Snapshot[], today: string): AccountInfo {
  if (a.kind === 'credit') {
    const ov = cardOverview(a, txs, today);
    const due = [...ov.overdue, ...ov.toPay];
    const payNow = round2(due.reduce((x, i) => x + i.remaining, 0));
    const f = due[0] ?? ov.focus;
    const status = invoiceStatus(f, today);
    const limit = ov.limitAvailable != null ? ` · limite livre ${formatBRL(ov.limitAvailable)}` : '';
    return payNow > 0
      ? { main: payNow, caption: 'a pagar', sub: `${status === 'overdue' ? 'Venceu' : 'Vence'} ${dm(f.dueDate)}${limit}`, tone: status === 'overdue' ? 'red' : undefined, status, limitUsedPct: ov.limitUsedPct }
      : { main: f.total, caption: `fatura de ${monthLabel(f.month, false)}`, sub: `Fecha ${dm(f.closingDate)}${limit}`, status, limitUsedPct: ov.limitUsedPct };
  }
  if (a.kind === 'investment') {
    const st = investmentStats(a, txs, snaps, today);
    return {
      main: st.balance, caption: '',
      sub: st.snapshots === 0 ? 'Atualize o saldo para ver o rendimento' : st.monthYield !== 0 ? `${signed(st.monthYield)} no mês` : 'Sem rendimento registrado no mês',
      tone: st.monthYield > 0 ? 'green' : st.monthYield < 0 ? 'red' : undefined, limitUsedPct: null,
    };
  }
  return { main: accountBalance(a, txs, snaps, today), caption: '', sub: a.is_default ? 'Conta padrão do campo rápido' : '', limitUsedPct: null };
}
