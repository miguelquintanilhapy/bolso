import { BANK_TEMPLATES, type BankTemplate } from './bankTemplates';
import { norm } from './quickEntry';

/** Qual marca de banco/benefício o nome da conta indica (ex.: "Nubank Cartão" → Nubank). null se nenhuma. */
export function findBrand(accountName: string): BankTemplate | null {
  const n = norm(accountName).replace(/[^a-z0-9]+/g, ' ').trim();
  if (!n) return null;
  const tokens = n.split(' ');
  for (const t of BANK_TEMPLATES) {
    const hit = t.match.some((m) => {
      const w = norm(m).replace(/[^a-z0-9]+/g, ' ').trim();
      // palavra inteira, para "Internet" não virar "Inter"; frases ("banco do brasil") valem em qualquer parte do nome
      return w.includes(' ') ? ` ${n} `.includes(` ${w} `) : tokens.includes(w);
    });
    if (hit) return t;
  }
  return null;
}

/** Ícone do site da marca (usado só quando a marca não está embutida no app). */
export const faviconUrl = (domain: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;

const KEY = 'bolso:logos';
/** Logos de bancos ligados? (padrão: sim; dá para desligar em Mais.) */
export function logosEnabled(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setLogosEnabled(on: boolean) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* sem armazenamento */ }
}
