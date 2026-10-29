import { describe, expect, it } from 'vitest';
import type { Account, Category, Recurrence, Transaction } from './types';
import {
  accountBalance, budgetStatuses, buildInstallments, buildInvoice, cardOverview, forecast, invoiceDueDate,
  invoiceMonthOf, invoiceStatus, investmentStats, monthSummary, netWorth, netWorthSeries, splitInstallments, upcoming,
} from './finance';
import { parseQuickEntry } from './quickEntry';
import { planRecurrences } from './recurrence';
import { planNotifications } from './alerts';
import { parseAmount } from './money';
import { addMonthsToDate } from './dates';

const TODAY = '2026-10-21';
const acc = (o: Partial<Account>): Account => ({
  id: 'a', name: 'Conta', kind: 'checking', initial_balance: 0, closing_day: null, due_day: null,
  credit_limit: null, color: '#000', is_default: false, archived: false, ...o,
});
const tx = (o: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36), kind: 'expense', amount: 10, date: TODAY, description: '', notes: '', tags: [],
  status: 'paid', account_id: 'bank', to_account_id: null, category_id: null, installment_group: null,
  installment_number: null, installment_total: null, recurrence_id: null, ref_month: null, invoice_ref: null, ...o,
});
const cat = (o: Partial<Category>): Category => ({
  id: 'c', name: 'Cat', kind: 'expense', icon: 'tag', color: '#000', keywords: [], budget_limit: null, archived: false, ...o,
});

const bank = acc({ id: 'bank', name: 'Nubank Conta', initial_balance: 1000, is_default: true });
const card = acc({ id: 'card', name: 'Nubank Cartão', kind: 'credit', closing_day: 10, due_day: 17 });
const inv = acc({ id: 'inv', name: 'Tesouro', kind: 'investment', initial_balance: 5000 });

describe('saldos', () => {
  it('soma entradas, subtrai saídas e ignora pendentes e futuras', () => {
    const txs = [
      tx({ kind: 'income', amount: 500 }),
      tx({ amount: 100 }),
      tx({ amount: 999, status: 'pending' }),
      tx({ amount: 999, date: '2026-10-30' }),
    ];
    expect(accountBalance(bank, txs, [], TODAY)).toBe(1400);
  });
  it('transferência move o saldo entre contas', () => {
    const txs = [tx({ kind: 'transfer', amount: 200, account_id: 'bank', to_account_id: 'card' })];
    expect(accountBalance(bank, txs, [], TODAY)).toBe(800);
    expect(accountBalance(card, txs, [], TODAY)).toBe(200);
  });
  it('investimento usa o último saldo informado', () => {
    const snaps = [
      { id: '1', account_id: 'inv', date: '2026-08-01', balance: 5200 },
      { id: '2', account_id: 'inv', date: '2026-09-01', balance: 5400 },
    ];
    expect(accountBalance(inv, [], snaps, TODAY)).toBe(5400);
    expect(accountBalance(inv, [], snaps, '2026-08-15')).toBe(5200);
    expect(accountBalance(inv, [], [], TODAY)).toBe(5000);
  });
  it('patrimônio desconta a dívida do cartão', () => {
    const txs = [tx({ account_id: 'card', amount: 300, date: '2026-10-05' })];
    expect(netWorth([bank, card, inv], txs, [], TODAY)).toBe(1000 - 300 + 5000);
  });
});

