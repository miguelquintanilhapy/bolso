import type { DeletedRow, Db, SessionUser, Table } from './api';

const KEY = 'bolso:demo:v1';
const USER: SessionUser = { id: 'demo-user', email: 'demo@bolso.local' };
type Store = Record<Table, Record<string, unknown>[]> & { deleted_rows: DeletedRow[] };
const empty = (): Store => ({ accounts: [], categories: [], transactions: [], recurrences: [], notifications: [], investment_snapshots: [], deleted_rows: [] });
const now = () => new Date().toISOString();
// contagem de linhas entregues (só para os testes verificarem que a abertura baixa pouco)
const count = (k: 'listRows' | 'changeRows', n: number) => { const w = window as unknown as { __dbStats?: Record<string, number> }; (w.__dbStats ??= { listRows: 0, changeRows: 0 })[k] += n; };

function load(): Store {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return empty();
  }
}

/** Atraso artificial por chamada (ms), só para testar lentidão de rede: localStorage['bolso:demo-latency']. */
const lag = () => {
  const ms = Number(localStorage.getItem('bolso:demo-latency') ?? 0);
  return ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : undefined;
};

/** Banco local (localStorage) com a mesma interface do Supabase — usado sem variáveis de ambiente. */
export function createDemoDb(): Db {
  const store = load();
  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* sem armazenamento */ }
  };
  return {
    mode: 'demo',
    getUser: async () => USER,
    onAuthChange: () => () => {},
    signIn: async () => {},
    signUp: async () => ({ needsConfirmation: false }),
    signOut: async () => {
      localStorage.removeItem(KEY);
      location.reload();
    },
    async list<T>(table: Table) {
      await lag();
      count('listRows', store[table].length);
      return structuredClone(store[table]) as T[];
    },
    async changes<T>(table: Table, since: string) {
      await lag();
      const rows = store[table].filter((r) => ((r.updated_at as string | undefined) ?? '') >= since);
      count('changeRows', rows.length);
      return structuredClone(rows) as T[];
    },
    async deletedSince(since: string) {
      await lag();
      return structuredClone(store.deleted_rows.filter((d) => d.deleted_at >= since));
    },
    async insert<T>(table: Table, rows: object[], opts?: { ignoreDuplicates?: string }) {
      await lag();
      const cols = opts?.ignoreDuplicates?.split(',').filter((c) => c !== 'user_id');
      const created: Record<string, unknown>[] = [];
      for (const r of rows as Record<string, unknown>[]) {
        if (cols?.length && cols.every((c) => r[c] != null) &&
          store[table].some((x) => cols.every((c) => x[c] === r[c]))) continue;
        const row: Record<string, unknown> = { id: crypto.randomUUID(), created_at: now(), ...r, updated_at: now() };
        if (table === 'notifications') row.read = row.read ?? false;
        store[table].push(row);
        created.push(row);
      }
      persist();
      return structuredClone(created) as T[];
    },
    async update<T>(table: Table, id: string, patch: object) {
      await lag();
      const row = store[table].find((r) => r.id === id);
      if (!row) throw new Error('Registro não encontrado');
      Object.assign(row, patch, { updated_at: now() });
      persist();
      return structuredClone(row) as T;
    },
    async remove(table, ids) {
      await lag();
      const gone: { tbl: Table; id: string }[] = [];
      const drop = (tbl: Table, keep: (r: Record<string, unknown>) => boolean) => {
        const kept: Record<string, unknown>[] = [];
        for (const r of store[tbl]) {
          if (keep(r)) kept.push(r);
          else gone.push({ tbl, id: r.id as string });
        }
        store[tbl] = kept;
      };
      const set = new Set(ids);
      drop(table, (r) => !set.has(r.id as string));
      // cascata mínima, como no banco
      if (table === 'accounts') {
        drop('transactions', (t) => !set.has(t.account_id as string) && !set.has(t.to_account_id as string));
        drop('recurrences', (t) => !set.has(t.account_id as string));
        drop('investment_snapshots', (t) => !set.has(t.account_id as string));
      }
      const at = now();
      for (const g of gone) store.deleted_rows.push({ ...g, deleted_at: at });
      persist();
    },
  };
}
