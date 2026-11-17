import { useState } from 'react';
import { CreditCard, Landmark, PiggyBank } from 'lucide-react';
import type { Account, AccountKind } from '../lib/types';
import type { InvoiceStatus } from '../lib/finance';
import { faviconUrl, findBrand, logosEnabled } from '../lib/brands';
import { BRAND_MARKS } from './brandMarks';

export const KIND_LABEL: Record<AccountKind, string> = { checking: 'Conta', credit: 'Cartão de crédito', investment: 'Investimento' };
export const KIND_ICON = { checking: Landmark, credit: CreditCard, investment: PiggyBank } as const;

/** [texto, estilo do selo] de cada situação da fatura */
export const INVOICE_STATUS: Record<InvoiceStatus, [string, string]> = {
  paid: ['Paga', 'ok'],
  overdue: ['Vencida', 'over'],
  closed: ['Fechada · a pagar', 'pending'],
  open: ['Aberta', ''],
  future: ['Futura', ''],
};

/**
 * Círculo da conta, na cor dela. Mostra, nesta ordem:
 * 1. a marca do banco embutida no app (SVG, sem rede);
 * 2. o ícone do site do banco (se a marca não estiver embutida);
 * 3. o ícone do tipo da conta (conta, cartão, investimento), que também vale se o ícone do site não carregar.
 */
export function AccountIcon({ account, size = 42 }: { account: Pick<Account, 'kind' | 'color'> & { name?: string }; size?: number }) {
  const [failed, setFailed] = useState(false);
  const I = KIND_ICON[account.kind];
  const brand = account.name && logosEnabled() ? findBrand(account.name) : null;
  const bg = account.color === '#111111' ? '#2a2d33' : account.color;
  const mark = brand ? BRAND_MARKS[brand.id] : undefined;
  if (brand && mark) {
    return (
      <span className="acc-ico" style={{ width: size, height: size, background: bg }} data-logo={brand.id}>
        <svg viewBox="0 0 24 24" width={Math.round(size * 0.56)} height={Math.round(size * 0.56)} fill="#fff" aria-hidden><path d={mark} /></svg>
      </span>
    );
  }
  if (brand && !failed) {
    return (
      <span className="acc-ico acc-ico-img" style={{ width: size, height: size, background: '#fff', boxShadow: `inset 0 0 0 2px ${bg}` }} data-logo={brand.id}>
        <img src={faviconUrl(brand.domain)} alt="" width={Math.round(size * 0.66)} height={Math.round(size * 0.66)} loading="lazy" decoding="async"
          referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      </span>
    );
  }
  return (
    <span className="acc-ico" style={{ width: size, height: size, background: bg }}>
      <I size={Math.round(size * 0.48)} strokeWidth={1.9} />
    </span>
  );
}