describe('cartão de crédito', () => {
  it('compra depois do fechamento cai na fatura seguinte', () => {
    expect(invoiceMonthOf('2026-10-10', 10)).toBe('2026-10');
    expect(invoiceMonthOf('2026-10-11', 10)).toBe('2026-11');
    expect(invoiceMonthOf('2026-12-20', 10)).toBe('2027-01');
  });
  it('vencimento: mesmo mês se vence depois do fechamento, senão no seguinte', () => {
    expect(invoiceDueDate('2026-10', 10, 17)).toBe('2026-10-17');
    expect(invoiceDueDate('2026-10', 25, 5)).toBe('2026-11-05');
  });
  it('total da fatura, pagamento e restante', () => {
    const txs = [
      tx({ account_id: 'card', amount: 100, date: '2026-09-20' }), // fatura de outubro
      tx({ account_id: 'card', amount: 50, date: '2026-10-05' }), // fatura de outubro
      tx({ account_id: 'card', amount: 70, date: '2026-10-15' }), // fatura de novembro
      tx({ account_id: 'card', kind: 'income', amount: 20, date: '2026-10-06' }), // estorno
      tx({ kind: 'transfer', amount: 60, account_id: 'bank', to_account_id: 'card', invoice_ref: '2026-10' }),
    ];
    const i = buildInvoice(card, txs, '2026-10');
    expect(i.total).toBe(130);
    expect(i.paid).toBe(60);
    expect(i.remaining).toBe(70);
    expect(buildInvoice(card, txs, '2026-11').total).toBe(70);
  });
});

