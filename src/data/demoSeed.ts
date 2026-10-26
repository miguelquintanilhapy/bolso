import type { Db } from './api';
import { DEFAULT_CATEGORIES } from './defaults';
import type { Account, Category, Transaction } from '../lib/types';
import { addDays, addMonthsToMonth, dateInMonth, monthOf } from '../lib/dates';

/** Dados de exemplo para testar a interface em modo demo (use ?demo na URL). */
export async function seedDemo(db: Db, today: string) {
  const cats = await db.insert<Category>('categories', DEFAULT_CATEGORIES.map((c) => ({ ...c, archived: false, budget_limit:
    { Alimentação: 900, Transporte: 300, Lazer: 250, Moradia: 2200, Compras: 300 }[c.name] ?? null })));
  const cat = (n: string) => cats.find((c) => c.name === n)!.id;
  const [bank, card, inv] = await db.insert<Account>('accounts', [
    { name: 'Nubank Conta', kind: 'checking', initial_balance: 2500, color: '#8a05be', is_default: true, archived: false },
    { name: 'Nubank Cartão', kind: 'credit', initial_balance: 0, closing_day: 10, due_day: 17, credit_limit: 8000, color: '#111111', is_default: false, archived: false },
    { name: 'Tesouro Selic', kind: 'investment', initial_balance: 12000, color: '#16a34a', is_default: false, archived: false },
  ]);
  const m = monthOf(today);
  const base = { notes: '', tags: [], to_account_id: null, installment_group: null, installment_number: null, installment_total: null, recurrence_id: null, ref_month: null, invoice_ref: null };
  const rows: object[] = [];
  for (let i = -3; i <= 0; i++) {
    const mm = addMonthsToMonth(m, i);
    const d = (day: number) => dateInMonth(mm, day);
    const past = (day: number) => d(day) <= today;
    rows.push(
      { ...base, kind: 'income', amount: 7800, date: d(5), description: 'Salário', category_id: cat('Salário'), account_id: bank.id, status: past(5) ? 'paid' : 'pending' },
      { ...base, kind: 'expense', amount: 2100, date: d(8), description: 'Aluguel', category_id: cat('Moradia'), account_id: bank.id, status: past(8) ? 'paid' : 'pending' },
      { ...base, kind: 'expense', amount: 214.9 + i * 11, date: d(12), description: 'Mercado', category_id: cat('Alimentação'), account_id: card.id, status: 'paid' },
      { ...base, kind: 'expense', amount: 89.9, date: d(14), description: 'Internet', category_id: cat('Moradia'), account_id: bank.id, status: past(14) ? 'paid' : 'pending' },
      { ...base, kind: 'expense', amount: 55.5 - i * 4, date: d(16), description: 'Uber', category_id: cat('Transporte'), account_id: card.id, status: 'paid' },
      { ...base, kind: 'expense', amount: 39.9, date: d(18), description: 'Netflix', category_id: cat('Lazer'), account_id: card.id, status: 'paid' },
      { ...base, kind: 'expense', amount: 142.3 + i * 7, date: d(20), description: 'Restaurante', category_id: cat('Alimentação'), account_id: card.id, status: 'paid', tags: ['saidas'] },
    );
    if (i < 0) rows.push({ ...base, kind: 'transfer', amount: 300, date: d(6), description: 'Aporte', category_id: null, account_id: bank.id, to_account_id: inv.id, status: 'paid' });
  }
  rows.push({ ...base, kind: 'expense', amount: 38.4, date: today, description: 'Padaria', category_id: cat('Alimentação'), account_id: bank.id, status: 'paid' });
  rows.push({ ...base, kind: 'expense', amount: 120, date: addDays(today, 2), description: 'Dentista', category_id: cat('Saúde'), account_id: bank.id, status: 'pending', notes: 'Retorno às 15h' });
  await db.insert<Transaction>('transactions', rows);
  await db.insert('investment_snapshots', [
    { account_id: inv.id, date: addDays(today, -60), balance: 12300 },
    { account_id: inv.id, date: addDays(today, -30), balance: 12650 },
    { account_id: inv.id, date: addDays(today, -2), balance: 12980 },
  ]);
  await db.insert('recurrences', [
    { description: 'Aluguel', amount: 2100, kind: 'expense', account_id: bank.id, category_id: cat('Moradia'), tags: [], day_of_month: 8, start_month: addMonthsToMonth(m, -3), end_month: null, last_generated_month: m, active: true },
    { description: 'Netflix', amount: 39.9, kind: 'expense', account_id: card.id, category_id: cat('Lazer'), tags: [], day_of_month: 18, start_month: addMonthsToMonth(m, -3), end_month: null, last_generated_month: m, active: true },
  ]);
}
