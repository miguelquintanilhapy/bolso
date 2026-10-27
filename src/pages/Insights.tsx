import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash } from 'lucide-react';
import { useStore } from '../store';
import { MonthNav, Pills, SectionTitle, TxRow } from '../ui/common';
import { AreaChart, BarChart } from '../ui/Charts';
import { CategoryIcon } from '../ui/icons';
import { Money, useMaskedText } from '../ui/privacy';
import { useEditor } from '../ui/editors';
import { accountBalance, activeAccounts, monthSummary, monthlyEvolution, netWorthSeries, spendingByCategory, spendingByTag } from '../lib/finance';
import { addMonthsToMonth, monthLabel, monthOf, monthShort } from '../lib/dates';
import { round2 } from '../lib/money';

type Tab = 'summary' | 'evolution' | 'worth';

export function Insights() {
  const [tab, setTab] = useState<Tab>('summary');
  return (
    <div className="screen">
      <div className="topbar"><h1 className="title page-title">Insights</h1></div>
      <Pills<Tab> value={tab} onChange={setTab} options={[{ id: 'summary', label: 'Resumo' }, { id: 'evolution', label: 'Evolução' }, { id: 'worth', label: 'Patrimônio' }]} />
      {tab === 'summary' && <Summary />}
      {tab === 'evolution' && <Evolution />}
      {tab === 'worth' && <Worth />}
    </div>
  );
}

