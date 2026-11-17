import type { AccountKind } from './types';

export interface BankTemplate {
  id: string; label: string; color: string;
  /** site da marca: de lá vem o ícone quando a marca não está embutida no app */
  domain: string;
  /** palavras (ou frases) do nome da conta que identificam a marca */
  match: string[];
}

/** Atalhos para criar conta/cartão já com nome e cor (as cores são as da identidade de cada banco). */
export const BANK_TEMPLATES: BankTemplate[] = [
  { id: 'nubank', label: 'Nubank', color: '#8a05be', domain: 'nubank.com.br', match: ['nubank', 'nu bank'] },
  { id: 'itau', label: 'Itaú', color: '#ec7000', domain: 'itau.com.br', match: ['itau', 'itaú'] },
  { id: 'inter', label: 'Inter', color: '#ff7a00', domain: 'inter.co', match: ['inter', 'banco inter'] },
  { id: 'bradesco', label: 'Bradesco', color: '#cc092f', domain: 'bradesco.com.br', match: ['bradesco'] },
  { id: 'santander', label: 'Santander', color: '#ec0000', domain: 'santander.com.br', match: ['santander'] },
  { id: 'bb', label: 'Banco do Brasil', color: '#f9d400', domain: 'bb.com.br', match: ['bb', 'banco do brasil'] },
  { id: 'caixa', label: 'Caixa', color: '#0b6fb8', domain: 'caixa.gov.br', match: ['caixa', 'cef'] },
  { id: 'c6', label: 'C6 Bank', color: '#242424', domain: 'c6bank.com.br', match: ['c6', 'c6 bank'] },
  { id: 'picpay', label: 'PicPay', color: '#21c25e', domain: 'picpay.com', match: ['picpay'] },
  { id: 'mercadopago', label: 'Mercado Pago', color: '#009ee3', domain: 'mercadopago.com.br', match: ['mercado pago', 'mercadopago'] },
  { id: 'swile', label: 'Swile', color: '#ff5a5f', domain: 'swile.co', match: ['swile'] },
  { id: 'vr', label: 'VR', color: '#00a651', domain: 'vr.com.br', match: ['vr'] },
  { id: 'alelo', label: 'Alelo', color: '#00a859', domain: 'alelo.com.br', match: ['alelo'] },
  { id: 'sodexo', label: 'Sodexo/Pluxee', color: '#e4002b', domain: 'pluxee.com.br', match: ['sodexo', 'pluxee'] },
];

/** Nome sugerido: cartão ganha " Cartão" (ex.: "Nubank Cartão"); conta e benefício ficam só com o nome da marca. */
export function templateName(t: BankTemplate, kind: AccountKind): string {
  return kind === 'credit' ? `${t.label} Cartão` : t.label;
}
