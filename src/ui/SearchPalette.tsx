import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Landmark, Receipt, Search, X } from 'lucide-react';
import { useStore } from '../store';
import { useEditor } from './editors';
import { Money } from './privacy';
import { norm } from '../lib/quickEntry';
import { shortDate } from '../lib/dates';
import { newestFirst } from '../lib/finance';

export const openSearch = () => window.dispatchEvent(new Event('bolso:search'));

const PAGES = [
  { to: '/', label: 'Início' }, { to: '/lancamentos', label: 'Extrato' }, { to: '/orcamentos', label: 'Orçamento' }, { to: '/insights', label: 'Insights' },
  { to: '/mais', label: 'Mais' }, { to: '/contas', label: 'Contas, cartões e investimentos' }, { to: '/categorias', label: 'Categorias e limites' },
  { to: '/recorrencias', label: 'Recorrências e assinaturas' }, { to: '/notificacoes', label: 'Notificações' },
];

type Hit = { key: string; icon: 'tx' | 'acc' | 'page'; title: string; sub?: string; amount?: number; run: () => void };

/** Busca global (Ctrl/⌘+K ou a lupa): telas, contas e lançamentos num lugar só. */
export function SearchPalette() {
  const s = useStore();
  const nav = useNavigate();
  const { editTx } = useEditor();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const show = () => { setQ(''); setSel(0); setOpen(true); };
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); show(); } };
    addEventListener('bolso:search', show);
    addEventListener('keydown', key);
    return () => { removeEventListener('bolso:search', show); removeEventListener('keydown', key); };
  }, []);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 30); }, [open]);

  const go = (fn: () => void) => { setOpen(false); fn(); };
  const hits = useMemo<Hit[]>(() => {
    const needle = norm(q.trim());
    const pages = PAGES.filter((p) => !needle || norm(p.label).includes(needle)).map<Hit>((p) => ({ key: p.to, icon: 'page', title: p.label, run: () => go(() => nav(p.to)) }));
    if (!needle) return pages.slice(0, 6);
    const accs = s.accounts.filter((a) => !a.archived && norm(a.name).includes(needle)).map<Hit>((a) => ({ key: a.id, icon: 'acc', title: a.name, sub: 'Conta', run: () => go(() => nav(`/contas/${a.id}`)) }));
    const txs = [...s.transactions]
      .filter((t) => {
        const cat = s.categories.find((c) => c.id === t.category_id)?.name ?? '';
        const acc = s.accounts.find((a) => a.id === t.account_id)?.name ?? '';
        return norm([t.description, t.notes, cat, acc, ...t.tags, String(t.amount).replace('.', ',')].join(' ')).includes(needle);
      })
      .sort(newestFirst).slice(0, 8)
      .map<Hit>((t) => ({
        key: t.id, icon: 'tx', amount: t.kind === 'income' ? t.amount : -t.amount,
        title: t.description || s.categories.find((c) => c.id === t.category_id)?.name || (t.kind === 'transfer' ? 'Transferência' : 'Lançamento'),
        sub: `${shortDate(t.date)} · ${s.accounts.find((a) => a.id === t.account_id)?.name ?? ''}`,
        run: () => go(() => editTx(t.id)),
      }));
    return [...txs, ...accs, ...pages];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, s.transactions, s.accounts, s.categories]);

  if (!open) return null;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(hits.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); hits[sel]?.run(); }
  };
  return (
    <div className="palette-wrap" onClick={() => setOpen(false)}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Buscar" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <label className="palette-input">
          <Search size={19} />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} placeholder="Buscar lançamento, conta ou tela…" aria-label="Buscar em tudo" enterKeyHint="search" autoComplete="off" />
          <button type="button" className="clear-x" onClick={() => setOpen(false)} aria-label="Fechar busca"><X size={16} /></button>
        </label>
        <div className="palette-list" role="listbox" aria-label="Resultados da busca">
          {hits.length === 0 && <p className="palette-empty">Nada encontrado para “{q}”.</p>}
          {hits.map((h, i) => (
            <button key={h.key} role="option" aria-selected={i === sel} className={`palette-row ${i === sel ? 'sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={h.run}>
              <span className="ico">{h.icon === 'tx' ? <Receipt size={17} /> : h.icon === 'acc' ? <Landmark size={17} /> : <ArrowRight size={17} />}</span>
              <span className="main"><b>{h.title}</b>{h.sub && <small>{h.sub}</small>}</span>
              {h.amount !== undefined && <b className={`amt ${h.amount > 0 ? 'green' : ''}`}><Money value={h.amount} signed={h.amount > 0} /></b>}
            </button>
          ))}
        </div>
        <p className="palette-foot"><kbd>↑</kbd> <kbd>↓</kbd> navegar · <kbd>Enter</kbd> abrir · <kbd>Esc</kbd> fechar</p>
      </div>
    </div>
  );
}
