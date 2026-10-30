import type { Category, Transaction } from './types';
import { norm } from './quickEntry';
import { round2 } from './money';

export interface KeywordSuggestion {
  /** palavra já normalizada (a mesma que o campo rápido vai reconhecer) */
  word: string;
  categoryId: string;
  count: number;
  /** valor que se repete (≥ 60% das vezes), se houver */
  amount: number | null;
  /** 'new': a palavra ainda não está em nenhuma categoria · 'default': já está, mas sem valor padrão */
  kind: 'new' | 'default';
}

/**
 * Descobre, pelo histórico, palavras que valem virar palavra-chave e/ou ter valor padrão:
 * uma descrição de uma palavra só, usada 3 vezes ou mais sempre na mesma categoria (maioria).
 */
export function suggestKeywords(txs: Transaction[], cats: Category[], dismissed: string[] = [], limit = 5): KeywordSuggestion[] {
  const groups = new Map<string, { cats: Map<string, number>; amounts: Map<number, number>; count: number }>();
  for (const t of txs) {
    if (t.kind === 'transfer' || !t.category_id || !t.description) continue;
    const w = norm(t.description.trim());
    if (w.length < 3 || /\s/.test(w)) continue;
    const g = groups.get(w) ?? { cats: new Map(), amounts: new Map(), count: 0 };
    g.count++;
    g.cats.set(t.category_id, (g.cats.get(t.category_id) ?? 0) + 1);
    const a = round2(t.amount);
    g.amounts.set(a, (g.amounts.get(a) ?? 0) + 1);
    groups.set(w, g);
  }
  const live = cats.filter((c) => !c.archived);
  const out: KeywordSuggestion[] = [];
  for (const [word, g] of groups) {
    if (g.count < 3 || dismissed.includes(word)) continue;
    const [catId, catN] = [...g.cats.entries()].sort((a, b) => b[1] - a[1])[0];
    if (catN / g.count < 0.6) continue;
    const [amt, amtN] = [...g.amounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const amount = amtN >= 3 && amtN / g.count >= 0.6 ? amt : null;
    const owner = live.find((c) => c.keywords.map(norm).includes(word));
    if (!owner) {
      if (live.some((c) => c.id === catId && norm(c.name) === word)) continue; // o próprio nome da categoria já vale
      if (live.some((c) => c.id === catId)) out.push({ word, categoryId: catId, count: g.count, amount, kind: 'new' });
    } else if (amount && !owner.keyword_defaults?.[word]) {
      out.push({ word, categoryId: owner.id, count: g.count, amount, kind: 'default' });
    }
  }
  return out.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word)).slice(0, limit);
}

/** Categorias de um tipo na ordem escolhida pela pessoa (sem ordem escolhida: ordem original). */
export function orderedCategories(cats: Category[], kind: Category['kind']): Category[] {
  return cats
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.kind === kind && !c.archived)
    .sort((a, b) => (a.c.sort_order ?? 1e9) - (b.c.sort_order ?? 1e9) || a.i - b.i)
    .map(({ c }) => c);
}

/** Move o item de `from` para `to` (índices) numa cópia da lista. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const copy = [...list];
  const [it] = copy.splice(from, 1);
  copy.splice(to, 0, it);
  return copy;
}
