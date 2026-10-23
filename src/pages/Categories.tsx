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
            <span className="main"><b>{c.name}</b><small>{c.keywords.length ? c.keywords.slice(0, 4).join(', ') + (c.keywords.length > 4 ? '…' : '') : 'Sem palavras-chave'}</small></span>
            <span className="side">{c.budget_limit ? <><b><Money value={c.budget_limit} /></b><small>limite/mês</small></> : <small>sem limite</small>}</span>
          </button>
        ))}
      </div>
    </>
  );
  return (
    <div className="screen narrow">
      <div className="topbar">
        <Link to="/mais" className="back" aria-label="Voltar"><ArrowLeft size={20} /></Link>
        <h1 className="title">Categorias e limites</h1>
        <button className="icon-btn" onClick={() => openCategory()} aria-label="Nova categoria"><Plus size={20} /></button>
      </div>
      <p className="muted">As palavras-chave ensinam o campo rápido: digitar <b>50 mercado</b> cai em Alimentação se "mercado" estiver lá.</p>
      {block('expense', 'Despesas')}
      {block('income', 'Receitas')}
    </div>
  );
}
