import { useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, Check, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
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
  const i = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div className="seg thumb" role="group" style={{ '--i': i, '--n': options.length } as React.CSSProperties}>
      <span className="seg-thumb" aria-hidden />
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
  const { markPaid, flash, today, removeWithUndo } = useStore();
  const swipe = useSwipe(tx.status === 'pending' ? 152 : 76);
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
  const click = () => { if (swipe.open) swipe.close(); else onClick(); };
  return (
    <div className="swipe">
      <div className="swipe-actions" style={{ visibility: swipe.dx === 0 && !swipe.open ? 'hidden' : 'visible' }}>
        {pending && <button className="sw pay" tabIndex={swipe.open ? 0 : -1} onClick={() => { swipe.close(); void markPaid(tx); }}><Check size={20} strokeWidth={3} />{income ? 'Receber' : transfer ? 'Confirmar' : 'Pagar'}</button>}
        <button className="sw del" tabIndex={swipe.open ? 0 : -1} onClick={() => { swipe.close(); void removeWithUndo('transactions', [tx], 'Lançamento apagado'); }}><Trash2 size={20} />Apagar</button>
      </div>
    <div className={`item ${flash.has(tx.id) ? 'flash' : ''} ${swipe.dragging ? 'dragging' : ''}`} role="button" tabIndex={0} onClick={click}
      style={swipe.dx ? { transform: `translateX(${swipe.dx}px)` } : undefined} {...swipe.handlers}
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
    </div>
  );
}

/** Deslizar a linha para a esquerda revela as ações (só toque/caneta; no mouse vale o clique). */
function useSwipe(width: number) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState(false);
  const st = useRef<{ x: number; y: number; base: number; axis: '' | 'x' | 'y'; moved: boolean } | null>(null);
  const close = () => { setOpen(false); setDx(0); };
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      st.current = { x: e.clientX, y: e.clientY, base: open ? -width : 0, axis: '', moved: false };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const g = st.current;
      if (!g) return;
      const mx = e.clientX - g.x, my = e.clientY - g.y;
      if (!g.axis) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        g.axis = Math.abs(mx) > Math.abs(my) * 1.4 ? 'x' : 'y';
        if (g.axis === 'x') { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setDragging(true); }
      }
      if (g.axis !== 'x') return;
      g.moved = true;
      const next = Math.min(0, Math.max(-width - 24, g.base + mx));
      setDx(next < -width ? -width + (next + width) * 0.3 : next); // resistência além do limite
    },
    onPointerUp: () => {
      const g = st.current;
      st.current = null;
      if (!g || g.axis !== 'x') return;
      setDragging(false);
      const shouldOpen = dx < -width * 0.4;
      setOpen(shouldOpen);
      setDx(shouldOpen ? -width : 0);
      // o clique que o navegador dispara depois do arrasto não deve abrir o lançamento
      if (g.moved) { const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); }; window.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => window.removeEventListener('click', stop, true), 0); }
    },
    onPointerCancel: () => { st.current = null; setDragging(false); setDx(open ? -width : 0); },
  };
  return { dx: open && !dragging ? -width : dx, dragging, open, close, handlers };
}
