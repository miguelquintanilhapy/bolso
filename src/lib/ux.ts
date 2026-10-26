import type { Account, NewTransaction, Snapshot, Transaction } from './types';
import { accountBalance, buildInstallments } from './finance';
import { formatBRL, round2 } from './money';
import { norm } from './quickEntry';
import type { Upcoming } from './finance';
import { dayLabel } from './dates';

/** Efeito do lançamento nos saldos, em frases curtas, antes de salvar. */
export function previewEffect(opts: {
  base: NewTransaction; installments: number; accounts: Account[]; txs: Transaction[]; snaps: Snapshot[]; today: string; ignoreId?: string;
}): string[] {
  const { base, installments, accounts, snaps, today } = opts;
  const txs = opts.ignoreId ? opts.txs.filter((t) => t.id !== opts.ignoreId) : opts.txs;
  const from = accounts.find((a) => a.id === base.account_id);
  if (!from || !(base.amount > 0)) return [];
  const isCard = from.kind === 'credit';
  const rows = installments > 1 && base.kind !== 'transfer'
    ? buildInstallments(base, installments, isCard, today, 'preview')
    : [base];
  const fake = rows.map((r, i) => ({ ...r, id: `preview-${i}` }) as Transaction);
  const lines: string[] = [];
  const touched = [from, accounts.find((a) => a.id === base.to_account_id)].filter(Boolean) as Account[];
  const noEffectNow = fake.every((t) => t.status !== 'paid' || t.date > today);
  if (installments > 1 && base.kind !== 'transfer') {
    const parts = rows.map((r) => r.amount);
    lines.push(parts.every((p) => p === parts[0]) ? `${installments}× de ${formatBRL(parts[0])}` : `${installments}× de ${formatBRL(parts[0])} (a última ajusta os centavos)`);
  }
  if (noEffectNow) {
    lines.push(base.status === 'pending' ? 'Fica como pendente: ainda não altera o saldo.' : `Agendado para ${base.date.slice(8, 10)}/${base.date.slice(5, 7)}: só altera o saldo nessa data.`);
    return lines;
  }
  for (const acc of touched) {
    const before = accountBalance(acc, txs, snaps, today);
    const after = accountBalance(acc, [...txs, ...fake], snaps, today);
    if (round2(after - before) === 0) continue;
    lines.push(acc.kind === 'credit'
      ? `${acc.name} · você deve ${formatBRL(-before)} → ${formatBRL(-after)}`
      : `${acc.name} · ${formatBRL(before)} → ${formatBRL(after)}`);
  }
  return lines;
}

/** Lançamento igual a outro já existente (mesmo dia, valor, conta, tipo e descrição). */
export function findDuplicate(txs: Transaction[], t: Pick<NewTransaction, 'kind' | 'amount' | 'date' | 'account_id' | 'description' | 'to_account_id'>, ignoreId?: string) {
  const d = norm(t.description.trim());
  return txs.find((x) => x.id !== ignoreId && x.kind === t.kind && x.date === t.date && x.account_id === t.account_id
    && (x.to_account_id ?? null) === (t.to_account_id ?? null) && round2(x.amount) === round2(t.amount) && norm(x.description.trim()) === d);
}

export interface DescriptionHint { description: string; category_id: string | null; amount: number; account_id: string }

/** Descrições já usadas que combinam com o que a pessoa digitou (as mais frequentes primeiro). */
export function suggestDescriptions(txs: Transaction[], kind: string, typed: string, limit = 3): DescriptionHint[] {
  const q = norm(typed.trim());
  if (q.length < 2) return [];
  const map = new Map<string, { n: number; last: Transaction }>();
  for (const t of txs) {
    if (t.kind !== kind || !t.description.trim()) continue;
    const key = norm(t.description.trim());
    if (!key.includes(q) || key === q) continue;
    const cur = map.get(key);
    map.set(key, { n: (cur?.n ?? 0) + 1, last: !cur || t.date >= cur.last.date ? t : cur.last });
  }
  return [...map.values()].sort((a, b) => b.n - a.n || b.last.date.localeCompare(a.last.date)).slice(0, limit)
    .map(({ last }) => ({ description: last.description, category_id: last.category_id, amount: last.amount, account_id: last.account_id }));
}

/** Faturas atrasadas do mesmo cartão viram uma linha só. */
export function collapseOverdue(list: Upcoming[], today: string): (Upcoming & { count?: number })[] {
  const out: (Upcoming & { count?: number })[] = [];
  const idx = new Map<string, number>();
  for (const u of list) {
    if (u.kind !== 'invoice' || u.date >= today) { out.push(u); continue; }
    const at = idx.get(u.link);
    if (at === undefined) { idx.set(u.link, out.length); out.push({ ...u, count: 1 }); continue; }
    const cur = out[at];
    out[at] = { ...cur, amount: round2(cur.amount + u.amount), count: (cur.count ?? 1) + 1, date: cur.date < u.date ? cur.date : u.date };
  }
  return out;
}

// memória do último uso (só neste aparelho)
const KEY = 'bolso:last-used';
type Last = { account?: string };
export function getLastUsed(): Last {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Last; } catch { return {}; }
}
export function setLastUsed(patch: Last) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...getLastUsed(), ...patch })); } catch { /* sem armazenamento */ }
}

/** Como falar de um lançamento pendente: conta "vence"; receita "entra" (nunca "vence" nem "atrasado"). */
export function pendingWhen(income: boolean, date: string, today: string): { text: string; tone: 'red' | 'green' | 'amber' | '' } {
  const dm = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  const late = date < today;
  if (income) {
    if (late) return { text: `Previsto para ${dm} · ainda não recebido`, tone: 'amber' };
    const label = dayLabel(date, today);
    return { text: /^\d/.test(label) ? `Entra em ${label}` : `Entra ${label.toLowerCase()} · ${dm}`, tone: 'green' };
  }
  if (late) return { text: `Atrasado desde ${dm}`, tone: 'red' };
  const label = dayLabel(date, today);
  return { text: /^\d/.test(label) ? `Vence em ${label}` : `Vence ${label.toLowerCase()} · ${dm}`, tone: '' };
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** Quando a pessoa registrou o lançamento (hora local). `null` para o que foi criado sozinho (recorrência) ou sem horário guardado. */
export function launchInfo(tx: { created_at?: string; date: string; recurrence_id?: string | null }) {
  if (!tx.created_at || tx.recurrence_id) return null;
  const d = new Date(tx.created_at);
  if (Number.isNaN(d.getTime())) return null;
  const ymd = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const time = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const dm = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
  return { time, dm, ymd, sameDay: ymd === tx.date, full: `${dm}/${d.getFullYear()} às ${time}`, csv: `${ymd} ${time}` };
}
