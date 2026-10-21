import type { Account, Category, Transaction } from './types';

const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export function transactionsToCSV(txs: Transaction[], accounts: Account[], categories: Category[]) {
  const acc = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? '';
  const cat = (id: string | null) => categories.find((c) => c.id === id)?.name ?? '';
  const head = ['data', 'tipo', 'valor', 'descricao', 'categoria', 'conta', 'conta_destino', 'situacao', 'parcela', 'tags', 'observacao'];
  const rows = [...txs].sort((a, b) => a.date.localeCompare(b.date)).map((t) => [
    t.date, t.kind === 'income' ? 'receita' : t.kind === 'expense' ? 'despesa' : 'transferencia', t.amount.toFixed(2).replace('.', ','),
    t.description, cat(t.category_id), acc(t.account_id), acc(t.to_account_id), t.status === 'paid' ? 'pago' : 'pendente',
    t.installment_total ? `${t.installment_number}/${t.installment_total}` : '', t.tags.join(' '), t.notes,
  ].map(esc).join(';'));
  return '﻿' + [head.join(';'), ...rows].join('\r\n');
}

export function download(name: string, content: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
