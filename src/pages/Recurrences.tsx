import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Repeat } from 'lucide-react';
import { useStore } from '../store';
import { Empty } from '../ui/common';
import { useEditor } from '../ui/editors';
import { CategoryIcon } from '../ui/icons';
import { Hero, Money } from '../ui/privacy';
import { monthlyCommitted } from '../lib/recurrence';

export function Recurrences() {
  const s = useStore();
  const { openRecurrence } = useEditor();
  const list = [...s.recurrences].sort((a, b) => Number(b.active) - Number(a.active) || a.day_of_month - b.day_of_month);
  return (
    <div className="screen narrow">
      <div className="topbar">
        <Link to="/mais" className="back" aria-label="Voltar"><ArrowLeft size={20} /></Link>
        <h1 className="title">Recorrências</h1>
        <button className="icon-btn" onClick={() => openRecurrence()} aria-label="Nova recorrência"><Plus size={20} /></button>
      </div>
      <section className="card">
        <span className="muted">Já comprometido todo mês</span>
        <Hero value={monthlyCommitted(s.recurrences)} small />
        <p className="hint">Soma das despesas recorrentes ativas: aluguel, assinaturas, mensalidades…</p>
      </section>
      {list.length === 0 ? (
        <div className="card"><Empty icon={<Repeat size={26} />} title="Nenhuma recorrência" action={<button className="btn primary" onClick={() => openRecurrence()}>Criar recorrência</button>}>Cadastre o que se repete todo mês (aluguel, assinaturas) e o Bolso cria o lançamento sozinho.</Empty></div>
      ) : (
        <div className="group">
          {list.map((r) => {
            const cat = s.categories.find((c) => c.id === r.category_id);
            const acc = s.accounts.find((a) => a.id === r.account_id);
            return (
              <button key={r.id} className="item" onClick={() => openRecurrence(r.id)} style={r.active ? undefined : { opacity: 0.55 }}>
                <span className={`ico ${r.kind === 'income' ? 'in' : ''}`}><CategoryIcon name={cat?.icon ?? 'repeat'} /></span>
                <span className="main"><b>{r.description}</b><small>Todo dia {r.day_of_month} · {acc?.name ?? '—'}{r.active ? '' : ' · pausada'}</small></span>
                <span className="side"><b className={r.kind === 'income' ? 'green' : ''}><Money value={r.amount} signed={r.kind === 'income'} /></b></span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
