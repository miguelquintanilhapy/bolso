import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import { useStore } from '../store';
import { Empty, MonthNav, SectionTitle, TxRow } from '../ui/common';
import { useEditor } from '../ui/editors';
import { CategoryIcon } from '../ui/icons';
import { AreaChart } from '../ui/Charts';
import { Hero, Money } from '../ui/privacy';
import { accountBalance, buildInvoice, invoiceMonthOf, invoiceMonths } from '../lib/finance';
import { addMonthsToMonth, dayLabel, monthLabel, monthShort, shortDate } from '../lib/dates';
import type { Account } from '../lib/types';

const KIND = { checking: 'Conta corrente', credit: 'Cartão de crédito', investment: 'Investimento' } as const;
const ICON = { checking: 'bank', credit: 'cash', investment: 'piggy' } as const;

export function Accounts() {
  const s = useStore();
  const { openAccount } = useEditor();
  const nav = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const live = s.accounts.filter((a) => !a.archived);
  const archived = s.accounts.filter((a) => a.archived);
  const balance = (a: Account) => accountBalance(a, s.transactions, s.investment_snapshots, s.today);

  const section = (kind: Account['kind'], title: string) => {
    const rows = live.filter((a) => a.kind === kind);
    if (!rows.length) return null;
    return (
      <>
        <span className="group-title">{title}</span>
        <div className="group">
          {rows.map((a) => (
            <button key={a.id} className="item" onClick={() => nav(`/contas/${a.id}`)}>
              <span className="ico" style={{ background: a.color, color: '#fff' }}><CategoryIcon name={ICON[a.kind]} /></span>
              <span className="main"><b>{a.name}</b><small>{KIND[a.kind]}{a.is_default ? ' · padrão' : ''}</small></span>
              <span className="side"><b className={balance(a) < 0 ? 'red' : ''}><Money value={balance(a)} /></b></span>
            </button>
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/mais" className="back" aria-label="Voltar"><ArrowLeft size={20} /></Link>
        <h1 className="title">Contas e cartões</h1>
        <button className="icon-btn" onClick={() => openAccount()} aria-label="Nova conta"><Plus size={20} /></button>
      </div>
      {live.length === 0 && <div className="card"><Empty title="Nenhuma conta ainda"><button className="btn primary" style={{ marginTop: 12 }} onClick={() => openAccount()}>Criar conta</button></Empty></div>}
      {section('checking', 'Contas')}
      {section('credit', 'Cartões de crédito')}
      {section('investment', 'Investimentos')}
      {archived.length > 0 && (
        <>
          <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setShowArchived((v) => !v)}>{showArchived ? 'Ocultar' : 'Mostrar'} arquivadas ({archived.length})</button>
          {showArchived && <div className="group">{archived.map((a) => (
            <button key={a.id} className="item" onClick={() => nav(`/contas/${a.id}`)}><span className="main"><b>{a.name}</b><small>{KIND[a.kind]} · arquivada</small></span></button>
          ))}</div>}
        </>
      )}
    </div>
  );
}

export function AccountDetail() {
  const { id } = useParams();
  const s = useStore();
  const { openAccount, newTx, editTx, openSnapshot } = useEditor();
  const nav = useNavigate();
  const acc = s.accounts.find((a) => a.id === id);
  const [invMonth, setInvMonth] = useState<string | null>(null);

  const months = useMemo(() => (acc?.kind === 'credit' ? invoiceMonths(acc, s.transactions, s.today) : []), [acc, s.transactions, s.today]);
  const history = useMemo(
    () => (acc ? s.investment_snapshots.filter((x) => x.account_id === acc.id).sort((a, b) => a.date.localeCompare(b.date)) : []),
    [acc, s.investment_snapshots],
  );

  if (!acc) return <Navigate to="/contas" replace />;
  const bal = accountBalance(acc, s.transactions, s.investment_snapshots, s.today);
  const own = s.transactions
    .filter((t) => t.account_id === acc.id || t.to_account_id === acc.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const header = (
    <div className="topbar">
      <button className="back" onClick={() => (window.history.state?.idx > 0 ? nav(-1) : nav('/contas'))} aria-label="Voltar"><ArrowLeft size={20} /></button>
      <h1 className="title">{acc.name}</h1>
      <button className="icon-btn" onClick={() => openAccount(acc.id)} aria-label="Editar conta"><Pencil size={18} /></button>
    </div>
  );

  if (acc.kind === 'credit') {
    const closing = acc.closing_day ?? 28;
    const current = invoiceMonthOf(s.today, closing);
    const month = invMonth ?? months.find((m) => buildInvoice(acc, s.transactions, m).remaining > 0) ?? current;
    const inv = buildInvoice(acc, s.transactions, month);
    const open = months.reduce((sum, m) => sum + buildInvoice(acc, s.transactions, m).remaining, 0);
    const overdue = inv.remaining > 0 && inv.dueDate < s.today;
    const status = inv.total > 0 && inv.remaining === 0 ? ['Paga', 'ok'] : overdue ? ['Atrasada', 'over'] : inv.closingDate < s.today ? ['Fechada', 'pending'] : ['Aberta', ''];
    const next = addMonthsToMonth(month, 1);
    return (
      <div className="screen">
        {header}
        <section className="card">
          <MonthNav month={month} onChange={setInvMonth} max={addMonthsToMonth(current, 12)} />
          <div className="row-between" style={{ marginTop: 14 }}>
            <span className="muted">Fatura de {monthLabel(month, false)}</span>
            <span className={`badge ${status[1]}`}>{status[0]}</span>
          </div>
          <Hero value={inv.total} small />
          <div className="kv" style={{ marginTop: 10 }}><span>Fechamento</span><b>{shortDate(inv.closingDate)}</b></div>
          <div className="kv"><span>Vencimento</span><b>{shortDate(inv.dueDate)}</b></div>
          {inv.paid > 0 && <div className="kv"><span>Já pago</span><b className="green"><Money value={inv.paid} /></b></div>}
          {inv.remaining > 0 && <div className="kv"><span>Falta pagar</span><b className={overdue ? 'red' : ''}><Money value={inv.remaining} /></b></div>}
          {acc.credit_limit ? <div className="kv"><span>Limite disponível</span><b><Money value={Math.max(0, acc.credit_limit - open)} /></b></div> : null}
          {inv.remaining > 0 && (
            <button className="btn primary block" style={{ marginTop: 12 }}
              onClick={() => newTx({ kind: 'transfer', amount: inv.remaining, to_account_id: acc.id, invoice_ref: month, description: `Fatura ${acc.name}`,
                account_id: s.accounts.find((a) => a.is_default && a.kind === 'checking')?.id ?? s.accounts.find((a) => a.kind === 'checking' && !a.archived)?.id })}>
              Pagar fatura
            </button>
          )}
        </section>
        <SectionTitle title="Compras na fatura" action={<button className="link" onClick={() => newTx({ account_id: acc.id })}>+ Nova compra</button>} />
        {inv.txs.length === 0 ? <div className="card"><Empty title="Sem compras nesta fatura" /></div> : (
          <div className="list">{inv.txs.map((t) => <TxRow key={t.id} tx={t} accounts={s.accounts} categories={s.categories} showDate hideAccount onClick={() => editTx(t.id)} />)}</div>
        )}
        <p className="muted" style={{ fontSize: 13 }}>Compras após o dia {closing} entram na fatura de {monthLabel(next, false)}.</p>
      </div>
    );
  }

  if (acc.kind === 'investment') {
    return (
      <div className="screen">
        {header}
        <section className="card">
          <span className="muted">Saldo atual</span>
          <Hero value={bal} small />
          <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => openSnapshot(acc.id)}>Atualizar saldo</button>
        </section>
        {history.length >= 2 && (
          <div className="card"><AreaChart title={`Evolução de ${acc.name}`} points={history.map((h) => ({ label: dayLabel(h.date, s.today), short: monthShort(h.date.slice(0, 7)), value: h.balance }))} /></div>
        )}
        <SectionTitle title="Histórico de saldos" />
        <div className="group">
          {[...history].reverse().map((h) => (
            <div key={h.id} className="item"><span className="main"><b>{dayLabel(h.date, s.today)}</b></span><span className="side"><b><Money value={h.balance} /></b></span></div>
          ))}
          {history.length === 0 && <div className="item"><span className="main"><small>Saldo inicial informado: <Money value={acc.initial_balance} /></small></span></div>}
        </div>
        {own.length > 0 && (<>
          <SectionTitle title="Aportes e resgates" />
          <div className="list">{own.slice(0, 20).map((t) => <TxRow key={t.id} tx={t} accounts={s.accounts} categories={s.categories} showDate hideAccount onClick={() => editTx(t.id)} />)}</div>
        </>)}
      </div>
    );
  }

  return (
    <div className="screen">
      {header}
      <section className="card"><span className="muted">Saldo</span><Hero value={bal} small /></section>
      <SectionTitle title="Movimentações" action={<button className="link" onClick={() => newTx({ account_id: acc.id })}>+ Novo</button>} />
      {own.length === 0 ? <div className="card"><Empty title="Sem movimentações" /></div> : (
        <div className="list">{own.slice(0, 40).map((t) => <TxRow key={t.id} tx={t} accounts={s.accounts} categories={s.categories} showDate hideAccount onClick={() => editTx(t.id)} />)}</div>
      )}
    </div>
  );
}
