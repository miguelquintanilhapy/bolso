import { describe, expect, it } from 'vitest';
import { applyChanges, newestStamp, sinceFor } from './sync';

const empty = () => ({ accounts: [], categories: [], transactions: [], recurrences: [], notifications: [], investment_snapshots: [] }) as Record<string, { id: string; updated_at?: string }[]>;
const T = (n: number) => `2026-10-${String(n).padStart(2, '0')}T12:00:00.000Z`;

describe('sincronização incremental', () => {
  it('newestStamp: maior carimbo; null se faltar em alguma linha', () => {
    const d = empty();
    d.transactions = [{ id: 'a', updated_at: T(3) }, { id: 'b', updated_at: T(9) }];
    d.accounts = [{ id: 'c', updated_at: T(5) }];
    expect(newestStamp(d as never)).toBe(T(9));
    d.accounts.push({ id: 'x' });
    expect(newestStamp(d as never)).toBeNull();
    expect(newestStamp(empty() as never)).toBeNull();
  });
  it('sinceFor recua a margem de segurança', () => {
    expect(sinceFor(T(10))).toBe('2026-10-10T11:59:00.000Z');
  });
  it('aplica alteração, inclusão e exclusão', () => {
    const base = empty();
    base.transactions = [{ id: 'a', updated_at: T(1) }, { id: 'b', updated_at: T(1) }];
    const r = applyChanges(base as never, { transactions: [{ id: 'b', updated_at: T(5) }, { id: 'c', updated_at: T(6) }] }, [{ tbl: 'transactions', id: 'a', deleted_at: T(7) }], T(4));
    const ids = (r.data as never as typeof base).transactions.map((x) => x.id).sort();
    expect(ids).toEqual(['b', 'c']);
    expect(r.syncedAt).toBe(T(7));
  });
  it('não mexe nas tabelas sem novidade (mesma referência)', () => {
    const base = empty();
    base.accounts = [{ id: 'z', updated_at: T(1) }];
    const r = applyChanges(base as never, { transactions: [{ id: 'n', updated_at: T(2) }] }, [], T(1));
    expect((r.data as never as typeof base).accounts).toBe(base.accounts);
  });
  it('recriar a mesma linha depois de excluir vence a exclusão', () => {
    const base = empty();
    const r = applyChanges(base as never, { categories: [{ id: 'k', updated_at: T(9) }] }, [{ tbl: 'categories', id: 'k', deleted_at: T(8) }], T(1));
    expect((r.data as never as typeof base).categories.map((x) => x.id)).toEqual(['k']);
  });
  it('é idempotente: aplicar duas vezes dá o mesmo resultado', () => {
    const base = empty();
    base.transactions = [{ id: 'a', updated_at: T(1) }];
    const ch = { transactions: [{ id: 'a', updated_at: T(5) }, { id: 'b', updated_at: T(6) }] };
    const del = [{ tbl: 'transactions' as const, id: 'q', deleted_at: T(5) }];
    const once = applyChanges(base as never, ch, del, T(1));
    const twice = applyChanges(once.data, ch, del, once.syncedAt);
    expect(twice.data).toEqual(once.data);
  });
});
