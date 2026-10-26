import { createClient } from '@supabase/supabase-js';
import type { DeletedRow, Db, SessionUser, Table } from './api';

const PAGE = 1000;

export function createSupabaseDb(url: string, anonKey: string): Db {
  const sb = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  const toUser = (u: { id: string; email?: string | null } | null | undefined): SessionUser | null =>
    u ? { id: u.id, email: u.email ?? '' } : null;
  const fail = (e: { message: string } | null) => {
    if (e) throw new Error(e.message);
  };

  return {
    mode: 'supabase',
    async getUser() {
      const { data } = await sb.auth.getSession();
      return toUser(data.session?.user);
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, session) => cb(toUser(session?.user)));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      fail(error);
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password });
      fail(error);
      return { needsConfirmation: !data.session };
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async list<T>(table: Table) {
      const rows: T[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await sb.from(table).select('*').order('created_at', { ascending: true }).range(from, from + PAGE - 1);
        fail(error);
        rows.push(...((data ?? []) as T[]));
        if (!data || data.length < PAGE) break;
      }
      return rows;
    },
    async changes<T>(table: Table, since: string) {
      const rows: T[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await sb.from(table).select('*').gte('updated_at', since).order('updated_at', { ascending: true }).range(from, from + PAGE - 1);
        fail(error);
        rows.push(...((data ?? []) as T[]));
        if (!data || data.length < PAGE) break;
      }
      return rows;
    },
    async deletedSince(since: string) {
      const rows: DeletedRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await sb.from('deleted_rows').select('tbl,id,deleted_at').gte('deleted_at', since).order('deleted_at', { ascending: true }).range(from, from + PAGE - 1);
        fail(error);
        rows.push(...((data ?? []) as DeletedRow[]));
        if (!data || data.length < PAGE) break;
      }
      return rows;
    },
    async insert<T>(table: Table, rows: object[], opts?: { ignoreDuplicates?: string }) {
      if (!rows.length) return [];
      const q = opts?.ignoreDuplicates
        ? sb.from(table).upsert(rows, { onConflict: opts.ignoreDuplicates, ignoreDuplicates: true })
        : sb.from(table).insert(rows);
      const { data, error } = await q.select();
      fail(error);
      return (data ?? []) as T[];
    },
    async update<T>(table: Table, id: string, patch: object) {
      const { data, error } = await sb.from(table).update(patch).eq('id', id).select().single();
      fail(error);
      return data as T;
    },
    async remove(table, ids) {
      if (!ids.length) return;
      const { error } = await sb.from(table).delete().in('id', ids);
      fail(error);
    },
  };
}
