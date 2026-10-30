import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, GripVertical, Plus, Sparkles, X } from 'lucide-react';
import { useStore } from '../store';
import { useEditor } from '../ui/editors';
import { CategoryIcon } from '../ui/icons';
import { Money } from '../ui/privacy';
import { monthOf } from '../lib/dates';
import { spendingByCategory } from '../lib/finance';
import { formatBRL } from '../lib/money';
import { moveItem, orderedCategories, suggestKeywords } from '../lib/suggestions';
import type { Category } from '../lib/types';

const DISMISS_KEY = 'bolso:sug-dismissed';
const readDismissed = (): string[] => { try { return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]'); } catch { return []; } };

const SETTLE = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';

/** Lista com alças: arraste pela alça (ou use ↑ ↓ no teclado) para mudar a ordem. A linha segue o dedo e as outras deslizam para o lugar. */
function ReorderList({ cats, onCommit }: { cats: Category[]; onCommit: (ids: string[]) => void }) {
  const [ids, setIds] = useState(() => cats.map((c) => c.id));
  const [dragging, setDragging] = useState<string | null>(null);
  const idsRef = useRef(ids);
  const box = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const tops = useRef(new Map<string, number>()); // posição de cada linha no layout (sem contar transformações)
  const drag = useRef<{ id: string; grab: number; y: number; dy: number } | null>(null);
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const set = (next: string[]) => { idsRef.current = next; setIds(next); };

  // a linha arrastada fica sob o dedo, mesmo quando o lugar dela na lista muda
  const place = () => {
    const d = drag.current;
    const el = d && rows.current.get(d.id);
    if (!d || !el) return;
    const layoutTop = el.getBoundingClientRect().top - d.dy;
    // a linha não sai da lista: fica entre o topo e a base da caixa
    const area = box.current?.getBoundingClientRect();
    const want = d.y - d.grab - layoutTop;
    d.dy = area ? Math.min(Math.max(want, area.top - layoutTop), area.bottom - el.offsetHeight - layoutTop) : want;
    el.style.transform = `translateY(${d.dy}px)`;
  };
  // para onde a linha arrastada iria: a posição do dedo dentro da lista (em coordenadas de layout, estáveis durante as animações)
  const update = () => {
    const d = drag.current;
    if (!d || !box.current) return;
    const rel = d.y - box.current.getBoundingClientRect().top;
    const cur = idsRef.current;
    // posições calculadas pela ordem atual (o DOM só atualiza no próximo quadro, então não dá para ler offsetTop aqui)
    let acc = 0;
    const layout = cur.map((x) => { const h = rows.current.get(x)?.offsetHeight ?? 0; const r = { top: acc, h }; acc += h; return r; });
    let to = layout.findIndex((r) => rel >= r.top && rel <= r.top + r.h);
    if (to < 0) to = rel < 0 ? 0 : cur.length - 1;
    const from = cur.indexOf(d.id);
    if (to !== from) set(moveItem(cur, from, to));
    place();
  };

  // as outras linhas deslizam até o novo lugar (FLIP) em vez de pular
  useLayoutEffect(() => {
    rows.current.forEach((el, id) => {
      if (!el.isConnected) { rows.current.delete(id); tops.current.delete(id); return; }
      const prev = tops.current.get(id);
      const top = el.offsetTop;
      tops.current.set(id, top);
      if (prev === undefined || prev === top || id === drag.current?.id || reduce) return;
      el.style.transition = 'none';
      el.style.transform = `translateY(${prev - top}px)`;
      void el.offsetHeight; // aplica o ponto de partida antes de animar
      el.style.transition = SETTLE;
      el.style.transform = '';
    });
    place();
  }, [ids]);

  const start = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    const el = rows.current.get(id);
    if (!el) return;
    drag.current = { id, grab: e.clientY - el.getBoundingClientRect().top, y: e.clientY, dy: 0 };
    el.style.transition = 'none';
    setDragging(id);
    const move = (ev: PointerEvent) => { if (drag.current) { drag.current.y = ev.clientY; update(); } };
    // perto da borda da tela, a página rola sozinha enquanto o dedo está ali
    const timer = window.setInterval(() => {
      const d = drag.current;
      if (!d) return;
      const edge = d.y < 110 ? -14 : d.y > innerHeight - 150 ? 14 : 0;
      if (edge) { scrollBy(0, edge); update(); }
    }, 16);
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      clearInterval(timer);
      const row = rows.current.get(id);
      if (row) { row.style.transition = reduce ? 'none' : SETTLE; row.style.transform = ''; } // assenta no lugar
      drag.current = null;
      setDragging(null);
      onCommit(idsRef.current);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  const key = (e: React.KeyboardEvent, id: string) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const from = idsRef.current.indexOf(id);
    const next = moveItem(idsRef.current, from, from + (e.key === 'ArrowUp' ? -1 : 1));
    if (next !== idsRef.current) { set(next); onCommit(next); }
  };

  return (
    <div className="group reorder-box" ref={box}>
      {ids.map((id) => {
        const c = cats.find((x) => x.id === id)!;
        return (
          <div key={id} ref={(el) => { if (el) rows.current.set(id, el); }} className={`item reorder-row ${dragging === id ? 'dragging-row' : ''}`}>
            <span className="ico" style={{ background: c.color, color: '#fff' }}><CategoryIcon name={c.icon} /></span>
            <span className="main"><b>{c.name}</b></span>
            <button type="button" className="grip" aria-label={`Mover ${c.name}: arraste ou use as setas para cima e para baixo`}
              onPointerDown={(e) => start(e, id)} onKeyDown={(e) => key(e, id)}><GripVertical size={20} /></button>
          </div>
        );
      })}
    </div>
  );
}