function Summary() {
  const s = useStore();
  const { editTx } = useEditor();
  const mask = useMaskedText();
  const nav = useNavigate();
  const [month, setMonth] = useState(monthOf(s.today));
  const tagSpend = useMemo(() => spendingByTag(s.transactions, month), [s.transactions, month]);
  // abre o Extrato já filtrado pela tag e pelo mês
  const openTag = (tag: string) => {
    try { sessionStorage.setItem('bolso:extrato', JSON.stringify({ month, allTime: false, type: 'all', q: '', accountId: '', categoryId: '', tag })); } catch { /* sem armazenamento */ }
    nav('/lancamentos');
  };
  const sum = monthSummary(s.transactions, month);
  const cats = useMemo(() => spendingByCategory(s.transactions, month), [s.transactions, month]);
  const total = cats.reduce((a, c) => a + c.total, 0);
  const prev = monthSummary(s.transactions, addMonthsToMonth(month, -1));
  const change = prev.expense > 0 ? Math.round(((sum.expense - prev.expense) / prev.expense) * 100) : null;
  const topCat = cats[0] ? s.categories.find((x) => x.id === cats[0].categoryId)?.name ?? 'Sem categoria' : null;
  const top = useMemo(() => s.transactions.filter((t) => t.kind === 'expense' && monthOf(t.date) === month).sort((a, b) => b.amount - a.amount).slice(0, 5), [s.transactions, month]);
  return (
    <>
      <MonthNav month={month} onChange={setMonth} />
      {sum.expense > 0 && (
        <p className="summary-line" role="status" style={{ marginTop: -4 }}>
          Você gastou <b><Money value={sum.expense} /></b> em {monthLabel(month, false)}
          {change !== null && change !== 0 ? <>, {Math.abs(change)}% {change > 0 ? 'a mais' : 'a menos'} que no mês anterior</> : null}.
          {topCat && <> A maior parte foi com <b>{topCat}</b> ({total ? Math.round((cats[0].total / total) * 100) : 0}%).</>}
        </p>
      )}
      <div className="grid3">
        <div className="card" style={{ padding: 11 }}><span className="muted" style={{ fontSize: 12.5 }}>Entradas</span><b className="green" style={{ display: 'block' }}><Money value={sum.income} /></b></div>
        <div className="card" style={{ padding: 11 }}><span className="muted" style={{ fontSize: 12.5 }}>Saídas</span><b style={{ display: 'block' }}><Money value={sum.expense} /></b></div>
        <div className="card" style={{ padding: 11 }}><span className="muted" style={{ fontSize: 12.5 }}>Saldo</span><b className={sum.net < 0 ? 'red' : 'green'} style={{ display: 'block' }}><Money value={sum.net} /></b></div>
      </div>

      <div className="split">
        <div className="split-col">
          <SectionTitle title="Gastos por categoria" />
          <div className="card stack" style={{ gap: 14 }}>
            {cats.length === 0 && <p className="muted">Nenhuma despesa em {monthLabel(month, false)}.</p>}
            {cats.map((c) => {
              const cat = s.categories.find((x) => x.id === c.categoryId);
              const pct = total ? (c.total / total) * 100 : 0;
              return (
                <div key={c.categoryId ?? 'none'} className="catbar">
                  <span className="ico"><CategoryIcon name={cat?.icon} size={15} /></span>
                  <span className="nm"><span>{cat?.name ?? 'Sem categoria'}</span><span className="muted">{pct.toFixed(0)}%</span></span>
                  <b style={{ fontSize: 14 }}><Money value={c.total} /></b>
                  <div className="meter blue" role="img" aria-label={`${cat?.name ?? 'Sem categoria'}: ${mask(c.total)}`}><i style={{ width: `${(c.total / cats[0].total) * 100}%` }} /></div>
                </div>
              );
            })}
          </div>

        </div>
        <div className="split-col">
          {tagSpend.length > 0 && (
            <>
              <SectionTitle title="Por tag" />
              <div className="group">
                {tagSpend.slice(0, 8).map((t) => (
                  <button key={t.tag} className="item" onClick={() => openTag(t.tag)}>
                    <span className="ico"><Hash size={18} /></span>
                    <span className="main"><b>#{t.tag}</b><small>{t.count} lançamento{t.count > 1 ? 's' : ''} · toque para ver</small></span>
                    <span className="side"><b><Money value={t.total} /></b></span>
                  </button>
                ))}
              </div>
            </>
          )}
          {top.length > 0 && (
            <>
              <SectionTitle title="Maiores gastos" />
              <div className="list">{top.map((t) => <TxRow key={t.id} tx={t} accounts={s.accounts} categories={s.categories} showDate onClick={() => editTx(t.id)} />)}</div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Evolution() {
  const s = useStore();
  const [n, setN] = useState<'6' | '12'>('6');
  const data = useMemo(() => monthlyEvolution(s.transactions, monthOf(s.today), Number(n)), [s.transactions, s.today, n]);
  const withData = data.filter((d) => d.income || d.expense);
  const avgExp = withData.length ? round2(withData.reduce((a, d) => a + d.expense, 0) / withData.length) : 0;
  const avgNet = withData.length ? round2(withData.reduce((a, d) => a + d.net, 0) / withData.length) : 0;
  return (
    <>
      <Pills value={n} onChange={setN} options={[{ id: '6', label: '6 meses' }, { id: '12', label: '12 meses' }]} />
      <div className="split even">
        <div className="split-col">
          <div className="card">
            <BarChart title="Entradas e saídas por mês" aLabel="Entradas" bLabel="Saídas"
              groups={data.map((d) => ({ label: monthLabel(d.month), short: monthShort(d.month), a: d.income, b: d.expense }))} />
          </div>
        </div>
        <div className="split-col">
          <div className="grid2">
            <div className="card" style={{ padding: 14 }}><span className="muted" style={{ fontSize: 12.5 }}>Gasto médio por mês</span><b style={{ display: 'block', fontSize: 18 }}><Money value={avgExp} /></b></div>
            <div className="card" style={{ padding: 14 }}><span className="muted" style={{ fontSize: 12.5 }}>Sobra média por mês</span><b className={avgNet < 0 ? 'red' : 'green'} style={{ display: 'block', fontSize: 18 }}><Money value={avgNet} /></b></div>
          </div>
        </div>
      </div>
    </>
  );
}

function Worth() {
  const s = useStore();
  const [n, setN] = useState<'6' | '12'>('12');
  const series = useMemo(() => netWorthSeries(s.accounts, s.transactions, s.investment_snapshots, monthOf(s.today), Number(n), s.today), [s.accounts, s.transactions, s.investment_snapshots, s.today, n]);
  const live = activeAccounts(s.accounts);
  const rows = live.map((a) => ({ a, v: accountBalance(a, s.transactions, s.investment_snapshots, s.today) })).sort((x, y) => y.v - x.v);
  const first = series[0]?.value ?? 0;
  const last = series[series.length - 1]?.value ?? 0;
  const delta = round2(last - first);
  return (
    <>
      <Pills value={n} onChange={setN} options={[{ id: '6', label: '6 meses' }, { id: '12', label: '12 meses' }]} />
      <div className="split even">
        <div className="split-col">
          <div className="card">
            <div className="row-between" style={{ marginBottom: 8 }}>
              <span className="muted">Patrimônio total</span>
              <span className={delta >= 0 ? 'green' : 'red'}><Money value={delta} signed /> no período</span>
            </div>
            <AreaChart title="Evolução do patrimônio" points={series.map((p) => ({ label: monthLabel(p.month), short: monthShort(p.month), value: p.value }))} />
          </div>
        </div>
        <div className="split-col">
          <SectionTitle title="Composição atual" />
          <div className="group">
            {rows.map(({ a, v }) => (
              <div key={a.id} className="item">
                <span className="ico" style={{ background: a.color, color: '#fff' }}><CategoryIcon name={a.kind === 'credit' ? 'cash' : a.kind === 'investment' ? 'piggy' : 'bank'} /></span>
                <span className="main"><b>{a.name}</b><small>{a.kind === 'credit' ? 'Cartão de crédito' : a.kind === 'investment' ? 'Investimento' : 'Conta corrente'}</small></span>
                <span className="side"><b className={v < 0 ? 'red' : ''}><Money value={v} /></b></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
