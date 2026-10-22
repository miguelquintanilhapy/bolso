import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowLeftRight, ArrowUp, Bell, Check, ChevronRight, CircleHelp, Eye, EyeOff, Landmark, Receipt, Send, Share, TrendingDown, TrendingUp, Wallet, X } from 'lucide-react';
import { useStore } from '../store';
import { usePrivacy, Hero, Money } from '../ui/privacy';
import { Empty, SectionTitle, TxRow, dayNet } from '../ui/common';
import { useEditor } from '../ui/editors';
import { ModalSheet } from '../ui/Sheet';
import { activeAccounts, accountBalance, buildInstallments, buildInvoice, forecast, invoiceMonthOf, invoiceMonths, monthSummary, netWorth, upcoming } from '../lib/finance';
import { parseQuickEntry } from '../lib/quickEntry';
import { addMonthsToMonth, dayLabel, endOfMonth, monthName, monthOf, shortDate } from '../lib/dates';
import { formatBRL } from '../lib/money';
import { getName } from '../lib/profile';
import type { NewTransaction, Account } from '../lib/types';

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
};

const HINTS = ['50 mercado', 'uber 23,90', '+3000 salário', '300 tv 3x', 'ontem 12 padaria #casa'];
const EXAMPLES: [string, string][] = [
  ['50 mercado', 'Despesa de R$ 50 em Alimentação'],
  ['uber 23,90', 'Despesa em Transporte'],
  ['+3000 salário', 'Receita (o + indica entrada)'],
  ['300 tv 3x cartão', 'Compra parcelada em 3x no cartão'],
  ['ontem 12 padaria', 'Com outra data (ontem, 05/10…)'],
  ['40 farmácia #mãe', 'Com tag'],
];

