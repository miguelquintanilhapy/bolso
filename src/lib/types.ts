export type AccountKind = 'checking' | 'credit' | 'investment';
export type TxKind = 'expense' | 'income' | 'transfer';
export type TxStatus = 'paid' | 'pending';

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  initial_balance: number;
  closing_day: number | null;
  due_day: number | null;
  credit_limit: number | null;
  color: string;
  is_default: boolean;
  archived: boolean;
  /** Categorias que essa conta/cartão aceita; vazio ou ausente = todas. */
  allowed_category_ids?: string[] | null;
}

export interface Category {
  id: string;
  name: string;
  kind: 'expense' | 'income';
  icon: string;
  color: string;
  keywords: string[];
  budget_limit: number | null;
  archived: boolean;
}

export interface Transaction {
  id: string;
  kind: TxKind;
  amount: number;
  date: string; // YYYY-MM-DD
  description: string;
  notes: string;
  tags: string[];
  status: TxStatus;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  installment_group: string | null;
  installment_number: number | null;
  installment_total: number | null;
  recurrence_id: string | null;
  ref_month: string | null;
  invoice_ref: string | null;
  /** Quando foi lançado (preenchido pelo banco). */
  created_at?: string;
  /** Hora em que a coisa aconteceu ("14:32"), informada pela pessoa; vazio = vale a hora do registro. */
  occurred_time?: string | null;
}

export interface Recurrence {
  id: string;
  description: string;
  amount: number;
  kind: 'expense' | 'income';
  account_id: string;
  category_id: string | null;
  tags: string[];
  day_of_month: number;
  start_month: string; // YYYY-MM
  end_month: string | null;
  last_generated_month: string | null;
  active: boolean;
}

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  dedupe_key: string;
  read: boolean;
  /** Excluída pela pessoa: some da lista, mas continua guardada para o aviso não voltar. */
  dismissed?: boolean;
  created_at: string;
}

export interface Snapshot {
  id: string;
  account_id: string;
  date: string;
  balance: number;
}

export type NewTransaction = Omit<Transaction, 'id'>;
