export type Table =
  | 'accounts'
  | 'categories'
  | 'transactions'
  | 'recurrences'
  | 'notifications'
  | 'investment_snapshots';

export interface SessionUser {
  id: string;
  email: string;
}

export interface DeletedRow { tbl: Table; id: string; deleted_at: string }

export interface Db {
  mode: 'supabase' | 'demo';
  getUser(): Promise<SessionUser | null>;
  onAuthChange(cb: (u: SessionUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  list<T>(table: Table): Promise<T[]>;
  /** Linhas criadas ou alteradas desde `since` (ISO). Falha se o banco ainda não tem `updated_at` (aí o app faz a carga completa). */
  changes<T>(table: Table, since: string): Promise<T[]>;
  /** Exclusões registradas desde `since` (ISO). */
  deletedSince(since: string): Promise<DeletedRow[]>;
  /** Com `ignoreDuplicates`, linhas que violam a chave única são puladas; retorna só as criadas. */
  insert<T>(table: Table, rows: object[], opts?: { ignoreDuplicates?: string }): Promise<T[]>;
  update<T>(table: Table, id: string, patch: object): Promise<T>;
  remove(table: Table, ids: string[]): Promise<void>;
}
