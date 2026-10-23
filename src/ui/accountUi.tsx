import { CreditCard, Landmark, PiggyBank } from 'lucide-react';
import type { Account, AccountKind } from '../lib/types';
import type { InvoiceStatus } from '../lib/finance';

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

/** Círculo com o ícone do tipo (conta, cartão ou investimento), na cor da conta. */
export function AccountIcon({ account, size = 42 }: { account: Pick<Account, 'kind' | 'color'>; size?: number }) {
  const I = KIND_ICON[account.kind];
  return (
    <span className="acc-ico" style={{ width: size, height: size, background: account.color === '#111111' ? '#2a2d33' : account.color }}>
      <I size={Math.round(size * 0.48)} strokeWidth={1.9} />
    </span>
  );
}
