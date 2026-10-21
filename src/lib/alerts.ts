import type { Account, AppNotification, Category, Transaction } from './types';
import { budgetStatuses, buildInvoice, invoiceMonths, activeAccounts } from './finance';
import { diffDays, monthLabel, monthOf, shortDate } from './dates';
import { formatBRL } from './money';

export type NewNotification = Omit<AppNotification, 'id' | 'created_at' | 'read'>;

/** Avisos calculados por regra. A chave de deduplicação garante um aviso por evento. */
export function planNotifications(args: {
  categories: Category[];
  accounts: Account[];
  txs: Transaction[];
  today: string;
  existingKeys: Set<string>;
}): NewNotification[] {
  const { categories, accounts, txs, today, existingKeys } = args;
  const month = monthOf(today);
  const out: NewNotification[] = [];
  const push = (n: NewNotification) => { if (!existingKeys.has(n.dedupe_key)) out.push(n); };

  for (const b of budgetStatuses(categories, txs, month)) {
    const name = b.category.name;
    if (b.level === 'over') {
      push({
        kind: 'budget', dedupe_key: `budget100:${b.category.id}:${month}`, link: '/orcamentos',
        title: `Orçamento de ${name} estourou`,
        body: `Você gastou ${formatBRL(b.spent)} de ${formatBRL(b.limit)} em ${monthLabel(month, false)}.`,
      });
    } else if (b.level === 'warn') {
      push({
        kind: 'budget', dedupe_key: `budget80:${b.category.id}:${month}`, link: '/orcamentos',
        title: `${name} em ${Math.round(b.ratio * 100)}% do orçamento`,
        body: `Restam ${formatBRL(b.remaining)} de ${formatBRL(b.limit)}.`,
      });
    }
  }

  for (const card of activeAccounts(accounts).filter((a) => a.kind === 'credit')) {
    for (const m of invoiceMonths(card, txs, today)) {
      const inv = buildInvoice(card, txs, m);
      if (inv.remaining <= 0) continue;
      const days = diffDays(inv.dueDate, today);
      if (days < 0) {
        push({ kind: 'invoice', dedupe_key: `invoice-overdue:${card.id}:${m}`, link: `/contas/${card.id}`,
          title: `Fatura ${card.name} em atraso`, body: `${formatBRL(inv.remaining)} venceu em ${shortDate(inv.dueDate)}.` });
      } else if (days <= 3) {
        push({ kind: 'invoice', dedupe_key: `invoice-due:${card.id}:${m}`, link: `/contas/${card.id}`,
          title: days === 0 ? `Fatura ${card.name} vence hoje` : `Fatura ${card.name} vence em ${days} dia${days > 1 ? 's' : ''}`,
          body: `${formatBRL(inv.remaining)} até ${shortDate(inv.dueDate)}.` });
      }
    }
  }

  for (const t of txs) {
    if (t.status !== 'pending' || t.kind === 'income') continue;
    const days = diffDays(t.date, today);
    const name = t.description || 'Lançamento';
    if (days < 0) {
      push({ kind: 'pending', dedupe_key: `pending-overdue:${t.id}`, link: `/lancamentos/${t.id}`,
        title: `${name} está atrasado`, body: `${formatBRL(t.amount)} com vencimento em ${shortDate(t.date)}.` });
    } else if (days <= 1) {
      push({ kind: 'pending', dedupe_key: `pending-due:${t.id}`, link: `/lancamentos/${t.id}`,
        title: days === 0 ? `${name} vence hoje` : `${name} vence amanhã`, body: `${formatBRL(t.amount)} pendente.` });
    }
  }
  return out;
}
