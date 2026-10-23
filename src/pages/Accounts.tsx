import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Pencil, Plus, RefreshCw, Scale, Trash2, TriangleAlert } from 'lucide-react';
import { useStore } from '../store';
import { Empty, MonthNav, SectionTitle, TxRow } from '../ui/common';
import { useEditor } from '../ui/editors';
import { AreaChart } from '../ui/Charts';
import { Hero, Money } from '../ui/privacy';
import { AccountIcon, INVOICE_STATUS, KIND_LABEL } from '../ui/accountUi';
import { describeAccount } from '../lib/accountInfo';
import { accountBalance, activeAccounts, cardOverview, invoiceStatus, investmentStats, netWorth } from '../lib/finance';
import { addMonthsToMonth, dayLabel, diffDays, monthLabel, monthOf, monthShort, shortDate } from '../lib/dates';
import { formatBRL, round2 } from '../lib/money';
import type { Account } from '../lib/types';

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${formatBRL(Math.abs(n))}`;

export function Accounts() {
  const s = useStore();
  const { openAccount } = useEditor();
  const nav = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const live = activeAccounts(s.accounts);
  const archived = s.accounts.filter((a) => a.archived);

  const info = useMemo(
    () => new Map(live.map((a) => [a.id, describeAccount(a, s.transactions, s.investment_snapshots, s.today)])),
    [live, s.transactions, s.investment_snapshots, s.today],
  );

  const summary = useMemo(() => {
    let cash = 0, invested = 0, owed = 0;
    for (const a of live) {
      const b = accountBalance(a, s.transactions, s.investment_snapshots, s.today);
      if (a.kind === 'checking') cash += b;
      else if (a.kind === 'investment') invested += b;
      else owed += Math.max(0, -b);
    }
    return { cash: round2(cash), invested: round2(invested), owed: round2(owed), worth: netWorth(s.accounts, s.transactions, s.investment_snapshots, s.today) };
  }, [live, s.accounts, s.transactions, s.investment_snapshots, s.today]);

  const section = (kind: Account['kind'], title: string, total: React.ReactNode) => {
    const rows = live.filter((a) => a.kind === kind);
    if (!rows.length) return null;
    return (
      <>
        <div className="row-between" style={{ margin: '6px 6px -6px' }}>
          <span className="group-title" style={{ margin: 0 }}>{title}</span>
          <span className="muted" style={{ fontSize: 13 }}>{total}</span>
        </div>
        <div className="group">
          {rows.map((a) => {
            const i = info.get(a.id)!;
            return (
              <button key={a.id} className="item" onClick={() => nav(`/contas/${a.id}`)}>
                <AccountIcon account={a} />
                <span className="main">
                  <b>{a.name}</b>
                  <small className={`wrap ${i.tone ?? ''}`}>{i.sub || KIND_LABEL[a.kind]}</small>
                  {i.extra && <small>{i.extra}</small>}
                </span>
                <span className="side">
                  <b className={a.kind === 'checking' && i.main < 0 ? 'red' : ''}><Money value={i.main} /></b>
                  {i.caption && <small>{i.caption}</small>}
                  {i.status === 'overdue' ? <span className="badge over">Vencida</span>
                    : i.dueInDays !== undefined && i.dueInDays >= 0 && i.dueInDays <= 5 ? <span className="badge pending">{i.dueInDays === 0 ? 'Vence hoje' : `Vence em ${i.dueInDays}d`}</span>
                    : a.kind === 'checking' && i.main < 0 ? <span className="badge over">Saldo negativo</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/mais" className="back" aria-label="Voltar"><ArrowLeft size={20} /></Link>
        <h1 className="title">Suas contas</h1>
        <button className="icon-btn" onClick={() => openAccount()} aria-label="Adicionar"><Plus size={20} /></button>
      </div>

      <div className="split">
      <div className="split-col sticky">
      {live.length === 0 ? (
        <div className="card"><Empty title="Nenhuma conta ainda" action={<button className="btn primary" onClick={() => openAccount()}>Criar a primeira</button>}>
          Comece por onde seu dinheiro está: conta corrente, cartão de crédito ou investimento.
        </Empty></div>
      ) : (
        <section className="card">
          <span className="muted">Patrimônio</span>
          <Hero value={summary.worth} small />
          <div className="mini-stats">
            <div className="mini"><span>Em contas</span><b><Money value={summary.cash} /></b></div>
            <div className="mini"><span>Investido</span><b><Money value={summary.invested} /></b></div>
          </div>
          {summary.owed > 0 && <p className="hint">Já descontado do patrimônio: <b className="red"><Money value={summary.owed} /></b> de compras no cartão.</p>}
        </section>
      )}
      </div>
      <div className="split-col">
      {section('checking', 'Contas', <Money value={summary.cash} />)}
      {section('credit', 'Cartões de crédito', summary.owed > 0 ? <>você deve <Money value={summary.owed} /></> : 'sem dívida')}
      {section('investment', 'Investimentos', <Money value={summary.invested} />)}

      {archived.length > 0 && (
        <>
          <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setShowArchived((v) => !v)}>{showArchived ? 'Ocultar' : 'Mostrar'} arquivadas ({archived.length})</button>
          {showArchived && <div className="group">{archived.map((a) => (
            <button key={a.id} className="item" onClick={() => nav(`/contas/${a.id}`)}><AccountIcon account={{ ...a, color: '#8a8f98' }} /><span className="main"><b>{a.name}</b><small>{KIND_LABEL[a.kind]} · arquivada</small></span></button>
          ))}</div>}
        </>
      )}
      </div>
      </div>
    </div>
  );
}

export function AccountDetail() {
  const { id } = useParams();
  const s = useStore();
  const { openAccount, newTx, editTx, openSnapshot, openAdjust } = useEditor();
  const nav = useNavigate();
  const acc = s.accounts.find((a) => a.id === id);
  const [invMonth, setInvMonth] = useState<string | null>(null);

  const overview = useMemo(() => (acc?.kind === 'credit' ? cardOverview(acc, s.transactions, s.today) : null), [acc, s.transactions, s.today]);
  const history = useMemo(
    () => (acc ? s.investment_snapshots.filter((x) => x.account_id === acc.id).sort((a, b) => a.date.localeCompare(b.date)) : []),
    [acc, s.investment_snapshots],
  );
  const stats = useMemo(() => (acc?.kind === 'investment' ? investmentStats(acc, s.transactions, s.investment_snapshots, s.today) : null), [acc, s.transactions, s.investment_snapshots, s.today]);

  if (!acc) return <Navigate to="/contas" replace />;
  const bal = accountBalance(acc, s.transactions, s.investment_snapshots, s.today);
  const checking = s.accounts.find((a) => a.is_default && a.kind === 'checking' && !a.archived) ?? s.accounts.find((a) => a.kind === 'checking' && !a.archived);
  const own = s.transactions.filter((t) => t.account_id === acc.id || t.to_account_id === acc.id).sort((a, b) => b.date.localeCompare(a.date));
  const rowProps = { accounts: s.accounts, categories: s.categories, showDate: true, hideAccount: true } as const;

  const header = (
    <div className="topbar">
      <button className="back" onClick={() => (window.history.state?.idx > 0 ? nav(-1) : nav('/contas'))} aria-label="Voltar"><ArrowLeft size={20} /></button>
      <AccountIcon account={acc} size={36} />
      <div className="grow" style={{ minWidth: 0 }}>
        <h1 className="title" style={{ fontSize: 17, lineHeight: 1.15 }}>{acc.name}</h1>
        <small className="muted">{KIND_LABEL[acc.kind]}{acc.archived ? ' · arquivada' : ''}</small>
      </div>
      <button className="icon-btn" onClick={() => openAccount(acc.id)} aria-label="Editar"><Pencil size={18} /></button>
    </div>
  );

  // ───────────── Cartão de crédito ─────────────
  if (acc.kind === 'credit' && overview) {
    const ov = overview;
    const inv = ov.invoices.find((i) => i.month === (invMonth ?? ov.focus.month)) ?? ov.focus;
    const month = inv.month;
    const status = invoiceStatus(inv, s.today);
    const [statusText, statusStyle] = INVOICE_STATUS[status];
    const closing = acc.closing_day ?? 28;
    const daysToClose = diffDays(inv.closingDate, s.today);
    const overdueTotal = round2(ov.overdue.reduce((x, i) => x + i.remaining, 0));
    const level = (ov.limitUsedPct ?? 0) >= 100 ? 'over' : (ov.limitUsedPct ?? 0) >= 80 ? 'warn' : 'blue';
    return (
      <div className="screen">
        {header}
        <div className="split">
          <div className="split-col">
            {ov.overdue.length > 0 && (
              <button className="alert-strip" onClick={() => setInvMonth(ov.overdue[0].month)}>
                <TriangleAlert size={18} />
                {ov.overdue.length === 1 ? `Fatura de ${monthLabel(ov.overdue[0].month, false)} vencida` : `${ov.overdue.length} faturas vencidas`} · {formatBRL(overdueTotal)}
                <span>Ver</span>
              </button>
            )}
            <section className="card">
              <MonthNav month={month} onChange={setInvMonth} max={addMonthsToMonth(monthOf(s.today), 12)} />
              <div className="row-between" style={{ marginTop: 14 }}>
                <span className="muted">Fatura de {monthLabel(month, false)}</span>
                <span className={`badge ${statusStyle}`}>{statusText}</span>
              </div>
              <Hero value={inv.total} small />
              <p className="hint" style={{ marginTop: 2 }}>Só as compras desta fatura. O total que você deve no cartão está em “Limite”, abaixo.</p>
              <div className="kv" style={{ marginTop: 10 }}>
                <span>{daysToClose >= 0 ? 'Fecha em' : 'Fechou em'}</span>
                <b>{shortDate(inv.closingDate)}{daysToClose > 0 ? ` · em ${daysToClose} dia${daysToClose > 1 ? 's' : ''}` : daysToClose === 0 ? ' · hoje' : ''}</b>
              </div>
              <div className="kv"><span>Vence em</span><b className={status === 'overdue' ? 'red' : ''}>{shortDate(inv.dueDate)}</b></div>
              {inv.paid > 0 && <div className="kv"><span>Já pago</span><b className="green"><Money value={inv.paid} /></b></div>}
              {inv.remaining > 0 && <div className="kv"><span>Falta pagar</span><b className={status === 'overdue' ? 'red' : ''}><Money value={inv.remaining} /></b></div>}
              {inv.remaining > 0 && (
                <button className="btn primary block" style={{ marginTop: 12 }}
                  onClick={() => newTx({ kind: 'transfer', amount: inv.remaining, to_account_id: acc.id, invoice_ref: month, description: `Fatura ${acc.name}`, account_id: checking?.id })}>
                  Pagar fatura · {formatBRL(inv.remaining)}
                </button>
              )}
              {status === 'paid' && <p className="hint">✓ Fatura paga.</p>}
            </section>

            <section className="card">
              <div className="row-between"><span className="muted">Limite</span>{acc.credit_limit ? <b><Money value={acc.credit_limit} /></b> : <button className="link" onClick={() => openAccount(acc.id)}>Definir limite</button>}</div>
              {acc.credit_limit ? (
                <>
                  <div className={`meter ${level}`} style={{ margin: '10px 0' }} role="progressbar" aria-valuenow={ov.limitUsedPct ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Limite usado">
                    <i style={{ width: `${ov.limitUsedPct ?? 0}%` }} />
                  </div>
                  <div className="kv"><span>Usado ({ov.limitUsedPct}%) · todas as faturas</span><b><Money value={ov.committed} /></b></div>
                  <div className="kv"><span>Disponível</span><b className="green"><Money value={ov.limitAvailable ?? 0} /></b></div>
                </>
              ) : (
                <div className="kv"><span>Comprometido em faturas</span><b><Money value={ov.committed} /></b></div>
              )}
              <p className="hint">O "usado" inclui parcelas de faturas futuras, como no cartão de verdade.</p>
            </section>

          </div>
          <div className="split-col">
            <SectionTitle title="Compras na fatura" action={<button className="link" onClick={() => newTx({ account_id: acc.id })}>+ Nova compra</button>} />
            {inv.txs.length === 0 ? <div className="card"><Empty title="Sem compras nesta fatura" /></div> : (
              <div className="list">{inv.txs.map((t) => <TxRow key={t.id} tx={t} {...rowProps} onClick={() => editTx(t.id)} />)}</div>
            )}
            <p className="muted" style={{ fontSize: 13 }}>Compras feitas até o dia {closing} entram na fatura do mês; depois, na de {monthLabel(addMonthsToMonth(month, 1), false)}. Quando você paga, o valor abate da fatura mais antiga em aberto.</p>
          </div>
        </div>
      </div>
    );
  }

  // ───────────── Investimento ─────────────
  if (acc.kind === 'investment' && stats) {
    const put = round2(acc.initial_balance + stats.contributed);
    const rows = [...history].reverse().map((h) => {
      const expected = accountBalance(acc, s.transactions, s.investment_snapshots.filter((x) => x.id !== h.id), h.date);
      return { h, gain: round2(h.balance - expected) };
    });
    return (
      <div className="screen">
        {header}
        <div className="split">
          <div className="split-col">
            <section className="card">
              <span className="muted">Saldo atual</span>
              <Hero value={bal} small />
              <div className="stat-row" style={{ marginTop: 14 }}>
                <div className="stat"><span>Você colocou</span><b><Money value={put} /></b></div>
                <div className="stat"><span>Rendimento</span><b className={stats.yieldTotal > 0 ? 'green' : stats.yieldTotal < 0 ? 'red' : ''}><Money value={stats.yieldTotal} signed /></b>{stats.yieldPct != null && <small className="muted">{stats.yieldPct > 0 ? '+' : ''}{stats.yieldPct.toLocaleString('pt-BR')}%</small>}</div>
                <div className="stat"><span>Neste mês</span><b className={stats.monthYield > 0 ? 'green' : stats.monthYield < 0 ? 'red' : ''}><Money value={stats.monthYield} signed /></b></div>
              </div>
              <div className="grid2" style={{ marginTop: 14 }}>
                <button className="btn" onClick={() => newTx({ kind: 'transfer', account_id: checking?.id, to_account_id: acc.id, description: 'Aporte' })}><ArrowDownToLine size={17} /> Aportar</button>
                <button className="btn" onClick={() => newTx({ kind: 'transfer', account_id: acc.id, to_account_id: checking?.id, description: 'Resgate' })}><ArrowUpFromLine size={17} /> Resgatar</button>
              </div>
              <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => openSnapshot(acc.id)}><RefreshCw size={17} /> Atualizar saldo</button>
              <p className="hint">{stats.snapshots === 0
                ? 'Ainda não há saldo informado: o valor é o inicial mais os aportes. Quando olhar seu app de investimentos, toque em "Atualizar saldo" para o Bolso calcular o rendimento.'
                : 'Aportes e resgates mudam o saldo na hora. O rendimento aparece quando você atualiza o saldo com o valor do seu app de investimentos.'}</p>
            </section>

            {history.length >= 2 && (
              <div className="card"><AreaChart title={`Evolução de ${acc.name}`} points={history.map((h) => ({ label: dayLabel(h.date, s.today), short: monthShort(h.date.slice(0, 7)), value: h.balance }))} /></div>
            )}

          </div>
          <div className="split-col">
            <SectionTitle title="Saldos informados" />
            {rows.length === 0 ? (
              <div className="card"><Empty title="Nenhum saldo informado">O saldo inicial é {formatBRL(acc.initial_balance)}.</Empty></div>
            ) : (
              <div className="group">
                {rows.map(({ h, gain }) => (
                  <div key={h.id} className="item">
                    <span className="main">
                      <b>{dayLabel(h.date, s.today)}</b>
                      <small className={gain > 0 ? 'green' : gain < 0 ? 'red' : ''}>{gain === 0 ? 'sem variação' : `${signed(gain)} de ${gain > 0 ? 'rendimento' : 'variação'}`}</small>
                    </span>
                    <span className="side"><b><Money value={h.balance} /></b></span>
                    <button className="trash" aria-label={`Apagar saldo de ${dayLabel(h.date, s.today)}`} onClick={() => void s.removeWithUndo('investment_snapshots', [h], 'Saldo apagado')}><Trash2 size={17} /></button>
                  </div>
                ))}
              </div>
            )}

            {own.length > 0 && (
              <>
                <SectionTitle title="Aportes e resgates" />
                <div className="list">{own.slice(0, 20).map((t) => <TxRow key={t.id} tx={t} {...rowProps} onClick={() => editTx(t.id)} />)}</div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ───────────── Conta ─────────────
  const monthRows = own.filter((t) => monthOf(t.date) === monthOf(s.today) && t.kind !== 'transfer');
  const inMonth = round2(monthRows.filter((t) => t.kind === 'income').reduce((x, t) => x + t.amount, 0));
  const outMonth = round2(monthRows.filter((t) => t.kind === 'expense').reduce((x, t) => x + t.amount, 0));
  return (
    <div className="screen">
      {header}
      <div className="split">
        <div className="split-col">
          <section className="card">
            <span className="muted">Saldo</span>
            <Hero value={bal} small />
            <div className="mini-stats">
              <div className="mini"><span>Entrou em {monthLabel(monthOf(s.today), false)}</span><b className="green"><Money value={inMonth} /></b></div>
              <div className="mini"><span>Saiu em {monthLabel(monthOf(s.today), false)}</span><b><Money value={outMonth} /></b></div>
            </div>
            <button className="btn block" style={{ marginTop: 12 }} onClick={() => openAdjust(acc.id)}><Scale size={17} /> Ajustar saldo</button>
            <p className="hint">O saldo do banco não bate com o do Bolso? Ajuste e o Bolso cria um lançamento de correção.</p>
          </section>
        </div>
        <div className="split-col">
          <SectionTitle title="Movimentações" action={<button className="link" onClick={() => newTx({ account_id: acc.id })}>+ Novo</button>} />
          {own.length === 0 ? <div className="card"><Empty title="Sem movimentações" /></div> : (
            <div className="list">{own.slice(0, 40).map((t) => <TxRow key={t.id} tx={t} {...rowProps} onClick={() => editTx(t.id)} />)}</div>
          )}
        </div>
      </div>
    </div>
  );
}
