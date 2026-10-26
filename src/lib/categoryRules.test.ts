import { describe, expect, it } from 'vitest';
import { allowedCategories, categoryAllowed, isRestricted, joinNames, restrictionText } from './categoryRules';

const cats = [{ id: 'l', name: 'Lazer' }, { id: 't', name: 'Transporte' }, { id: 'a', name: 'Alimentação' }, { id: 'm', name: 'Moradia' }];
const swile = { name: 'Swile', allowed_category_ids: ['l', 't', 'a'] };

describe('categorias por conta', () => {
  it('sem limite (null, undefined ou lista vazia) aceita tudo', () => {
    for (const a of [{ allowed_category_ids: null }, { allowed_category_ids: undefined }, { allowed_category_ids: [] }, undefined, null]) {
      expect(isRestricted(a)).toBe(false);
      expect(categoryAllowed(a, 'm')).toBe(true);
      expect(allowedCategories(a, cats)).toHaveLength(4);
    }
  });
  it('com limite aceita só as escolhidas', () => {
    expect(isRestricted(swile)).toBe(true);
    expect(categoryAllowed(swile, 'l')).toBe(true);
    expect(categoryAllowed(swile, 'm')).toBe(false);
    expect(allowedCategories(swile, cats).map((c) => c.name)).toEqual(['Lazer', 'Transporte', 'Alimentação']);
  });
  it('sem categoria passa (a obrigatoriedade é do formulário)', () => {
    expect(categoryAllowed(swile, null)).toBe(true);
  });
  it('textos', () => {
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A e B');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B e C');
    expect(restrictionText(swile, cats)).toBe('Swile só aceita: Lazer, Transporte e Alimentação.');
  });
  it('categoria apagada na lista não quebra a mensagem', () => {
    expect(restrictionText({ name: 'X', allowed_category_ids: ['l', 'sumiu'] }, cats)).toBe('X só aceita: Lazer.');
  });
});