describe('parcelas', () => {
  it('divide em centavos e a última absorve a diferença', () => {
    expect(splitInstallments(100, 3)).toEqual([33.33, 33.33, 33.34]);
    expect(splitInstallments(300, 3)).toEqual([100, 100, 100]);
    expect(splitInstallments(100, 3).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
  });
  it('gera datas mensais, mantendo o dia (31 → fim do mês)', () => {
    expect(addMonthsToDate('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsToDate('2026-11-30', 3)).toBe('2027-02-28');
  });
  it('no cartão todas contam como pagas; em conta, as futuras ficam pendentes', () => {
    const { id: _id, ...base } = tx({ amount: 300, account_id: 'card' });
    void _id;
    const onCard = buildInstallments(base, 3, true, TODAY, 'g');
    expect(onCard.map((t) => t.status)).toEqual(['paid', 'paid', 'paid']);
    expect(onCard.map((t) => t.installment_number)).toEqual([1, 2, 3]);
    const onBank = buildInstallments(base, 3, false, TODAY, 'g');
    expect(onBank.map((t) => t.status)).toEqual(['paid', 'pending', 'pending']);
  });
});

describe('resumos, orçamento e previsão', () => {
  it('resumo do mês ignora transferências', () => {
    const txs = [
      tx({ kind: 'income', amount: 3000 }),
      tx({ amount: 200 }),
      tx({ kind: 'transfer', amount: 500, account_id: 'bank', to_account_id: 'inv' }),
      tx({ amount: 80, date: '2026-09-30' }),
    ];
    expect(monthSummary(txs, '2026-10')).toEqual({ income: 3000, expense: 200, net: 2800 });
  });
  it('orçamento: níveis ok / atenção (80%) / estourou (100%)', () => {
    const cats = [cat({ id: 'food', budget_limit: 500 }), cat({ id: 'fun', budget_limit: 100 }), cat({ id: 'trn', budget_limit: 100 })];
    const txs = [
      tx({ category_id: 'food', amount: 250 }),
      tx({ category_id: 'fun', amount: 85 }),
      tx({ category_id: 'trn', amount: 130 }),
    ];
    const lv = Object.fromEntries(budgetStatuses(cats, txs, '2026-10').map((b) => [b.category.id, b.level]));
    expect(lv).toEqual({ food: 'ok', fun: 'warn', trn: 'over' });
    expect(budgetStatuses(cats, txs, '2026-10')[0].category.id).toBe('trn'); // mais crítico primeiro
  });
  it('saldo previsto: disponível + pendentes − fatura a vencer', () => {
    const txs = [
      tx({ kind: 'income', amount: 500, status: 'pending', date: '2026-10-28' }),
      tx({ amount: 200, status: 'pending', date: '2026-10-25' }),
      tx({ amount: 100, status: 'pending', date: '2026-11-03' }), // mês que vem: não entra
      tx({ account_id: 'card', amount: 300, date: '2026-10-05' }), // fatura outubro, vence dia 17 e não está paga
    ];
    const f = forecast([bank, card], txs, [], '2026-10-01');
    expect(f).toMatchObject({ liquidNow: 1000, pendingIn: 500, pendingOut: 200, invoicesDue: 300, projected: 1000 });
  });
  it('próximos compromissos incluem pendentes e faturas', () => {
    const txs = [
      tx({ amount: 200, status: 'pending', date: '2026-10-23', description: 'Aluguel' }),
      tx({ account_id: 'card', amount: 300, date: '2026-10-05' }),
    ];
    const u = upcoming([bank, card], txs, '2026-10-21', 7);
    expect(u.map((x) => x.title)).toEqual(['Fatura Nubank Cartão', 'Aluguel']); // fatura vencida em 17/10 continua listada
    const u2 = upcoming([bank, card], txs, '2026-10-15', 7);
    expect(u2.map((x) => x.kind)).toEqual(['invoice']);
  });
  it('série de patrimônio por mês', () => {
    const txs = [tx({ kind: 'income', amount: 500, date: '2026-09-10' }), tx({ amount: 100, date: '2026-10-02' })];
    const s = netWorthSeries([bank], txs, [], '2026-10', 3, TODAY);
    expect(s.map((p) => p.value)).toEqual([1000, 1500, 1400]);
  });
});

describe('campo rápido', () => {
  const categories = [
    cat({ id: 'food', name: 'Alimentação', keywords: ['mercado', 'padaria'] }),
    cat({ id: 'sal', name: 'Salário', kind: 'income', keywords: ['salario'] }),
    cat({ id: 'tec', name: 'Compras', keywords: ['tv'] }),
  ];
  const ctx = { categories, accounts: [bank, card], today: TODAY };
  const ok = (s: string) => {
    const r = parseQuickEntry(s, ctx);
    if (!r.ok) throw new Error(r.reason);
    return r.draft;
  };
  it('valor + palavra', () => {
    expect(ok('50 mercado')).toMatchObject({ kind: 'expense', amount: 50, category_id: 'food', description: 'Mercado', date: TODAY });
  });
  it('entrada por + e por categoria de receita', () => {
    expect(ok('+3000 salário')).toMatchObject({ kind: 'income', amount: 3000, category_id: 'sal' });
    expect(ok('3000 salario')).toMatchObject({ kind: 'income' });
  });
  it('parcelas, conta e tags', () => {
    expect(ok('300 tv 3x cartão #casa')).toMatchObject({ amount: 300, installments: 3, account_id: 'card', tags: ['casa'], category_id: 'tec' });
  });
  it('datas relativas e dd/mm', () => {
    expect(ok('ontem 12 padaria').date).toBe('2026-10-20');
    expect(ok('12 padaria 05/10').date).toBe('2026-10-05');
  });
  it('palavra desconhecida mantém a palavra para aprender', () => {
    expect(ok('30 xyz')).toMatchObject({ category_id: null, keyword: 'xyz' });
  });
  it('sem valor é rejeitado', () => {
    expect(parseQuickEntry('só texto', ctx).ok).toBe(false);
  });
  it('valor padrão da palavra-chave: só a palavra já lança', () => {
    const cats = [cat({ id: 'food', name: 'Alimentação', keywords: ['cantina', 'mercado'], keyword_defaults: { cantina: 15.5 } })];
    const c2 = { categories: cats, accounts: [bank, card], today: TODAY };
    const r = parseQuickEntry('cantina', c2);
    expect(r.ok && r.draft).toMatchObject({ amount: 15.5, category_id: 'food', keyword: 'cantina', description: 'Cantina' });
    const r3 = parseQuickEntry('cantina 2x nubank cartão', c2);
    expect(r3.ok && r3.draft.amount).toBe(15.5);
    const typed = parseQuickEntry('20 cantina', c2); // valor digitado vence o padrão
    expect(typed.ok && typed.draft.amount).toBe(20);
  });
  it('sem valor e sem padrão: devolve o rascunho para abrir os detalhes', () => {
    const cats = [cat({ id: 'food', name: 'Alimentação', keywords: ['mercado'] })];
    const r = parseQuickEntry('mercado #casa', { categories: cats, accounts: [bank, card], today: TODAY });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.partial).toMatchObject({ category_id: 'food', description: 'Mercado', tags: ['casa'] });
  });
  it('formatos de valor', () => {
    expect(parseAmount('1.200,50')).toBe(1200.5);
    expect(parseAmount('R$15')).toBe(15);
    expect(parseAmount('1.200')).toBe(1200);
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('recorrências e avisos', () => {
  const rec: Recurrence = {
    id: 'r', description: 'Aluguel', amount: 1000, kind: 'expense', account_id: 'bank', category_id: null, tags: [],
    day_of_month: 5, start_month: '2026-08', end_month: null, last_generated_month: null, active: true,
  };
  it('gera os meses que faltam até o atual, sem repetir', () => {
    const plan = planRecurrences([rec], [bank], TODAY);
    expect(plan.map((p) => p.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(plan.every((p) => p.tx.status === 'pending')).toBe(true);
    expect(planRecurrences([{ ...rec, last_generated_month: '2026-10' }], [bank], TODAY)).toEqual([]);
    expect(planRecurrences([{ ...rec, active: false }], [bank], TODAY)).toEqual([]);
  });
  it('respeita mês final e dia curto (31 em fevereiro)', () => {
    const p = planRecurrences([{ ...rec, day_of_month: 31, start_month: '2026-02', end_month: '2026-02' }], [bank], TODAY);
    expect(p.map((x) => x.tx.date)).toEqual(['2026-02-28']);
  });
  it('recorrência no cartão já nasce paga', () => {
    expect(planRecurrences([{ ...rec, account_id: 'card' }], [card], TODAY)[0].tx.status).toBe('paid');
  });
  it('avisos de orçamento, fatura e atraso, sem repetir', () => {
    const cats = [cat({ id: 'food', name: 'Alimentação', budget_limit: 100 })];
    const txs = [
      tx({ category_id: 'food', amount: 90 }),
      tx({ account_id: 'card', amount: 300, date: '2026-10-05' }),
      tx({ amount: 50, status: 'pending', date: '2026-10-19', description: 'Luz', id: 'luz' }),
    ];
    const args = { categories: cats, accounts: [bank, card], txs, today: '2026-10-15', existingKeys: new Set<string>() };
    const keys = planNotifications(args).map((n) => n.dedupe_key);
    expect(keys).toContain('budget80:food:2026-10');
    expect(keys).toContain('invoice-due:card:2026-10');
    const again = planNotifications({ ...args, existingKeys: new Set(keys) });
    expect(again).toEqual([]);
    const late = planNotifications({ ...args, today: '2026-10-21', existingKeys: new Set() }).map((n) => n.dedupe_key);
    expect(late).toContain('invoice-overdue:card:2026-10');
    expect(late).toContain('pending-overdue:luz');
  });
});


describe('investimentos', () => {
  const snap = (date: string, balance: number) => ({ id: date, account_id: 'inv', date, balance });
  const aporte = (date: string, amount: number, from = 'bank', to = 'inv') => tx({ kind: 'transfer', amount, date, account_id: from, to_account_id: to });
  it('aporte aparece na hora no saldo do investimento e o patrimônio não cai', () => {
    const txs = [aporte('2026-10-20', 200)];
    expect(accountBalance(inv, txs, [], TODAY)).toBe(5200);
    expect(netWorth([bank, inv], txs, [], TODAY)).toBe(1000 - 200 + 5000 + 200);
  });
  it('aporte feito depois do último saldo informado soma; o anterior já está contido nele', () => {
    const snaps = [snap('2026-09-01', 5400)];
    expect(accountBalance(inv, [aporte('2026-08-20', 100), aporte('2026-09-10', 200)], snaps, TODAY)).toBe(5600);
  });
  it('resgate diminui o saldo', () => {
    expect(accountBalance(inv, [aporte('2026-10-10', 300, 'inv', 'bank')], [], TODAY)).toBe(4700);
  });
  it('rendimento = saldo − saldo inicial − aportes líquidos', () => {
    const txs = [aporte('2026-09-10', 200)];
    const st = investmentStats(inv, txs, [snap('2026-10-01', 5350)], TODAY);
    expect(st).toMatchObject({ balance: 5350, contributed: 200, yieldTotal: 150, snapshots: 1 });
    expect(st.yieldPct).toBeCloseTo(2.88, 1); // 150 / 5200
  });
  it('rendimento do mês ignora o aporte do próprio mês', () => {
    const txs = [aporte('2026-10-05', 500)];
    const st = investmentStats(inv, txs, [snap('2026-10-20', 5560)], TODAY);
    expect(st.monthYield).toBe(60); // 5560 − 5000 (fim de setembro) − 500
  });
});

describe('cartão de crédito: dados e leitura', () => {
  it('saldo inicial é ignorado (cartão não é dinheiro nem dívida inventada)', () => {
    expect(netWorth([bank, { ...card, initial_balance: 500 }], [], [], TODAY)).toBe(1000);
  });
  it('pagamento sem fatura indicada abate da mais antiga em aberto', () => {
    const txs = [
      tx({ account_id: 'card', amount: 300, date: '2026-08-05' }), // fatura de agosto
      tx({ account_id: 'card', amount: 200, date: '2026-09-05' }), // fatura de setembro
      tx({ kind: 'transfer', amount: 350, account_id: 'bank', to_account_id: 'card', date: TODAY }),
    ];
    expect(buildInvoice(card, txs, '2026-08').remaining).toBe(0);
    expect(buildInvoice(card, txs, '2026-09')).toMatchObject({ paid: 50, remaining: 150 });
  });
  it('pagamento com fatura indicada não é contado duas vezes', () => {
    const txs = [
      tx({ account_id: 'card', amount: 300, date: '2026-08-05' }),
      tx({ account_id: 'card', amount: 200, date: '2026-09-05' }),
      tx({ kind: 'transfer', amount: 200, account_id: 'bank', to_account_id: 'card', invoice_ref: '2026-09', date: TODAY }),
    ];
    expect(buildInvoice(card, txs, '2026-09').remaining).toBe(0);
    expect(buildInvoice(card, txs, '2026-08').remaining).toBe(300);
  });
  it('estado de cada fatura e qual abre primeiro', () => {
    const txs = [
      tx({ account_id: 'card', amount: 100, date: '2026-08-05' }), // agosto: venceu 17/08
      tx({ account_id: 'card', amount: 150, date: '2026-09-12' }), // outubro: fechou 10/10, vence 17/10 (venceu)
      tx({ account_id: 'card', amount: 80, date: '2026-10-15' }), // novembro: aberta
    ];
    const ov = cardOverview(card, txs, TODAY);
    const st = Object.fromEntries(ov.invoices.map((i) => [i.month, invoiceStatus(i, TODAY)]));
    expect(st).toMatchObject({ '2026-08': 'overdue', '2026-10': 'overdue', '2026-11': 'open' });
    expect(ov.focus.month).toBe('2026-08'); // a vencida mais antiga primeiro
    expect(ov.committed).toBe(330);
  });
  it('limite disponível desconta tudo que ainda vai ser pago, inclusive parcelas futuras', () => {
    const c = { ...card, credit_limit: 1000 };
    const txs = [tx({ account_id: 'card', amount: 300, date: '2026-10-05' }), tx({ account_id: 'card', amount: 200, date: '2026-12-05' })];
    expect(cardOverview(c, txs, TODAY)).toMatchObject({ committed: 500, limitAvailable: 500, limitUsedPct: 50 });
  });
  it('"cartão" no campo rápido escolhe o único cartão de crédito', () => {
    const ctx = { categories: [] as Category[], accounts: [bank, card], today: TODAY };
    const r = parseQuickEntry('300 tv 3x cartão', ctx);
    expect(r.ok && r.draft.account_id).toBe('card');
    const p = parseQuickEntry('50 mercado conta', { ...ctx, accounts: [{ ...bank, name: 'Itaú' }, card] });
    expect(p.ok && p.draft.account_id).toBeNull();
    expect(p.ok && p.draft.description).toBe('Mercado');
  });
});
