import { Link } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { useStore } from '../store';
import { useEditor } from '../ui/editors';
import { CategoryIcon } from '../ui/icons';
import { Money } from '../ui/privacy';

export function Categories() {
  const s = useStore();
  const { openCategory } = useEditor();
  const block = (kind: 'expense' | 'income', title: string) => (
    <>
      <div className="row-between"><span className="group-title" style={{ margin: 0 }}>{title}</span>
        <button className="link" onClick={() => openCategory(undefined, kind)}>+ Nova</button></div>
      <div className="group">
        {s.categories.filter((c) => c.kind === kind).map((c) => (
          <button key={c.id} className="item" onClick={() => openCategory(c.id)}>
            <span className="ico" style={{ background: c.color, color: '#fff' }}><CategoryIcon name={c.icon} /></span>
            <span className="main"><b>{c.name}</b><small className="clamp2">{c.keywords.length ? c.keywords.join(', ') : 'Sem palavras-chave'}</small></span>
            <span className="side">{c.budget_limit ? <b><Money value={c.budget_limit} /><span className="per">/mês</span></b> : <small>sem limite</small>}</span>
          </button>
        ))}
      </div>
    </>
  );
  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/mais" className="back" aria-label="Voltar"><ArrowLeft size={20} /></Link>
        <h1 className="title">Categorias e limites</h1>
        <button className="icon-btn" onClick={() => openCategory()} aria-label="Nova categoria"><Plus size={20} /></button>
      </div>
      <p className="muted">As palavras-chave ensinam o lançamento rápido: digitar <b>50 mercado</b> cai em Alimentação se "mercado" estiver lá.</p>
      <div className="split even">
        <div className="split-col">{block('expense', 'Despesas')}</div>
        <div className="split-col">{block('income', 'Receitas')}</div>
      </div>
    </div>
  );
}
