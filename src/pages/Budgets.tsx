import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { Empty, MonthNav, SectionTitle } from '../ui/common';
import { useEditor } from '../ui/editors';
import { CategoryIcon } from '../ui/icons';
import { Ring } from '../ui/Charts';
import { Money } from '../ui/privacy';
import { budgetStatuses, spendingByCategory } from '../lib/finance';
import { daysInMonth, monthOf } from '../lib/dates';
import { round2 } from '../lib/money';

const LABEL = { ok: 'Dentro do limite', warn: 'Atenção: perto do limite', over: 'Estourou o limite' } as const;

export function Budgets() {
  const s = useStore();
  const { openCategory } = useEditor();
  const [month, setMonth] = useState(monthOf(s.today));
  const statuses = useMemo(() => budgetStatuses(s.categories, s.transactions, month), [s.categories, s.transactions, month]);
  const spending = useMemo(() => spendingByCategory(s.transactions, month), [s.transactions, month]);
  const limited = new Set(statuses.map((b) => b.category.id));
  const unlimited = spending.filter((x) => !x.categoryId || !limited.has(x.categoryId));

  const totalLimit = statuses.reduce((a, b) => a + b.limit, 0);
  const totalSpent = statuses.reduce((a, b) => a + b.spent, 0);
  const remaining = round2(totalLimit - totalSpent);
  const ratio = totalLimit ? totalSpent / totalLimit : 0;
  const level = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok';
  const isCurrent = month === monthOf(s.today);
  const daysLeft = isCurrent ? daysInMonth(month) - Number(s.today.slice(8, 10)) + 1 : null;

  return (
    <div className="screen">
      <div className="topbar"><h1 className="title" style={{ fontSize: 22 }}>Orçamento</h1></div>
      <MonthNav month={month} onChange={setMonth} />

      {statuses.length === 0 ? (
        <div className="card">
          <Empty title="Nenhum limite definido">
            Defina um limite mensal nas categorias para acompanhar quanto ainda pode gastar.
            <div style={{ marginTop: 12 }}><Link className="btn primary" to="/categorias">Definir limites</Link></div>
          </Empty>
        </div>
      ) : (
        <section className="card">
          <div className="row-between">
            <span className="muted">{daysLeft ? `Faltam ${daysLeft} dia${daysLeft > 1 ? 's' : ''}` : 'Resumo do mês'}</span>
            <span className={`badge ${level === 'ok' ? 'ok' : level === 'over' ? 'over' : 'pending'}`}>{LABEL[level]}</span>
          </div>
          <div className="hero" style={{ marginTop: 6 }}>
            <Money value={Math.abs(remaining)} />
          </div>
          <p className="muted" style={{ marginBottom: 12 }}>{remaining >= 0 ? 'ainda disponível nos limites' : 'acima dos limites'}</p>
          <div className={`meter ${level}`} role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Uso do orçamento total">
            <i style={{ width: `${Math.min(100, ratio * 100)}%` }} />
          </div>
          <div className="row-between hint"><span><Money value={totalSpent} /> gastos</span><span>de <Money value={totalLimit} /></span></div>
        </section>
      )}

      {statuses.length > 0 && (
        <>
          <SectionTitle title="Por categoria" />
          <div className="group">
            {statuses.map((b) => (
              <button key={b.category.id} className="item" onClick={() => openCategory(b.category.id)}>
                <Ring ratio={b.ratio} level={b.level}><CategoryIcon name={b.category.icon} size={18} /></Ring>
                <span className="main">
                  <b>{b.category.name}</b>
                  <small className="wrap"><Money value={b.spent} /> de <Money value={b.limit} /> · {Math.round(b.ratio * 100)}%</small>
                </span>
                <span className="side">
                  <b className={b.level === 'over' ? 'red' : ''}><Money value={Math.abs(b.remaining)} /></b>
                  <small>{b.remaining >= 0 ? 'restantes' : 'acima'}</small>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {unlimited.length > 0 && (
        <>
          <SectionTitle title="Sem limite definido" />
          <div className="group">
            {unlimited.map((u) => {
              const c = s.categories.find((x) => x.id === u.categoryId);
              return (
                <button key={u.categoryId ?? 'none'} className="item" disabled={!c} onClick={() => c && openCategory(c.id)}>
                  <span className="ico"><CategoryIcon name={c?.icon} /></span>
                  <span className="main"><b>{c?.name ?? 'Sem categoria'}</b><small>{c ? 'Toque para definir um limite' : 'Lançamentos sem categoria'}</small></span>
                  <span className="side"><b><Money value={u.total} /></b></span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