export function Categories() {
  const s = useStore();
  const { openCategory } = useEditor();
  const month = monthOf(s.today);
  const [reordering, setReordering] = useState<'expense' | 'income' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const suggestions = suggestKeywords(s.transactions, s.categories, dismissed, 3);
  const archivedCats = s.categories.filter((c) => c.archived);

  const dismiss = (word: string) => {
    const next = [...dismissed, word];
    setDismissed(next);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next)); } catch { /* sem armazenamento */ }
  };
  const accept = async (word: string, categoryId: string, amount: number | null) => {
    const cat = s.categories.find((c) => c.id === categoryId);
    if (!cat) return;
    const keywords = cat.keywords.includes(word) ? cat.keywords : [...cat.keywords, word];
    const defaults = amount ? { ...(cat.keyword_defaults ?? {}), [word]: amount } : cat.keyword_defaults;
    try {
      await s.save<Category>('categories', { id: cat.id, keywords, ...(defaults && Object.keys(defaults).length ? { keyword_defaults: defaults } : {}) });
      s.toast(amount ? `“${word}” agora lança ${formatBRL(amount)} em ${cat.name}` : `“${word}” agora cai em ${cat.name}`);
    } catch (e) {
      s.toast(e instanceof Error && /keyword_defaults/.test(e.message) ? 'Para guardar valor padrão, rode o supabase/schema.sql de novo no Supabase.' : 'Não consegui salvar.');
    }
  };
  const commitOrder = async (ids: string[]) => {
    try {
      for (const [i, id] of ids.entries()) {
        const c = s.categories.find((x) => x.id === id);
        if (c && c.sort_order !== i) await s.save<Category>('categories', { id, sort_order: i });
      }
    } catch (e) {
      s.toast(e instanceof Error && /sort_order/.test(e.message) ? 'Para guardar a ordem, rode o supabase/schema.sql de novo no Supabase.' : 'Não consegui salvar a ordem.');
    }
  };

  const block = (kind: 'expense' | 'income', title: string) => {
    const list = orderedCategories(s.categories, kind);
    const spent = new Map(spendingByCategory(s.transactions, month, kind).map((x) => [x.categoryId, x.total]));
    const editing = reordering === kind;
    return (
      <>
        <div className="row-between"><span className="group-title" style={{ margin: 0 }}>{title}</span>
          <span className="row-actions">
            {list.length > 1 && <button className="link" onClick={() => setReordering(editing ? null : kind)}>{editing ? 'Concluir' : 'Reordenar'}</button>}
            {!editing && <button className="link" onClick={() => openCategory(undefined, kind)}>+ Nova</button>}
          </span></div>
        {editing ? <ReorderList cats={list} onCommit={(ids) => void commitOrder(ids)} /> : (
          <div className="group">
            {list.map((c) => {
              const used = spent.get(c.id) ?? 0;
              const limit = kind === 'expense' && c.budget_limit ? c.budget_limit : 0;
              const ratio = limit ? used / limit : 0;
              const level = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok';
              return (
                <button key={c.id} className="item" onClick={() => openCategory(c.id)}>
                  <span className="ico" style={{ background: c.color, color: '#fff' }}><CategoryIcon name={c.icon} /></span>
                  <span className="main">
                    <b>{c.name}</b>
                    <small>{limit ? <>de <Money value={limit} /> no mês</> : kind === 'expense' ? 'sem limite' : 'este mês'}</small>
                    {limit > 0 && <span className={`meter slim ${level}`} role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Uso do limite de ${c.name}`}><i style={{ width: `${Math.min(100, ratio * 100)}%` }} /></span>}
                  </span>
                  <span className="side"><b className={kind === 'income' && used ? 'green' : ''}><Money value={used} /></b></span>
                </button>
              );
            })}
          </div>
        )}
      </>
    );
  };
  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/mais" className="back" aria-label="Voltar"><ArrowLeft size={20} /></Link>
        <h1 className="title">Categorias e limites</h1>
        <button className="icon-btn" onClick={() => openCategory()} aria-label="Nova categoria"><Plus size={20} /></button>
      </div>
      <p className="muted">Valores deste mês. As palavras-chave ensinam o lançamento rápido: digitar <b>50 mercado</b> cai em Alimentação se "mercado" estiver lá. Toque numa categoria para editar.</p>

      {suggestions.length > 0 && (
        <section className="card suggest" aria-label="Sugestões">
          <b className="suggest-title"><Sparkles size={16} /> Sugestões do histórico</b>
          {suggestions.map((g) => {
            const cat = s.categories.find((c) => c.id === g.categoryId);
            return (
              <div key={g.word} className="suggest-row">
                <span className="suggest-text">
                  {g.kind === 'new'
                    ? <>“<b>{g.word}</b>” aparece {g.count}× em {cat?.name}{g.amount ? <> · quase sempre <Money value={g.amount} /></> : null}. Guardar como palavra-chave{g.amount ? ' com esse valor' : ''}?</>
                    : <>“<b>{g.word}</b>” costuma ser <Money value={g.amount ?? 0} />. Usar como valor padrão?</>}
                </span>
                <button className="btn sm" onClick={() => { void accept(g.word, g.categoryId, g.amount); dismiss(g.word); }}>{g.kind === 'new' ? 'Guardar' : 'Usar'}</button>
                <button className="icon-btn suggest-x" aria-label={`Dispensar sugestão ${g.word}`} onClick={() => dismiss(g.word)}><X size={16} /></button>
              </div>
            );
          })}
        </section>
      )}

      <div className="split even">
        <div className="split-col">{block('expense', 'Despesas')}</div>
        <div className="split-col">{block('income', 'Receitas')}</div>
      </div>

      {archivedCats.length > 0 && (
        <>
          <button className="link archived-toggle" aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)}>
            Arquivadas ({archivedCats.length}) <ChevronDown size={16} className={`look-chev ${showArchived ? 'open' : ''}`} />
          </button>
          {showArchived && (
            <div className="group">
              {archivedCats.map((c) => (
                <button key={c.id} className="item archived" onClick={() => openCategory(c.id)}>
                  <span className="ico" style={{ background: c.color, color: '#fff' }}><CategoryIcon name={c.icon} /></span>
                  <span className="main"><b>{c.name}</b><small>Arquivada · toque para reativar</small></span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
