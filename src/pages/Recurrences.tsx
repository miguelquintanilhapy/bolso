import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Repeat } from 'lucide-react';
import { useStore } from '../store';
import { Empty } from '../ui/common';
import { useEditor } from '../ui/editors';
import { CategoryIcon } from '../ui/icons';
import { Hero, Money } from '../ui/privacy';
import { monthlyCommitted } from '../lib/recurrence';
import { monthOf, daysInMonth, addMonthsToMonth } from '../lib/dates';

const SUGGESTIONS: { label: string; description: string; kind: 'expense' | 'income' }[] = [
  { label: 'Aluguel', description: 'Aluguel', kind: 'expense' }, { label: 'Internet', description: 'Internet', kind: 'expense' },
  { label: 'Netflix', description: 'Netflix', kind: 'expense' }, { label: 'Academia', description: 'Academia', kind: 'expense' },
  { label: 'Salário', description: 'Salário', kind: 'income' },
];

/** Próxima data em que a recorrência gera lançamento (dia 31 em mês curto vira o último dia). */
function nextDate(r: { day_of_month: number; start_month: string; end_month: string | null }, today: string) {
  let m = monthOf(today) > r.start_month ? monthOf(today) : r.start_month;
  for (let i = 0; i < 2; i++) {
    const d = Math.min(r.day_of_month, daysInMonth(m));
    const iso = `${m}-${String(d).padStart(2, '0')}`;
    if (iso >= today) return r.end_month && m > r.end_month ? null : iso;
    m = addMonthsToMonth(m, 1);
  }
  return null;
}

export function Recurrences() {
  const s = useStore();
  const { openRecurrence } = useEditor();
  const list = [...s.recurrences].sort((a, b) => Number(b.active) - Number(a.active) || a.day_of_month - b.day_of_month);
  const ended = (r: { end_month: string | null }) => !!r.end_month && r.end_month < monthOf(s.today);
  const chips = (
    <div className="chips" aria-label="Sugestões">
      {SUGGESTIONS.map((x) => <button key={x.label} className="chip" onClick={() => openRecurrence(undefined, { description: x.description, kind: x.kind })}>+ {x.label}</button>)}
    </div>
  );
  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/mais" className="back" aria-label="Voltar"><ArrowLeft size={20} /></Link>
        <h1 className="title">Recorrências</h1>
        <button className="icon-btn" onClick={() => openRecurrence()} aria-label="Nova recorrência"><Plus size={20} /></button>
      </div>
      <div className="split">
      <div className="split-col sticky">
      <section className="card">
        <span className="muted">Já comprometido todo mês</span>
        <Hero value={monthlyCommitted(s.recurrences)} small />
        <p className="hint">Soma das despesas recorrentes ativas: aluguel, assinaturas, mensalidades…</p>
      </section>
      {list.length > 0 && list.length < 4 && <div><p className="hint-title" style={{ marginBottom: 8 }}>Sugestões rápidas</p>{chips}</div>}
      </div>
      <div className="split-col">
      {list.length === 0 ? (
        <div className="card"><Empty icon={<Repeat size={26} />} title="Nenhuma recorrência" action={<button className="btn" onClick={() => openRecurrence()}>Criar do zero</button>}>Cadastre o que se repete todo mês e o Bolso cria o lançamento sozinho. Comece por um destes:<div style={{ marginTop: 14 }}>{chips}</div></Empty></div>
      ) : (
        <div className="group">
          {list.map((r) => {
            const cat = s.categories.find((c) => c.id === r.category_id);
            const acc = s.accounts.find((a) => a.id === r.account_id);
            return (
              <button key={r.id} className="item" onClick={() => openRecurrence(r.id)} style={r.active ? undefined : { opacity: 0.55 }}>
                <span className={`ico ${r.kind === 'income' ? 'in' : ''}`}><CategoryIcon name={cat?.icon ?? 'repeat'} /></span>
                <span className="main"><b>{r.description}</b><small>Todo dia {r.day_of_month} · {acc?.name ?? '—'}</small>
                  <small className={ended(r) || !r.active ? '' : 'next'}>{!r.active ? 'Pausada' : ended(r) ? 'Encerrada' : (() => { const n = nextDate(r, s.today); return n ? `Próximo: ${n.slice(8, 10)}/${n.slice(5, 7)}` : 'Sem próximas datas'; })()}</small></span>
                <span className="side"><b className={r.kind === 'income' ? 'green' : ''}><Money value={r.amount} signed={r.kind === 'income'} /></b></span>
              </button>
            );
          })}
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
