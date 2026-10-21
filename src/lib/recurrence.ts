import type { Account, NewTransaction, Recurrence } from './types';
import { addMonthsToMonth, dateInMonth, monthOf, monthRange } from './dates';

const MAX_CATCH_UP_MONTHS = 24;

/** Lançamentos que faltam gerar (do mês seguinte ao último gerado até o mês de hoje). */
export function planRecurrences(
  recurrences: Recurrence[],
  accounts: Account[],
  today: string,
): { tx: NewTransaction; recurrenceId: string; month: string }[] {
  const nowMonth = monthOf(today);
  const out: { tx: NewTransaction; recurrenceId: string; month: string }[] = [];
  for (const r of recurrences) {
    if (!r.active) continue;
    const from = r.last_generated_month ? addMonthsToMonth(r.last_generated_month, 1) : r.start_month;
    const start = from > addMonthsToMonth(nowMonth, -MAX_CATCH_UP_MONTHS) ? from : addMonthsToMonth(nowMonth, -MAX_CATCH_UP_MONTHS);
    const end = r.end_month && r.end_month < nowMonth ? r.end_month : nowMonth;
    if (start > end) continue;
    const isCard = accounts.find((a) => a.id === r.account_id)?.kind === 'credit';
    for (const month of monthRange(start, end)) {
      if (month < r.start_month) continue;
      out.push({
        recurrenceId: r.id,
        month,
        tx: {
          kind: r.kind,
          amount: r.amount,
          date: dateInMonth(month, r.day_of_month),
          description: r.description,
          notes: '',
          tags: r.tags,
          status: isCard ? 'paid' : 'pending',
          account_id: r.account_id,
          to_account_id: null,
          category_id: r.category_id,
          installment_group: null,
          installment_number: null,
          installment_total: null,
          recurrence_id: r.id,
          ref_month: month,
          invoice_ref: null,
        },
      });
    }
  }
  return out;
}

/** Total mensal comprometido por recorrências de despesa ativas. */
export const monthlyCommitted = (recurrences: Recurrence[]) =>
  Math.round(recurrences.filter((r) => r.active && r.kind === 'expense').reduce((s, r) => s + r.amount, 0) * 100) / 100;
