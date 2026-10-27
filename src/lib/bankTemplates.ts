import type { AccountKind } from './types';

export interface BankTemplate { id: string; label: string; color: string }

/** Atalhos para criar conta/cartão já com nome e cor (as cores são as da identidade de cada banco). */
export const BANK_TEMPLATES: BankTemplate[] = [
  { id: 'nubank', label: 'Nubank', color: '#8a05be' },
  { id: 'itau', label: 'Itaú', color: '#ec7000' },
  { id: 'inter', label: 'Inter', color: '#ff7a00' },
  { id: 'bradesco', label: 'Bradesco', color: '#cc092f' },
  { id: 'santander', label: 'Santander', color: '#ec0000' },
  { id: 'bb', label: 'Banco do Brasil', color: '#f9d400' },
  { id: 'caixa', label: 'Caixa', color: '#0b6fb8' },
  { id: 'c6', label: 'C6 Bank', color: '#242424' },
  { id: 'picpay', label: 'PicPay', color: '#21c25e' },
  { id: 'mercadopago', label: 'Mercado Pago', color: '#009ee3' },
  { id: 'swile', label: 'Swile', color: '#ff5a5f' },
  { id: 'vr', label: 'VR', color: '#00a651' },
  { id: 'alelo', label: 'Alelo', color: '#00a859' },
  { id: 'sodexo', label: 'Sodexo/Pluxee', color: '#e4002b' },
];

/** Nome sugerido: cartão ganha " Cartão" (ex.: "Nubank Cartão"); conta e benefício ficam só com o nome da marca. */
export function templateName(t: BankTemplate, kind: AccountKind): string {
  return kind === 'credit' ? `${t.label} Cartão` : t.label;
}
