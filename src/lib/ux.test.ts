import { describe, expect, it } from 'vitest';
import { collapseOverdue, findDuplicate, launchInfo, pendingWhen, previewEffect, suggestDescriptions } from './ux';
import type { Account, NewTransaction, Transaction } from './types';

const acc = (id: string, kind: Account['kind'], initial = 0): Account => ({ id, name: id, kind, initial_balance: initial, closing_day: 10, due_day: 17, credit_limit: null, color: '#000', is_default: false, archived: false } as unknown as Account);
const nt = (o: Partial<NewTransaction>): NewTransaction => ({ kind: 'expense', amount: 50, date: '2026-10-23', description: 'Mercado', notes: '', tags: [], status: 'paid', account_id: 'c', to_account_id: null, category_id: null, installment_group: null, installment_number: null, installment_total: null, recurrence_id: null, ref_month: null, invoice_ref: null, ...o });
const tx = (o: Partial<NewTransaction>, id = 't1'): Transaction => ({ id, ...nt(o) } as Transaction);
const today = '2026-10-23';

describe('previewEffect', () => {
  const accounts = [acc('c', 'checking', 1000), acc('x', 'credit')];
  it('despesa paga mostra saldo antes → depois', () => {
    const l = previewEffect({ base: nt({}), installments: 1, accounts, txs: [], snaps: [], today });
    expect(l).toHaveLength(1);
    expect(l[0]).toMatch(/c · .*1\.000,00 → .*950,00/);
  });
  it('pendente não altera o saldo', () => {
    expect(previewEffect({ base: nt({ status: 'pending' }), installments: 1, accounts, txs: [], snaps: [], today })[0]).toMatch(/pendente/);
  });
  it('data futura é agendada', () => {
    expect(previewEffect({ base: nt({ date: '2026-11-05' }), installments: 1, accounts, txs: [], snaps: [], today })[0]).toMatch(/05\/11/);
  });
  it('cartão mostra dívida', () => {
    const l = previewEffect({ base: nt({ account_id: 'x' }), installments: 3, accounts, txs: [], snaps: [], today });
    expect(l[0]).toMatch(/3× de .*16,66/);
    expect(l.join(' ')).toMatch(/x · você deve .*0,00 → .*16,66/);
  });
  it('editar ignora o próprio lançamento', () => {
    const l = previewEffect({ base: nt({ amount: 70 }), installments: 1, accounts, txs: [tx({ amount: 50 })], snaps: [], today, ignoreId: 't1' });
    expect(l[0]).toMatch(/1\.000,00 → .*930,00/);
  });
  it('transferência mostra as duas contas', () => {
    const a = [acc('c', 'checking', 1000), acc('d', 'checking', 0)];
    expect(previewEffect({ base: nt({ kind: 'transfer', to_account_id: 'd' }), installments: 1, accounts: a, txs: [], snaps: [], today })).toHaveLength(2);
  });
});

describe('duplicidade e sugestões', () => {
  it('acha lançamento igual, ignora outro valor e a si mesmo', () => {
    const list = [tx({})];
    expect(findDuplicate(list, nt({}))).toBeTruthy();
    expect(findDuplicate(list, nt({ amount: 51 }))).toBeFalsy();
    expect(findDuplicate(list, nt({ description: ' mercado ' }))).toBeTruthy();
    expect(findDuplicate(list, nt({}), 't1')).toBeFalsy();
  });
  it('sugere descrições parecidas, mais frequentes primeiro', () => {
    const list = [tx({ description: 'Padaria Pão Quente' }, 'a'), tx({ description: 'Padaria Pão Quente' }, 'b'), tx({ description: 'Padaria Nova' }, 'c')];
    const r = suggestDescriptions(list, 'expense', 'pad');
    expect(r.map((x) => x.description)).toEqual(['Padaria Pão Quente', 'Padaria Nova']);
    expect(suggestDescriptions(list, 'expense', 'p')).toEqual([]);
    expect(suggestDescriptions(list, 'income', 'pad')).toEqual([]);
  });
});

describe('collapseOverdue', () => {
  it('junta faturas atrasadas do mesmo cartão e mantém as outras', () => {
    const u = (id: string, date: string, amount: number, kind: 'invoice' | 'bill' = 'invoice') => ({ id, title: 'Fatura N', date, amount, kind, link: '/contas/1' });
    const r = collapseOverdue([u('1', '2026-08-17', 100), u('2', '2026-09-17', 200), u('3', '2026-10-25', 50), u('4', '2026-10-01', 10, 'bill')], today);
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ amount: 300, count: 2, date: '2026-08-17' });
  });
});

describe('pendingWhen', () => {
  it('receita futura "entra", nunca "vence"', () => {
    expect(pendingWhen(true, '2026-10-26', '2026-10-23')).toEqual({ text: 'Entra em 26 de out', tone: 'green' });
    expect(pendingWhen(true, '2026-10-24', '2026-10-23').text).toMatch(/^Entra amanhã · 24\/10$/);
    expect(pendingWhen(true, '2026-10-23', '2026-10-23').text).toMatch(/^Entra hoje/);
  });
  it('receita que não caiu não é "atrasada"', () => {
    const w = pendingWhen(true, '2026-10-20', '2026-10-23');
    expect(w.text).toBe('Previsto para 20/10 · ainda não recebido');
    expect(w.tone).toBe('amber');
    expect(w.text).not.toMatch(/atras|venc/i);
  });
  it('conta continua com vence/atrasado', () => {
    expect(pendingWhen(false, '2026-10-26', '2026-10-23').text).toMatch(/^Vence em/);
    expect(pendingWhen(false, '2026-10-20', '2026-10-23')).toEqual({ text: 'Atrasado desde 20/10', tone: 'red' });
  });
});

describe('launchInfo (horário do lançamento)', () => {
  const at = (y: number, m: number, d: number, h: number, mi: number) => new Date(y, m - 1, d, h, mi).toISOString(); // horário local
  it('mostra a hora local do registro', () => {
    const i = launchInfo({ created_at: at(2026, 10, 26, 14, 32), date: '2026-10-26' })!;
    expect(i.time).toBe('14:32');
    expect(i.sameDay).toBe(true);
    expect(i.full).toBe('26/10/2026 às 14:32');
    expect(i.csv).toBe('2026-10-26 14:32');
  });
  it('lançado num dia para uma data de outro dia: sameDay falso', () => {
    const i = launchInfo({ created_at: at(2026, 10, 26, 9, 5), date: '2026-10-25' })!;
    expect(i.sameDay).toBe(false);
    expect(i.dm).toBe('26/10');
    expect(i.time).toBe('09:05');
  });
  it('recorrência (criada sozinha) e sem horário não mostram', () => {
    expect(launchInfo({ created_at: at(2026, 10, 26, 8, 0), date: '2026-10-26', recurrence_id: 'r' })).toBeNull();
    expect(launchInfo({ date: '2026-10-26' })).toBeNull();
    expect(launchInfo({ created_at: 'lixo', date: '2026-10-26' })).toBeNull();
  });
});
