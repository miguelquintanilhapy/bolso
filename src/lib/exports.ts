import type { Account, Category, Transaction } from './types';
import { launchInfo } from './launch';

const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
/** Texto livre vindo do usuário: neutraliza fórmulas (=, +, -, @) que o Excel/Planilhas executariam ao abrir o arquivo. */
const txt = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function transactionsToCSV(txs: Transaction[], accounts: Account[], categories: Category[]) {
  const acc = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? '';
  const cat = (id: string | null) => categories.find((c) => c.id === id)?.name ?? '';
  const head = ['data', 'tipo', 'valor', 'descricao', 'categoria', 'conta', 'conta_destino', 'situacao', 'parcela', 'tags', 'observacao', 'horario', 'lancado_em'];
  const rows = [...txs].sort((a, b) => a.date.localeCompare(b.date)).map((t) => [
    t.date, t.kind === 'income' ? 'receita' : t.kind === 'expense' ? 'despesa' : 'transferencia', t.amount.toFixed(2).replace('.', ','),
    txt(t.description), txt(cat(t.category_id)), txt(acc(t.account_id)), txt(acc(t.to_account_id)), t.status === 'paid' ? 'pago' : 'pendente',
    t.installment_total ? `${t.installment_number}/${t.installment_total}` : '', txt(t.tags.join(' ')), txt(t.notes), t.occurred_time ?? '', launchInfo(t)?.csv ?? '',
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