const LS = (k: string) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
const setLS = (k: string) => { try { localStorage.setItem(k, '1'); } catch { /* sem armazenamento */ } };

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => (navigator as unknown as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;

export function Home() {
  const s = useStore();
  const { hidden, toggle } = usePrivacy();
  const { newTx, openAccount } = useEditor();
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const sending = useRef(false); // trava contra duplo envio
  const [text, setText] = useState('');
  const [hint, setHint] = useState(0);
  const [help, setHelp] = useState(false);
  const [stepsHidden, setStepsHidden] = useState(() => LS('bolso:steps-off'));
  const [installHidden, setInstallHidden] = useState(() => LS('bolso:install-off'));
  const live = activeAccounts(s.accounts);

  useEffect(() => {
    if (text) return;
    const t = setInterval(() => setHint((h) => (h + 1) % HINTS.length), 3200);
    return () => clearInterval(t);
  }, [text]);

  const worth = useMemo(() => netWorth(s.accounts, s.transactions, s.investment_snapshots, s.today), [s.accounts, s.transactions, s.investment_snapshots, s.today]);
  const lastMonthEnd = endOfMonth(addMonthsToMonth(monthOf(s.today), -1));
  const worthBefore = useMemo(() => netWorth(s.accounts, s.transactions, s.investment_snapshots, lastMonthEnd), [s.accounts, s.transactions, s.investment_snapshots, lastMonthEnd]);
  const delta = Math.round((worth - worthBefore) * 100) / 100;
  const fc = useMemo(() => forecast(s.accounts, s.transactions, s.investment_snapshots, s.today), [s.accounts, s.transactions, s.investment_snapshots, s.today]);
  const sum = useMemo(() => monthSummary(s.transactions, monthOf(s.today)), [s.transactions, s.today]);
  const soon = useMemo(() => upcoming(s.accounts, s.transactions, s.today, 7), [s.accounts, s.transactions, s.today]);
  const unread = s.notifications.filter((n) => !n.read).length;
  const recent = useMemo(
    () => [...s.transactions].filter((t) => t.date <= s.today).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8),
    [s.transactions, s.today],
  );
  const groups = recent.reduce<Record<string, typeof recent>>((m, t) => ((m[t.date] ||= []).push(t), m), {});
  const name = getName(s.user.email);

  const steps = [
    { done: live.length > 0, title: 'Crie sua primeira conta', sub: 'Conta corrente, cartão ou investimento', run: () => openAccount() },
    { done: s.transactions.length > 0, title: 'Faça seu primeiro lançamento', sub: 'Digite no campo rápido, ex.: 50 mercado', run: () => inputRef.current?.focus() },
    { done: s.categories.some((c) => c.budget_limit), title: 'Defina um limite de orçamento', sub: 'Para o Bolso avisar quando você se aproximar', run: () => nav('/categorias') },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  const showSteps = !stepsHidden && doneCount < steps.length;
  const showInstall = !installHidden && isIOS() && !isStandalone();

  const quick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending.current) return;
    const r = parseQuickEntry(text, { categories: s.categories, accounts: s.accounts, today: s.today });
    if (!r.ok) return s.toast(r.reason);
    const d = r.draft;
    const acc = s.accounts.find((a) => a.id === d.account_id) ?? s.accounts.find((a) => a.is_default && !a.archived) ?? live.find((a) => a.kind === 'checking') ?? live[0];
    if (!acc) { s.toast('Crie uma conta primeiro.'); return; }
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
    const typed = text;
    sending.current = true;
    setText(''); // limpa já: o segundo toque encontra o campo vazio
    try {
      const rows = d.installments > 1 ? buildInstallments(base, d.installments, isCard, s.today, crypto.randomUUID()) : [base];
      const created = await s.addTransactions(rows);
      const cat = s.categories.find((c) => c.id === d.category_id)?.name;
      s.toast(`${d.kind === 'income' ? 'Entrada' : 'Saída'} de ${formatBRL(d.amount)} em ${cat} · ${acc.name}${d.installments > 1 ? ` · ${d.installments}x` : ''}`, {
        label: 'Desfazer', run: () => void s.remove('transactions', created.map((t) => t.id)),
      });
    } catch (err) {
      setText(typed); // não perde o que foi digitado se der erro
      s.toast(err instanceof Error ? err.message : 'Não consegui salvar.');
    } finally {
      sending.current = false;
    }
  };

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/mais" className="avatar" aria-label="Seu perfil">{name[0]?.toUpperCase()}</Link>
        <div className="greeting grow"><small>{greeting()}</small><b>{name}</b></div>
        <Link to="/notificacoes" className="icon-btn" aria-label={`Notificações${unread ? `, ${unread} não lidas` : ''}`}>
          <Bell size={21} />{unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
        </Link>
      </div>

      {s.mode === 'demo' && <p className="banner">Modo demonstração: os dados ficam só neste aparelho. Conecte o Supabase para sincronizar.</p>}

      {showInstall && (
        <div className="install" role="note">
          <Share size={22} style={{ flex: 'none', marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <b>Instale o Bolso no iPhone</b>
            <p className="muted" style={{ fontSize: 13.5 }}>No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.</p>
          </div>
          <button className="x" aria-label="Dispensar" onClick={() => { setLS('bolso:install-off'); setInstallHidden(true); }}><X size={18} /></button>
        </div>
      )}

      <section className="card" aria-label="Patrimônio">
        <div className="balance-label">
          <span>Patrimônio total</span>
          <button className="eye" onClick={toggle} aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}>{hidden ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div>
        <Hero value={worth} />
        {live.length > 0 && delta !== 0 && (
          <p className={delta > 0 ? 'green' : 'red'} style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 14, marginTop: 4 }}>
            {delta > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            <Money value={Math.abs(delta)} /> <span style={{ fontWeight: 500 }}>neste mês</span>
          </p>
        )}
        <div className="mini-stats">
          <div className="mini"><span>Disponível agora</span><b><Money value={fc.liquidNow} /></b></div>
          <div className="mini"><span>Previsto p/ fim de {monthName(monthOf(s.today))}</span><b><Money value={fc.projected} /></b></div>
        </div>
        <p className="hint">
          {monthName(monthOf(s.today))}: <span className="green"><Money value={sum.income} signed /></span> entradas · <Money value={sum.expense} /> saídas
        </p>
      </section>

      <form className="quick" onSubmit={quick}>
        <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Digite: ${HINTS[hint]}`}
          aria-label="Lançamento rápido" enterKeyHint="send" autoComplete="off" autoCapitalize="none" />
        <button type="button" className="help" onClick={() => setHelp(true)} aria-label="Como usar o lançamento rápido"><CircleHelp size={20} /></button>
        <button className="send" disabled={!text.trim()} aria-label="Registrar"><Send size={18} /></button>
      </form>

      <div className="actions">
        <button className="action" onClick={() => newTx({ kind: 'expense' })}><span className="circle"><ArrowUp size={22} /></span>Despesa</button>
        <button className="action" onClick={() => newTx({ kind: 'income' })}><span className="circle"><ArrowDown size={22} /></span>Receita</button>
        <button className="action" onClick={() => newTx({ kind: 'transfer' })}><span className="circle"><ArrowLeftRight size={22} /></span>Transferir</button>
        <button className="action" onClick={() => nav('/contas')}><span className="circle"><Landmark size={22} /></span>Contas</button>
      </div>

      {showSteps && (
        <section className="card" aria-label="Primeiros passos">
          <div className="row-between">
            <b style={{ fontSize: 17 }}>Primeiros passos</b>
            <span className="progress-dots" aria-label={`${doneCount} de ${steps.length} concluídos`}>{steps.map((x, i) => <i key={i} className={x.done ? 'on' : ''} />)}</span>
          </div>
          <div className="steps">
            {steps.map((x, i) => (
              <button key={x.title} className={`step ${x.done ? 'done' : ''}`} onClick={x.run} disabled={x.done}>
                <span className="n">{x.done ? <Check size={16} strokeWidth={3} className="check-pop" /> : i + 1}</span>
                <span style={{ flex: 1 }}><b>{x.title}</b><small>{x.sub}</small></span>
                {!x.done && <ChevronRight size={18} className="muted" />}
              </button>
            ))}
          </div>
          <button className="link" style={{ marginTop: 6 }} onClick={() => { setLS('bolso:steps-off'); setStepsHidden(true); }}>Ocultar</button>
        </section>
      )}

      {live.length > 0 && (
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
                <span className="main"><b>{u.title}</b><small className={u.date < s.today ? 'red' : ''}>{u.date < s.today ? `Atrasado desde ${shortDate(u.date)}` : `Vence ${dayLabel(u.date, s.today).toLowerCase()} · ${shortDate(u.date)}`}</small></span>
                <span className="side"><b className={u.kind === 'income' ? 'green' : ''}><Money value={u.amount} signed={u.kind === 'income'} /></b></span>
              </button>
            ))}
          </div>
        </>
      )}

      <SectionTitle title="Últimos lançamentos" action={<Link className="link" to="/lancamentos">Ver todos <ChevronRight size={16} /></Link>} />
      {recent.length === 0 ? (
        <div className="card">
          <Empty icon={<Receipt size={26} />} title="Nenhum lançamento ainda"
            action={live.length ? <button className="btn primary" onClick={() => inputRef.current?.focus()}>Fazer o primeiro lançamento</button> : undefined}>
            Digite no campo rápido, por exemplo <code>50 mercado</code>.
          </Empty>
        </div>
      ) : (
        <div className="list">
          {Object.entries(groups).map(([date, rows]) => (
            <div key={date} className="list">
              <div className="day-label"><span>{dayLabel(date, s.today)}</span><b><Money value={dayNet(rows)} signed /></b></div>
              {rows.map((t) => <TxRow key={t.id} tx={t} accounts={s.accounts} categories={s.categories} onClick={() => nav(`/lancamentos/${t.id}`)} />)}
            </div>
          ))}
        </div>
      )}

      <ModalSheet open={help} onClose={() => setHelp(false)} title="Lançamento rápido">
        <p className="muted">Digite o valor e uma palavra. O Bolso descobre a categoria sozinho e aprende palavras novas. Toque num exemplo para usar.</p>
        <div className="help-list">
          {EXAMPLES.map(([ex, what]) => (
            <button key={ex} className="help-ex" onClick={() => { setText(ex); setHelp(false); setTimeout(() => inputRef.current?.focus(), 250); }}>
              <code>{ex}</code><span>{what}</span>
            </button>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 13 }}>Dica: acrescente o nome de uma conta (ex.: <code>nubank</code>) para escolher onde lançar.</p>
      </ModalSheet>
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
