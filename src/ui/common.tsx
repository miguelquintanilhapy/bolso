import type { ReactNode } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '../store';
import type { Account, Category, Transaction } from '../lib/types';
import { addMonthsToMonth, monthLabel } from '../lib/dates';
import { Money } from './privacy';
import { CategoryIcon } from './icons';

export function Pills<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="pills" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={`pill ${value === o.id ? 'active' : ''}`} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.id} type="button" className={value === o.id ? 'active' : ''} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MonthNav({ month, onChange, max }: { month: string; onChange: (m: string) => void; max?: string }) {
  return (
    <div className="month-nav">
      <button onClick={() => onChange(addMonthsToMonth(month, -1))} aria-label="Mês anterior"><ChevronLeft size={20} /></button>
      <b>{monthLabel(month)}</b>
      <button onClick={() => onChange(addMonthsToMonth(month, 1))} disabled={!!max && month >= max} aria-label="Próximo mês"><ChevronRight size={20} /></button>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function Empty({ title, children, icon, action }: { title: string; children?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-ico" aria-hidden>{icon}</div>}
      <b>{title}</b>{children}{action}
    </div>
  );
}

/** Saldo do dia (receitas − despesas), ignorando transferências. */
export const dayNet = (rows: Transaction[]) =>
  Math.round(rows.reduce((s, t) => s + (t.kind === 'income' ? t.amount : t.kind === 'expense' ? -t.amount : 0), 0) * 100) / 100;

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="section-title"><h2>{title}</h2>{action}</div>;
}

interface TxRowProps {
  tx: Transaction;
  accounts: Account[];
  categories: Category[];
  onClick: () => void;
  showDate?: boolean;
  hideAccount?: boolean;
}

/** Linha de lançamento no estilo das referências: ícone circular, título, subtítulo cinza e valor à direita. */
export function TxRow({ tx, accounts, categories, onClick, showDate, hideAccount }: TxRowProps) {
  const { markPaid, flash, today } = useStore();
  const cat = categories.find((c) => c.id === tx.category_id);
  const acc = accounts.find((a) => a.id === tx.account_id);
  const to = accounts.find((a) => a.id === tx.to_account_id);
  const income = tx.kind === 'income';
  const transfer = tx.kind === 'transfer';
  const pending = tx.status === 'pending';
  const late = pending && tx.date < today;
  const title = tx.description || (transfer ? 'Transferência' : cat?.name || (income ? 'Receita' : 'Despesa'));
  const dm = tx.date.slice(8, 10) + '/' + tx.date.slice(5, 7);
  const due = late ? `atrasado desde ${dm}` : `vence ${dm}`;
  // pendente: o vencimento vem primeiro (é o que importa); o botão "Pagar" ocupa a direita
  const sub = (pending
    ? [due, transfer ? `${acc?.name ?? '—'} → ${to?.name ?? '—'}` : cat?.name ?? 'Sem categoria', tx.installment_total ? `${tx.installment_number}/${tx.installment_total}` : null]
    : [
        transfer ? `${acc?.name ?? '—'} → ${to?.name ?? '—'}` : cat?.name ?? 'Sem categoria',
        !transfer && acc && !hideAccount ? acc.name : null,
        tx.installment_total ? `${tx.installment_number}/${tx.installment_total}` : null,
        showDate ? dm : null,
      ]
  ).filter(Boolean).join(' · ');
  return (
    <div className={`item ${flash.has(tx.id) ? 'flash' : ''}`} role="button" tabIndex={0} onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}>
      <span className={`ico ${income ? 'in' : ''} ${late ? 'bad' : ''}`}>
        {transfer ? <ArrowLeftRight size={19} /> : cat ? <CategoryIcon name={cat.icon} /> : income ? <ArrowDown size={19} /> : <ArrowUp size={19} />}
      </span>
      <span className="main">
        <b>{title}</b>
        <small className={late ? 'red' : ''}>{sub}{tx.tags.length ? ` · ${tx.tags.map((t) => '#' + t).join(' ')}` : ''}</small>
      </span>
      <span className="side">
        <b className={income ? 'green' : ''}><Money value={income ? tx.amount : transfer ? tx.amount : -tx.amount} signed={income} /></b>
        {pending && (
          <button className="pay-btn" aria-label={`${income ? 'Marcar como recebido' : 'Marcar como pago'}: ${title}`}
            onClick={(e) => { e.stopPropagation(); void markPaid(tx); }}>
            <Check size={13} strokeWidth={3} /> {income ? 'Receber' : transfer ? 'Confirmar' : 'Pagar'}
          </button>
        )}
      </span>
    </div>
  );
}
