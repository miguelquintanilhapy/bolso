import type { Account, Category } from './types';

/** A conta/cartão aceita só algumas categorias? (lista vazia ou ausente = aceita todas) */
export const isRestricted = (a?: Pick<Account, 'allowed_category_ids'> | null): boolean => !!a?.allowed_category_ids?.length;

/** Categoria permitida nessa conta? Sem categoria (null) sempre passa; quem exige escolher é o formulário. */
export function categoryAllowed(a: Pick<Account, 'allowed_category_ids'> | undefined | null, categoryId: string | null): boolean {
  if (!isRestricted(a) || categoryId === null) return true;
  return a!.allowed_category_ids!.includes(categoryId);
}

/** Categorias que a conta aceita (todas, se não houver limite). */
export function allowedCategories<C extends Pick<Category, 'id'>>(a: Pick<Account, 'allowed_category_ids'> | undefined | null, cats: C[]): C[] {
  return isRestricted(a) ? cats.filter((c) => a!.allowed_category_ids!.includes(c.id)) : cats;
}

/** "Lazer, Transporte e Alimentação" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/** Texto curto: "Nubank Swile só aceita: Lazer, Transporte e Alimentação." */
export function restrictionText(a: Pick<Account, 'allowed_category_ids' | 'name'>, cats: Pick<Category, 'id' | 'name'>[]): string {
  const names = allowedCategories(a, cats).map((c) => c.name);
  return `${a.name} só aceita: ${joinNames(names) || 'nenhuma categoria (revise a conta)'}.`;
}
