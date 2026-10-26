import { describe, expect, it } from 'vitest';
import { updateDecision } from './updates';

const base = { current: 'aaaaaaa', latest: 'bbbbbbb', safe: true, visible: true, triedFor: null as string | null };

describe('decisão de atualização', () => {
  it('versão igual, desconhecida ou build local: nada a fazer', () => {
    expect(updateDecision({ ...base, latest: 'aaaaaaa' })).toBe('none');
    expect(updateDecision({ ...base, latest: null })).toBe('none');
    expect(updateDecision({ ...base, current: 'dev' })).toBe('none');
  });
  it('versão nova + momento seguro: recarrega sozinho', () => {
    expect(updateDecision(base)).toBe('reload');
  });
  it('janela aberta ou campo em uso: só avisa', () => {
    expect(updateDecision({ ...base, safe: false })).toBe('banner');
  });
  it('app em segundo plano: não recarrega, avisa', () => {
    expect(updateDecision({ ...base, visible: false })).toBe('banner');
  });
  it('já recarregou para essa versão e ela não veio: não entra em laço, avisa', () => {
    expect(updateDecision({ ...base, triedFor: 'bbbbbbb' })).toBe('banner');
  });
  it('quem toca em "Atualizar agora" força, mesmo já tendo tentado', () => {
    expect(updateDecision({ ...base, triedFor: 'bbbbbbb', safe: false, forced: true })).toBe('reload');
  });
  it('uma versão ainda mais nova depois da tentativa volta a recarregar', () => {
    expect(updateDecision({ ...base, latest: 'ccccccc', triedFor: 'bbbbbbb' })).toBe('reload');
  });
});
