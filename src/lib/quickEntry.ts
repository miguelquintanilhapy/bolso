import type { Account, Category, TxKind } from './types';
import { addDays, parseISO, toISO } from './dates';
import { parseAmount } from './money';

export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export interface QuickDraft {
  kind: Exclude<TxKind, 'transfer'>;
  amount: number;
  date: string;
  description: string;
  tags: string[];
  installments: number;
  account_id: string | null;
  category_id: string | null;
  keyword: string | null;
}

export type QuickResult = { ok: true; draft: QuickDraft } | { ok: false; reason: string };

const INCOME_WORDS = new Set(['recebi', 'receita', 'entrada', 'ganhei']);

function parseDateToken(tok: string, today: string): string | null {
  const w = norm(tok);
  if (w === 'hoje') return today;
  if (w === 'ontem') return addDays(today, -1);
  if (w === 'anteontem') return addDays(today, -2);
  const m = w.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!m) return null;
  let y = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
  if (y < 100) y += 2000;
  const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
  return d.getMonth() === Number(m[2]) - 1 ? toISO(d) : null;
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Interpreta o campo rápido por regras (sem IA):
 *   "50 mercado" · "uber 23,90" · "+3000 salário" · "300 tv 3x nubank" · "ontem 12 padaria #trabalho"
 */
export function parseQuickEntry(
  text: string,
  ctx: { categories: Category[]; accounts: Account[]; today: string },
): QuickResult {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { ok: false, reason: 'Digite um valor e uma palavra, ex.: 50 mercado' };

  let amount: number | null = null;
  let explicitIncome = false;
  let explicitExpense = false;
  let date = ctx.today;
  let installments = 1;
  const tags: string[] = [];
  const rest: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.startsWith('#') && tok.length > 1) { tags.push(norm(tok.slice(1))); continue; }
    const inst = norm(tok).match(/^(\d{1,2})x$/);
    if (inst && Number(inst[1]) >= 2) { installments = Number(inst[1]); continue; }
    const dt = parseDateToken(tok, ctx.today);
    if (dt) { date = dt; continue; }
    if (amount === null) {
      const a = parseAmount(tok);
      if (a !== null) {
        amount = a;
        if (tok.startsWith('+')) explicitIncome = true;
        if (tok.startsWith('-')) explicitExpense = true;
        continue;
      }
      if (/^r\$$/i.test(tok) && tokens[i + 1]) {
        const a2 = parseAmount(tokens[i + 1]);
        if (a2 !== null) { amount = a2; i++; continue; }
      }
    }
    rest.push(tok);
  }
  if (amount === null) return { ok: false, reason: 'Não achei um valor. Ex.: 50 mercado' };

  // conta: nome completo ou palavra única que identifique uma conta
  const live = ctx.accounts.filter((a) => !a.archived);
  let accountId: string | null = null;
  let accountToken = -1;
  rest.forEach((w, idx) => {
    if (accountId) return;
    const n = norm(w);
    const full = live.filter((a) => norm(a.name) === n);
    const part = live.filter((a) => norm(a.name).split(/\s+/).includes(n) && n.length >= 3);
    const hit = full.length === 1 ? full : part.length === 1 ? part : [];
    if (hit.length === 1) { accountId = hit[0].id; accountToken = idx; }
  });
  const words = rest.filter((_, idx) => idx !== accountToken);

  // categoria por palavra-chave (ou pelo próprio nome)
  const cats = ctx.categories.filter((c) => !c.archived);
  let category: Category | null = null;
  let keyword: string | null = null;
  for (const w of words) {
    const n = norm(w);
    const c = cats.find((c) => c.keywords.map(norm).includes(n) || norm(c.name) === n);
    if (c) { category = c; keyword = n; break; }
  }
  if (!keyword) keyword = words.map(norm).find((w) => !INCOME_WORDS.has(w)) ?? null;

  let kind: QuickDraft['kind'] = 'expense';
  if (explicitIncome || words.some((w) => INCOME_WORDS.has(norm(w)))) kind = 'income';
  else if (!explicitExpense && category?.kind === 'income') kind = 'income';
  if (category && category.kind !== kind) category = null; // evita despesa em categoria de receita

  const description = capitalize(words.filter((w) => !INCOME_WORDS.has(norm(w))).join(' '));
  return {
    ok: true,
    draft: {
      kind, amount, date, description, tags: [...new Set(tags)], installments,
      account_id: accountId, category_id: category?.id ?? null, keyword,
    },
  };
}

export { parseISO };
