// Testes de qualidade: dados aleatórios (semente fixa, reproduzível) e casos de borda dos cálculos.
import { describe, expect, it } from 'vitest';
import type { Account, Category, Recurrence, Snapshot, Transaction } from './types';
import {
  accountBalance, budgetStatuses, buildInstallments, buildInvoice, cardOverview, forecast, invoiceDueDate, invoiceMonthOf,
  investmentStats, monthSummary, netWorth, netWorthSeries, splitInstallments,
} from './finance';
import { addDays, addMonthsToDate, dayLabel, dateInMonth, diffDays, monthRange, toISO } from './dates';
import { amountError, compactBRL, formatBRL, parseAmount, round2, splitBRL } from './money';
import { parseQuickEntry } from './quickEntry';
import { planRecurrences } from './recurrence';
import { transactionsToCSV } from './exports';

// gerador pseudoaleatório com semente (mulberry32)
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const T = '2026-10-23';
const acc = (o: Partial<Account>): Account => ({ id: 'a', name: 'X', kind: 'checking', initial_balance: 0, closing_day: null, due_day: null, credit_limit: null, color: '#000', is_default: false, archived: false, ...o });
const tx = (o: Partial<Transaction>): Transaction => ({ id: Math.random().toString(36).slice(2), kind: 'expense', amount: 10, date: T, description: '', notes: '', tags: [], status: 'paid', account_id: 'bank', to_account_id: null, category_id: null, installment_group: null, installment_number: null, installment_total: null, recurrence_id: null, ref_month: null, invoice_ref: null, ...o });
const cat = (o: Partial<Category>): Category => ({ id: 'c', name: 'C', kind: 'expense', icon: 'tag', color: '#000', keywords: [], budget_limit: null, archived: false, ...o });
const bank = acc({ id: 'bank', initial_balance: 1000 });
const bank2 = acc({ id: 'bank2', initial_balance: 0 });
const card = acc({ id: 'card', kind: 'credit', closing_day: 10, due_day: 17 });
const inv = acc({ id: 'inv', kind: 'investment', initial_balance: 500 });

describe('cálculo de saldo com dados aleatórios (referência em centavos inteiros)', () => {
  it('saldo de conta == soma exata em centavos, em 300 cenários', () => {
    const r = rng(42);
    for (let run = 0; run < 300; run++) {
      const txs: Transaction[] = [];
      let cents = 100000;
      const n = Math.floor(r() * 60);
      for (let i = 0; i < n; i++) {
        const c = 1 + Math.floor(r() * 500000); // 0,01 a 5.000,00
        const kind = r() < 0.4 ? 'income' : r() < 0.7 ? 'expense' : 'transfer';
        const status = r() < 0.8 ? 'paid' : 'pending';
        const date = addDays(T, Math.floor(r() * 120) - 100);
        const eff = status === 'paid' && date <= T;
        if (kind === 'transfer') {
          const out = r() < 0.5;
          txs.push(tx({ kind, amount: c / 100, status, date, account_id: out ? 'bank' : 'bank2', to_account_id: out ? 'bank2' : 'bank' }));
          if (eff) cents += out ? -c : c;
        } else {
          txs.push(tx({ kind, amount: c / 100, status, date, account_id: 'bank' }));
          if (eff) cents += kind === 'income' ? c : -c;
        }
      }
      expect(Math.round(accountBalance(bank, txs, [], T) * 100)).toBe(cents);
    }
  });

  it('patrimônio não muda com transferências entre contas próprias (só movem dinheiro)', () => {
    const r = rng(7);
    for (let run = 0; run < 100; run++) {
      const base = [tx({ kind: 'income', amount: 500, date: '2026-10-01' })];
      const moves = Array.from({ length: 1 + Math.floor(r() * 10) }, () => tx({ kind: 'transfer', amount: round2(r() * 300 + 0.01), date: '2026-10-05', account_id: 'bank', to_account_id: 'bank2' }));
      expect(netWorth([bank, bank2], [...base, ...moves], [], T)).toBe(netWorth([bank, bank2], base, [], T));
    }
  });

  it('aportar e resgatar em investimento não muda o patrimônio', () => {
    const r = rng(11);
    for (let run = 0; run < 100; run++) {
      const txs = Array.from({ length: 1 + Math.floor(r() * 8) }, () => {
        const out = r() < 0.5; const amount = round2(r() * 200 + 0.01);
        return tx({ kind: 'transfer', amount, date: addDays(T, -Math.floor(r() * 30)), account_id: out ? 'bank' : 'inv', to_account_id: out ? 'inv' : 'bank' });
      });
      const w = netWorth([bank, inv], txs, [], T);
      expect(w).toBe(1500); // 1000 (conta) + 500 (investimento) — transferir nunca cria nem some dinheiro
    }
  });

  it('série de patrimônio termina igual ao patrimônio de hoje', () => {
    const txs = [tx({ kind: 'income', amount: 300, date: '2026-08-10' }), tx({ amount: 120.5, date: '2026-10-02' }), tx({ account_id: 'card', amount: 99.9, date: '2026-09-05' })];
    const snaps: Snapshot[] = [{ id: 's', account_id: 'inv', date: '2026-09-15', balance: 640 }];
    const series = netWorthSeries([bank, card, inv], txs, snaps, '2026-10', 6, T);
    expect(series[series.length - 1].value).toBe(netWorth([bank, card, inv], txs, snaps, T));
  });
});

