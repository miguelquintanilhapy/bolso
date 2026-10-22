import type { ReactNode } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
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

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{children}</div>;
}

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
  const cat = categories.find((c) => c.id === tx.category_id);
  const acc = accounts.find((a) => a.id === tx.account_id);
  const to = accounts.find((a) => a.id === tx.to_account_id);
  const income = tx.kind === 'income';
  const transfer = tx.kind === 'transfer';
  const title = tx.description || (transfer ? 'Transferência' : cat?.name || (income ? 'Receita' : 'Despesa'));
  const sub = [
    transfer ? `${acc?.name ?? '—'} → ${to?.name ?? '—'}` : cat?.name ?? 'Sem categoria',
    !transfer && acc && !hideAccount ? acc.name : null,
    tx.installment_total ? `${tx.installment_number}/${tx.installment_total}` : null,
    showDate ? tx.date.slice(8, 10) + '/' + tx.date.slice(5, 7) : null,
  ].filter(Boolean).join(' · ');
  return (
    <button className="item" onClick={onClick}>
      <span className={`ico ${income ? 'in' : ''}`}>
        {transfer ? <ArrowLeftRight size={19} /> : cat ? <CategoryIcon name={cat.icon} /> : income ? <ArrowDown size={19} /> : <ArrowUp size={19} />}
      </span>
      <span className="main">
        <b>{title}</b>
        <small>{sub}{tx.tags.length ? ` · ${tx.tags.map((t) => '#' + t).join(' ')}` : ''}</small>
      </span>
      <span className="side">
        <b className={income ? 'green' : ''}><Money value={income ? tx.amount : transfer ? tx.amount : -tx.amount} signed={income} /></b>
        {tx.status === 'pending' && <small style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Clock size={11} /> pendente</small>}
      </span>
    </button>
  );
}
