import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, ArrowUp, ArrowDown, Bell, ChevronRight, Eye, EyeOff, Landmark, Send, Wallet } from 'lucide-react';
import { useStore } from '../store';
import { usePrivacy, Hero, Money } from '../ui/privacy';
import { Empty, SectionTitle, TxRow } from '../ui/common';
import { useEditor } from '../ui/editors';
import { activeAccounts, accountBalance, buildInstallments, buildInvoice, forecast, invoiceMonthOf, invoiceMonths, monthSummary, upcoming } from '../lib/finance';
import { parseQuickEntry } from '../lib/quickEntry';
import { dayLabel, monthName, monthOf, shortDate } from '../lib/dates';
import type { NewTransaction, Account } from '../lib/types';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
};

export function Home() {
  const s = useStore();
  const { hidden, toggle } = usePrivacy();
  const { newTx, openAccount } = useEditor();
  const nav = useNavigate();
  const [text, setText] = useState('');
  const live = activeAccounts(s.accounts);

  const worth = useMemo(() => live.reduce((sum, a) => sum + accountBalance(a, s.transactions, s.investment_snapshots, s.today), 0), [live, s.transactions, s.investment_snapshots, s.today]);
  const fc = useMemo(() => forecast(s.accounts, s.transactions, s.investment_snapshots, s.today), [s.accounts, s.transactions, s.investment_snapshots, s.today]);
  const sum = useMemo(() => monthSummary(s.transactions, monthOf(s.today)), [s.transactions, s.today]);
  const soon = useMemo(() => upcoming(s.accounts, s.transactions, s.today, 7), [s.accounts, s.transactions, s.today]);
  const unread = s.notifications.filter((n) => !n.read).length;
  const recent = useMemo(
    () => [...s.transactions].filter((t) => t.date <= s.today).sort((a, b) => b.date.localeCompare(a.date) || 0).slice(0, 8),
    [s.transactions, s.today],
  );
  const groups = recent.reduce<Record<string, typeof recent>>((m, t) => ((m[t.date] ||= []).push(t), m), {});
  const name = s.user.email.split('@')[0].replace(/[._-]+/g, ' ');
  const initial = (name[0] ?? 'B').toUpperCase();

  const quick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const r = parseQuickEntry(text, { categories: s.categories, accounts: s.accounts, today: s.today });
    if (!r.ok) return s.toast(r.reason);
    const d = r.draft;
    const acc = s.accounts.find((a) => a.id === d.account_id) ?? s.accounts.find((a) => a.is_default && !a.archived) ?? live.find((a) => a.kind === 'checking') ?? live[0];
    if (!acc) { s.toast('Crie uma conta primeiro (Mais → Contas e cartões).'); return; }
    // categoria desconhecida: abre o formulário já preenchido (e aprende a palavra ao salvar)
    if (!d.category_id) {
      setText('');
      return newTx({ kind: d.kind, amount: d.amount, description: d.description, account_id: acc.id, date: d.date, installments: d.installments, tags: d.tags, keyword: d.keyword });
    }
    const isCard = acc.kind === 'credit';
    const base: NewTransaction = {
      kind: d.kind, amount: d.amount, date: d.date, description: d.description, notes: '', tags: d.tags,
      status: isCard || d.date <= s.today ? 'paid' : 'pending', account_id: acc.id, to_account_id: null, category_id: d.category_id,
      installment_group: null, installment_number: null, installment_total: null, recurrence_id: null, ref_month: null, invoice_ref: null,
    };
    try {
      const rows = d.installments > 1 ? buildInstallments(base, d.installments, isCard, s.today, crypto.randomUUID()) : [base];
      const created = await s.addTransactions(rows);
      setText('');
      const cat = s.categories.find((c) => c.id === d.category_id)?.name;
      s.toast(`${d.kind === 'income' ? 'Entrada' : 'Saída'} de ${d.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em ${cat} · ${acc.name}${d.installments > 1 ? ` · ${d.installments}x` : ''}`, {
        label: 'Desfazer', run: () => void s.remove('transactions', created.map((t) => t.id)),
      });
    } catch (err) {
      s.toast(err instanceof Error ? err.message : 'Não consegui salvar.');
    }
  };

  return (
    <div className="screen">
      <div className="topbar">
        <div className="avatar" aria-hidden>{initial}</div>
        <div className="greeting grow"><small>{greeting()}</small><b style={{ textTransform: 'capitalize' }}>{name}</b></div>
        <Link to="/notificacoes" className="icon-btn" aria-label={`Notificações${unread ? `, ${unread} não lidas` : ''}`}>
          <Bell size={21} />{unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
        </Link>
      </div>

      {s.mode === 'demo' && <p className="banner">Modo demonstração: os dados ficam só neste aparelho. Conecte o Supabase para sincronizar.</p>}

      <section className="card" aria-label="Patrimônio">
        <div className="balance-label">
          <span>Patrimônio total</span>
          <button className="eye" onClick={toggle} aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}>{hidden ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div>
        <Hero value={worth} />
        <div className="mini-stats">
          <div className="mini"><span>Disponível agora</span><b><Money value={fc.liquidNow} /></b></div>
          <div className="mini"><span>Previsto p/ fim de {monthName(monthOf(s.today))}</span><b><Money value={fc.projected} /></b></div>
        </div>
        <p className="hint">
          {monthName(monthOf(s.today))}: <span className="green"><Money value={sum.income} signed /></span> entradas · <Money value={sum.expense} /> saídas
        </p>
      </section>

      <form className="quick" onSubmit={quick}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Lançamento rápido: 50 mercado" aria-label="Lançamento rápido" enterKeyHint="send" autoComplete="off" />
        <button className="send" disabled={!text.trim()} aria-label="Registrar"><Send size={18} /></button>
      </form>

      <div className="actions">
        <button className="action" onClick={() => newTx({ kind: 'expense' })}><span className="circle"><ArrowUp size={22} /></span>Despesa</button>
        <button className="action" onClick={() => newTx({ kind: 'income' })}><span className="circle"><ArrowDown size={22} /></span>Receita</button>
        <button className="action" onClick={() => newTx({ kind: 'transfer' })}><span className="circle"><ArrowLeftRight size={22} /></span>Transferir</button>
        <button className="action" onClick={() => nav('/contas')}><span className="circle"><Landmark size={22} /></span>Contas</button>
      </div>

      {live.length === 0 ? (
        <section className="card">
          <Empty title="Comece criando sua primeira conta">
            <p>Pode ser sua conta corrente, um cartão de crédito ou um investimento.</p>
            <button className="btn primary" style={{ marginTop: 12 }} onClick={() => openAccount()}>Criar conta</button>
          </Empty>
        </section>
      ) : (
        <>
          <SectionTitle title="Contas e cartões" action={<Link className="link" to="/contas">Ver todas <ChevronRight size={16} /></Link>} />
          <div className="carousel">
            {live.map((a) => <AccountCard key={a.id} account={a} only={live.length === 1} />)}
          </div>
        </>
      )}

      {soon.length > 0 && (
        <>
          <SectionTitle title="Próximos 7 dias" />
          <div className="group">
            {soon.slice(0, 5).map((u) => (
              <button key={u.id} className="item" onClick={() => nav(u.link)}>
                <span className={`ico ${u.kind === 'income' ? 'in' : u.date < s.today ? 'bad' : ''}`}>{u.kind === 'invoice' ? <Wallet size={19} /> : u.kind === 'income' ? <ArrowDown size={19} /> : <ArrowUp size={19} />}</span>
                <span className="main"><b>{u.title}</b><small>{u.date < s.today ? `Atrasado desde ${shortDate(u.date)}` : `Vence ${dayLabel(u.date, s.today).toLowerCase()} · ${shortDate(u.date)}`}</small></span>
                <span className="side"><b className={u.kind === 'income' ? 'green' : ''}><Money value={u.amount} signed={u.kind === 'income'} /></b></span>
              </button>
            ))}
          </div>
        </>
      )}

      <SectionTitle title="Últimos lançamentos" action={<Link className="link" to="/lancamentos">Ver todos <ChevronRight size={16} /></Link>} />
      {recent.length === 0 ? (
        <div className="card"><Empty title="Nenhum lançamento ainda">Use o campo rápido acima, por exemplo: <b style={{ display: 'inline' }}>50 mercado</b></Empty></div>
      ) : (
        <div className="list">
          {Object.entries(groups).map(([date, rows]) => (
            <div key={date} className="list">
              <div className="day-label">{dayLabel(date, s.today)}</div>
              {rows.map((t) => <TxRow key={t.id} tx={t} accounts={s.accounts} categories={s.categories} onClick={() => nav(`/lancamentos/${t.id}`)} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountCard({ account: a, only }: { account: Account; only: boolean }) {
  const s = useStore();
  const nav = useNavigate();
  const bal = accountBalance(a, s.transactions, s.investment_snapshots, s.today);
  let sub = a.kind === 'investment' ? 'Investimento' : 'Conta corrente';
  let big = bal;
  let meta = '';
  if (a.kind === 'credit') {
    const month = invoiceMonthOf(s.today, a.closing_day ?? 28);
    const cur = invoiceMonths(a, s.transactions, s.today).find((m) => buildInvoice(a, s.transactions, m).remaining > 0) ?? month;
    const inv = buildInvoice(a, s.transactions, cur);
    sub = 'Cartão de crédito · fatura aberta';
    big = inv.remaining;
    meta = `Vence ${shortDate(inv.dueDate)}`;
  }
  return (
    <button className={`acc-card ${only ? 'only' : ''}`} style={{ background: `linear-gradient(145deg, ${a.color === '#111111' ? '#2a2d33' : a.color} 0%, #0e0f12 120%)` }} onClick={() => nav(`/contas/${a.id}`)}>
      <div><small>{a.name}</small><b className="big"><Money value={big} /></b><small>{sub}</small></div>
      <div className="meta"><span>{meta}</span><span>{a.kind === 'credit' && a.credit_limit ? <>Limite <Money value={a.credit_limit} /></> : ''}</span></div>
    </button>
  );
}
