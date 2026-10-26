import type { Db, SessionUser, Table } from './api';

const KEY = 'bolso:demo:v1';
const USER: SessionUser = { id: 'demo-user', email: 'demo@bolso.local' };
type Store = Record<Table, Record<string, unknown>[]>;
const empty = (): Store => ({ accounts: [], categories: [], transactions: [], recurrences: [], notifications: [], investment_snapshots: [] });

function load(): Store {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return empty();
  }
}

// mesma regra do gatilho do banco: a conta só aceita as categorias escolhidas para ela
function checkCategory(store: Store, row: Record<string, unknown>) {
  if (row.category_id == null) return;
  const acc = store.accounts.find((a) => a.id === row.account_id);
  const allowed = acc?.allowed_category_ids as string[] | null | undefined;
  if (allowed?.length && !allowed.includes(row.category_id as string)) throw new Error('Esta conta só aceita as categorias escolhidas para ela.');
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
      return structuredClone(store[table]) as T[];
    },
    async insert<T>(table: Table, rows: object[], opts?: { ignoreDuplicates?: string }) {
      await lag();
      const cols = opts?.ignoreDuplicates?.split(',').filter((c) => c !== 'user_id');
      const created: Record<string, unknown>[] = [];
      for (const r of rows as Record<string, unknown>[]) {
        if (cols?.length && cols.every((c) => r[c] != null) &&
          store[table].some((x) => cols.every((c) => x[c] === r[c]))) continue;
        const row: Record<string, unknown> = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r };
        if (table === 'notifications') row.read = row.read ?? false;
        if (table === 'transactions') checkCategory(store, row);
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
      if (table === 'transactions') {
        const next = { ...row, ...patch };
        if (next.category_id !== row.category_id || next.account_id !== row.account_id) checkCategory(store, next);
      }
      Object.assign(row, patch);
      persist();
      return structuredClone(row) as T;
    },
    async remove(table, ids) {
      await lag();
      const set = new Set(ids);
      store[table] = store[table].filter((r) => !set.has(r.id as string));
      // cascata mínima, como no banco
      if (table === 'accounts') {
        store.transactions = store.transactions.filter((t) => !set.has(t.account_id as string) && !set.has(t.to_account_id as string));
        store.recurrences = store.recurrences.filter((t) => !set.has(t.account_id as string));
        store.investment_snapshots = store.investment_snapshots.filter((t) => !set.has(t.account_id as string));
      }
      persist();
    },
  };
}