describe('parcelas', () => {
  it('soma exata e nenhuma parcela zerada, para qualquer total e quantidade (fuzz)', () => {
    const r = rng(99);
    for (let run = 0; run < 2000; run++) {
      const n = 2 + Math.floor(r() * 47);
      const cents = n + Math.floor(r() * 2_000_000); // a partir de 1 centavo por parcela
      const parts = splitInstallments(cents / 100, n);
      expect(parts.length).toBe(n);
      expect(Math.round(parts.reduce((a, b) => a + b, 0) * 100)).toBe(cents);
      expect(Math.min(...parts)).toBeGreaterThan(0);
    }
  });
  it('total menor que 1 centavo por parcela gera parcela zerada (o formulário precisa barrar)', () => {
    expect(Math.min(...splitInstallments(0.02, 3))).toBe(0);
  });
  it('datas das parcelas: dia 31 vai para o último dia, inclusive ano bissexto e virada de ano', () => {
    expect(addMonthsToDate('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsToDate('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonthsToDate('2026-12-31', 2)).toBe('2027-02-28');
    expect(addMonthsToDate('2026-03-31', -1)).toBe('2026-02-28');
    const base = tx({ amount: 100, date: '2026-01-31', account_id: 'card' });
    const dates = buildInstallments(base, 5, true, T, 'g').map((p) => p.date);
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });
});

describe('fatura do cartão: bordas', () => {
  it('fechamento 31 e vencimento 31 em meses curtos', () => {
    const c = acc({ id: 'card', kind: 'credit', closing_day: 31, due_day: 31 });
    expect(invoiceMonthOf('2026-02-28', 31)).toBe('2026-02');
    expect(invoiceMonthOf('2026-04-30', 31)).toBe('2026-04');
    expect(buildInvoice(c, [], '2026-02').closingDate).toBe('2026-02-28');
    expect(invoiceDueDate('2026-02', 31, 31)).toBe('2026-03-31'); // vence depois (31 ≤ 31 → mês seguinte)
  });
  it('vencimento antes do fechamento cai no mês seguinte', () => {
    expect(invoiceDueDate('2026-12', 25, 5)).toBe('2027-01-05');
  });
  it('compra no último dia do mês com fechamento 30 em fevereiro', () => {
    expect(invoiceMonthOf('2026-02-28', 30)).toBe('2026-02');
    expect(invoiceMonthOf('2028-02-29', 30)).toBe('2028-02');
  });
  it('estorno maior que as compras deixa a fatura com total negativo sem "falta pagar"', () => {
    const txs = [tx({ account_id: 'card', amount: 50, date: '2026-10-05' }), tx({ account_id: 'card', kind: 'income', amount: 80, date: '2026-10-06' })];
    const i = buildInvoice(card, txs, '2026-10');
    expect(i.total).toBe(-30);
    expect(i.remaining).toBe(0);
  });
  it('pagamento maior que a fatura não cria dívida negativa nem some em outra fatura', () => {
    const txs = [tx({ account_id: 'card', amount: 100, date: '2026-10-05' }), tx({ kind: 'transfer', amount: 250, account_id: 'bank', to_account_id: 'card', date: T })];
    const i = buildInvoice(card, txs, '2026-10');
    expect(i.remaining).toBe(0);
    expect(i.paid).toBe(100);
  });
  it('pagamento AGENDADO (pendente) não marca a fatura como paga', () => {
    const txs = [tx({ account_id: 'card', amount: 100, date: '2026-10-05' }), tx({ kind: 'transfer', amount: 100, account_id: 'bank', to_account_id: 'card', invoice_ref: '2026-10', status: 'pending', date: '2026-10-30' })];
    expect(buildInvoice(card, txs, '2026-10').remaining).toBe(100);
  });
  it('pagamento agendado da fatura não é descontado duas vezes na previsão do mês', () => {
    const txs = [tx({ account_id: 'card', amount: 100, date: '2026-10-05' }), tx({ kind: 'transfer', amount: 100, account_id: 'bank', to_account_id: 'card', invoice_ref: '2026-10', status: 'pending', date: '2026-10-30' })];
    const f = forecast([bank, card], txs, [], T);
    expect(f.projected).toBe(900); // 1000 de saldo − 100 da fatura (uma vez só)
  });
});

describe('investimento: bordas', () => {
  it('sem saldo informado e sem aportes: rendimento zero e sem percentual indefinido', () => {
    const st = investmentStats(acc({ id: 'inv', kind: 'investment', initial_balance: 0 }), [], [], T);
    expect(st.yieldTotal).toBe(0);
    expect(st.yieldPct).toBeNull();
    expect(Number.isFinite(st.monthYield)).toBe(true);
  });
  it('dois saldos informados no mesmo dia: vale o último lançado', () => {
    const snaps: Snapshot[] = [{ id: '1', account_id: 'inv', date: '2026-10-01', balance: 600 }, { id: '2', account_id: 'inv', date: '2026-10-01', balance: 650 }];
    expect(accountBalance(inv, [], snaps, T)).toBe(650);
  });
  it('resgate maior que o saldo deixa saldo negativo visível (não some)', () => {
    expect(accountBalance(inv, [tx({ kind: 'transfer', amount: 900, date: '2026-10-10', account_id: 'inv', to_account_id: 'bank' })], [], T)).toBe(-400);
  });
});

describe('orçamento e resumos', () => {
  it('exatamente 80% e 100% mudam de nível', () => {
    const cs = [cat({ id: 'a', budget_limit: 100 })];
    const lvl = (v: number) => budgetStatuses(cs, [tx({ category_id: 'a', amount: v })], '2026-10')[0].level;
    expect([lvl(79.99), lvl(80), lvl(99.99), lvl(100)]).toEqual(['ok', 'warn', 'warn', 'over']);
  });
  it('limite zero e categoria arquivada não geram divisão por zero nem aparecem', () => {
    const cs = [cat({ id: 'a', budget_limit: 0 }), cat({ id: 'b', budget_limit: 50, archived: true })];
    expect(budgetStatuses(cs, [tx({ category_id: 'a', amount: 10 })], '2026-10')).toEqual([]);
  });
  it('resumo do mês ignora transferências e inclui o mês certo na virada de ano', () => {
    const txs = [tx({ amount: 10, date: '2026-12-31' }), tx({ amount: 20, date: '2027-01-01' }), tx({ kind: 'transfer', amount: 99, date: '2026-12-31', account_id: 'bank', to_account_id: 'bank2' })];
    expect(monthSummary(txs, '2026-12').expense).toBe(10);
    expect(monthSummary(txs, '2027-01').expense).toBe(20);
  });
});

describe('recorrências', () => {
  const rec = (o: Partial<Recurrence>): Recurrence => ({ id: 'r', description: 'R', amount: 10, kind: 'expense', account_id: 'bank', category_id: null, tags: [], day_of_month: 31, start_month: '2026-01', end_month: null, last_generated_month: null, active: true, ...o });
  it('dia 31 respeita cada mês, incluindo fevereiro bissexto', () => {
    const plan = planRecurrences([rec({ start_month: '2028-01', end_month: '2028-03' })], [bank], '2028-03-15');
    expect(plan.map((p) => p.tx.date)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31']);
  });
  it('não gera nada antes do início nem depois do fim, e nunca repete meses', () => {
    expect(planRecurrences([rec({ start_month: '2027-01' })], [bank], T)).toEqual([]);
    const p = planRecurrences([rec({ start_month: '2026-06', end_month: '2026-08', day_of_month: 5 })], [bank], T);
    expect(p.map((x) => x.month)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(new Set(p.map((x) => x.month)).size).toBe(p.length);
  });
  it('recorrência muito antiga gera no máximo 25 meses de atraso', () => {
    expect(planRecurrences([rec({ start_month: '2010-01', day_of_month: 5 })], [bank], T).length).toBeLessThanOrEqual(25);
  });
});

describe('datas e fuso horário', () => {
  it('diffDays e dayLabel não erram em horário de verão nem na virada de ano', () => {
    expect(diffDays('2026-11-01', '2026-10-31')).toBe(1);
    expect(diffDays('2026-03-09', '2026-03-08')).toBe(1);
    expect(diffDays('2027-01-01', '2026-12-31')).toBe(1);
    expect(dayLabel('2026-12-31', '2027-01-01')).toBe('Ontem');
    expect(dayLabel(T, T)).toBe('Hoje');
  });
  it('percorrer meses e dias é consistente em qualquer fuso', () => {
    expect(monthRange('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(toISO(new Date(2026, 9, 31))).toBe('2026-10-31');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(dateInMonth('2026-02', 31)).toBe('2026-02-28');
  });
});

describe('valores e formatação', () => {
  it('nunca mostra "-R$ 0,00"', () => {
    expect(formatBRL(-0.004)).not.toMatch(/^-/);
    expect(formatBRL(-0)).not.toMatch(/^-/);
    expect(splitBRL(-0.004).sign).toBe('');
  });
  it('abreviação de milhares não arredonda para "1000 mil"', () => {
    expect(compactBRL(999_999)).not.toMatch(/1000/);
    expect(compactBRL(1_000_000)).toBe('1,0 mi');
    expect(compactBRL(-12_500)).toBe('-13 mil');
  });
  it('valores muito grandes continuam legíveis', () => {
    expect(formatBRL(999_999_999.99)).toBe('R$ 999.999.999,99');
  });
  it('parseAmount: lixo e formatos estranhos nunca viram valor', () => {
    for (const bad of ['', ' ', 'abc', '1e5', '--5', '1,2,3', '1.2.3', '0', '0,00', '-0', '١٢٣', '１２３', '5 5', ',5', '.', 'R$', '9'.repeat(400) + 'x']) {
      expect(parseAmount(bad), `entrada: ${JSON.stringify(bad).slice(0, 30)}`).toBeNull();
    }
  });
  it('parseAmount: formatos válidos', () => {
    expect(parseAmount('1.234.567,89')).toBe(1234567.89);
    expect(parseAmount('R$ 12,5')).toBe(12.5);
    expect(parseAmount('0,01')).toBe(0.01);
    expect(parseAmount('+99')).toBe(99);
    expect(parseAmount('5,')).toBe(5); // vírgula sobrando no fim é tolerada
  });
  it('parseAmount: nunca devolve número fora do que o banco aceita (numeric(14,2))', () => {
    const v = parseAmount('99999999999999999');
    expect(v === null || v < 1e12).toBe(true);
  });
});

describe('valores: entradas ambíguas são recusadas, não adivinhadas', () => {
  it.each(['1,2,3', '12,345,678', '1.2.3', '1,239', '0,001', '1.000.000.000.000,00', '99999999999999999'])('recusa %s', (v) => {
    expect(parseAmount(v)).toBeNull();
  });
  it('dá o motivo certo', () => {
    expect(amountError('1,239')).toMatch(/2 casas/);
    expect(amountError('1.000.000.000.000,00')).toMatch(/muito alto/);
    expect(amountError('0')).toMatch(/maior que zero/);
    expect(amountError('abc')).toMatch(/inválido/);
    expect(amountError('12,5')).toBe('');
  });
  it('mantém os formatos corretos', () => {
    expect([parseAmount('1.234,5'), parseAmount('23.5'), parseAmount('1.200'), parseAmount('999.999.999,99')]).toEqual([1234.5, 23.5, 1200, 999999999.99]);
  });
});

describe('exportação CSV: injeção de fórmula', () => {
  it('neutraliza texto que começa com = + - @ (o Excel executaria)', () => {
    const csv = transactionsToCSV([tx({ description: '=HYPERLINK("http://x","clique")', notes: '@SUM(A1)', tags: ['+cmd'] })], [bank], []);
    expect(csv).toContain("\"'=HYPERLINK(");
    expect(csv).toContain("\"'@SUM(A1)\"");
    expect(csv).toContain("\"'+cmd\"");
    expect(csv).not.toMatch(/;"=HYPERLINK/);
  });
  it('não mexe em texto normal nem no valor numérico', () => {
    const csv = transactionsToCSV([tx({ description: 'Mercado', amount: 12.5 })], [bank], []);
    expect(csv).toContain('"Mercado"');
    expect(csv).toContain('"12,50"');
  });
});

describe('campo rápido: entradas hostis', () => {
  const ctx = { categories: [cat({ id: 'food', name: 'Alimentação', keywords: ['mercado'] })], accounts: [bank, card], today: T };
  it('qualquer texto aleatório responde sem quebrar, e o valor é sempre válido', () => {
    const r = rng(2026);
    const pieces = ['50', 'mercado', '+', '-', '#', '#tag', '3x', '1x', '99x', 'ontem', '31/02', '05/13', '00/00', 'R$', '1.2.3', '١٢٣', '🙂', '‮', 'x'.repeat(300), '<script>alert(1)</script>', "'; drop table accounts;--", '${7*7}', '%s', '\\', '\n', '\t', 'cartão', 'conta', 'nubank', 'hoje', '0', '9'.repeat(25)];
    for (let i = 0; i < 3000; i++) {
      const text = Array.from({ length: Math.floor(r() * 7) }, () => pieces[Math.floor(r() * pieces.length)]).join(r() < 0.5 ? ' ' : '');
      const res = parseQuickEntry(text, ctx);
      if (res.ok) {
        expect(Number.isFinite(res.draft.amount) && res.draft.amount > 0, `valor inválido para ${JSON.stringify(text).slice(0, 50)}`).toBe(true);
        expect(/^\d{4}-\d{2}-\d{2}$/.test(res.draft.date)).toBe(true);
        expect(res.draft.installments).toBeGreaterThanOrEqual(1);
        expect(res.draft.installments).toBeLessThanOrEqual(99);
      }
    }
  });
  it('parcelas absurdas (99x) são recusadas com aviso, em vez de criar dezenas de lançamentos', () => {
    const res = parseQuickEntry('100 tv 99x cartão', ctx);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.reason).toMatch(/48/);
  });
  it('valor pequeno demais para o número de parcelas é recusado', () => {
    const res = parseQuickEntry('0,02 bala 3x', ctx);
    expect(!res.ok && res.reason).toMatch(/pequeno demais/);
  });
  it('valor inválido explica o problema em vez de "não achei um valor"', () => {
    const res = parseQuickEntry('mercado 1,2,3', ctx);
    expect(!res.ok && res.reason).toMatch(/inválido/);
  });
  it('data inválida não vira "hoje" silenciosamente dentro da descrição', () => {
    const res = parseQuickEntry('10 mercado 31/02', ctx);
    expect(res.ok && res.draft.date).toBe(T); // data inexistente é ignorada
  });
});

describe('cartão: visão geral', () => {
  it('cardOverview com cartão sem nenhuma compra não quebra', () => {
    const ov = cardOverview(card, [], T);
    expect(ov.committed).toBe(0);
    expect(ov.focus).toBeTruthy();
  });
});
