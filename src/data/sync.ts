import type { DeletedRow, Table } from './api';

type Row = { id: string; updated_at?: string };
export type Tables<T = Row> = Record<Table, T[]>;

const TABLES: Table[] = ['accounts', 'categories', 'transactions', 'recurrences', 'notifications', 'investment_snapshots'];
export const SYNC_MAX_AGE_MS = 7 * 864e5; // a cada 7 dias o app baixa tudo de novo, como conferência
export const SYNC_OVERLAP_MS = 60_000; // margem para linhas gravadas "ao mesmo tempo" que a última leitura (o carimbo vem da hora do servidor)

/** Maior `updated_at` de todas as linhas; null se alguma linha não tem (banco ainda sem a atualização do schema). */
export function newestStamp(data: Tables): string | null {
  let best = 0;
  for (const t of TABLES) {
    for (const r of data[t] as Row[]) {
      if (!r.updated_at) return null;
      const ms = Date.parse(r.updated_at);
      if (Number.isNaN(ms)) return null;
      if (ms > best) best = ms;
    }
  }
  return best ? new Date(best).toISOString() : null;
}

/** Data a partir da qual pedir mudanças (com a margem de segurança). */
export const sinceFor = (syncedAt: string) => new Date(Date.parse(syncedAt) - SYNC_OVERLAP_MS).toISOString();

/** Aplica as mudanças e exclusões recebidas sobre a cópia local. Devolve a nova cópia e o novo marco de sincronização. */
export function applyChanges<D extends Tables>(
  base: D,
  changes: Partial<Record<Table, Row[]>>,
  deleted: DeletedRow[],
  syncedAt: string,
): { data: D; syncedAt: string } {
  let newest = Date.parse(syncedAt);
  const dead = new Map<Table, Set<string>>();
  for (const d of deleted) {
    (dead.get(d.tbl) ?? dead.set(d.tbl, new Set()).get(d.tbl)!).add(d.id);
    newest = Math.max(newest, Date.parse(d.deleted_at) || 0);
  }
  const next = { ...base } as Record<Table, Row[]>;
  for (const t of TABLES) {
    const incoming = changes[t] ?? [];
    const gone = dead.get(t);
    if (!incoming.length && !gone) continue;
    const map = new Map((base[t] as Row[]).map((r) => [r.id, r]));
    for (const r of incoming) {
      map.set(r.id, r);
      const ms = r.updated_at ? Date.parse(r.updated_at) : 0;
      if (ms > newest) newest = ms;
    }
    // uma exclusão só vale se não houve alteração/recriação depois dela
    if (gone) for (const id of gone) {
      const cur = map.get(id);
      const del = deleted.find((d) => d.tbl === t && d.id === id)!;
      if (!cur || !cur.updated_at || Date.parse(cur.updated_at) <= Date.parse(del.deleted_at)) map.delete(id);
    }
    next[t] = [...map.values()];
  }
  return { data: next as unknown as D, syncedAt: new Date(newest).toISOString() };
}
