import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Receipt, Search, SlidersHorizontal, X } from 'lucide-react';
import { useStore } from '../store';
import { Empty, MonthNav, Pills, TxRow, dayNet } from '../ui/common';
import { useEditor } from '../ui/editors';
import { Money } from '../ui/privacy';
import { dayLabel, monthOf } from '../lib/dates';
import { norm } from '../lib/quickEntry';
import { round2 } from '../lib/money';
import { newestFirst } from '../lib/finance';

type Type = 'all' | 'expense' | 'income' | 'transfer' | 'pending';

export function Transactions() {
  const s = useStore();
  const { editTx, newTx } = useEditor();
  const nav = useNavigate();
  const { id } = useParams();
  // lembra filtros e mês ao ir para outra tela e voltar (só nesta sessão)
  const saved = useMemo(() => { try { return JSON.parse(sessionStorage.getItem('bolso:extrato') ?? '{}') as Record<string, unknown>; } catch { return {}; } }, []);
  const [month, setMonth] = useState((saved.month as string) || monthOf(s.today));
  const [allTime, setAllTime] = useState(!!saved.allTime);
  const [type, setType] = useState<Type>((saved.type as Type) || 'all');
  const [q, setQ] = useState((saved.q as string) || '');
  const [showFilters, setShowFilters] = useState(false);
  const [searching, setSearching] = useState(false);
  const [accountId, setAccountId] = useState((saved.accountId as string) || '');
  const [categoryId, setCategoryId] = useState((saved.categoryId as string) || '');
  const [tag, setTag] = useState((saved.tag as string) || '');
  useEffect(() => {
    try { sessionStorage.setItem('bolso:extrato', JSON.stringify({ month, allTime, type, q, accountId, categoryId, tag })); } catch { /* sem armazenamento */ }
  }, [month, allTime, type, q, accountId, categoryId, tag]);

  // /lancamentos/:id (links de notificações) abre o editor sobre a lista
  useEffect(() => {
    if (id) {
      if (s.transactions.some((t) => t.id === id)) editTx(id);
      nav('/lancamentos', { replace: true });
    }
  }, [id, editTx, nav, s.transactions]);

  // texto de busca de cada lançamento, normalizado uma vez (não a cada letra digitada)
  const haystack = useMemo(() => {
    const catName = new Map(s.categories.map((c) => [c.id, c.name]));
    const accName = new Map(s.accounts.map((a) => [a.id, a.name]));
    return new Map(s.transactions.map((t) => [t.id, norm([t.description, t.notes, catName.get(t.category_id ?? '') ?? '', accName.get(t.account_id) ?? '', ...t.tags].join(' '))]));
  }, [s.transactions, s.categories, s.accounts]);
  const dq = useDeferredValue(q); // a digitação não trava enquanto a lista é refeita
  const tags = useMemo(() => [...new Set(s.transactions.flatMap((t) => t.tags))].sort(), [s.transactions]);
  const filtered = useMemo(() => {
    const needle = norm(dq.trim());
    return s.transactions
      .filter((t) => (allTime || monthOf(t.date) === month))
      .filter((t) => (type === 'all' ? true : type === 'pending' ? t.status === 'pending' : t.kind === type))
      .filter((t) => !accountId || t.account_id === accountId || t.to_account_id === accountId)
      .filter((t) => !categoryId || t.category_id === categoryId)
      .filter((t) => !tag || t.tags.includes(tag))
      .filter((t) => !needle || (haystack.get(t.id) ?? '').includes(needle))
      .sort(newestFirst);
  }, [s.transactions, haystack, allTime, month, type, accountId, categoryId, tag, dq]);

  // mostra 100 por vez (o período todo pode ter milhares de linhas); o resto carrega ao rolar
  const PAGE = 100;
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [month, allTime, type, dq, accountId, categoryId, tag]);
  let cut = Math.min(limit, filtered.length);
  while (cut > 0 && cut < filtered.length && filtered[cut].date === filtered[cut - 1].date) cut++; // não corta um dia ao meio (o total do dia ficaria errado)
  const visible = cut < filtered.length ? filtered.slice(0, cut) : filtered;
  const more = filtered.length - visible.length;
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || more <= 0) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setLimit((l) => l + PAGE); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [more, limit]);
  const groups = visible.reduce<Record<string, typeof filtered>>((m, t) => ((m[t.date] ||= []).push(t), m), {});
  const inc = round2(filtered.filter((t) => t.kind === 'income').reduce((x, t) => x + t.amount, 0));
  const exp = round2(filtered.filter((t) => t.kind === 'expense').reduce((x, t) => x + t.amount, 0));
  const activeFilters = [accountId, categoryId, tag].filter(Boolean).length;
  const pendingCount = s.transactions.filter((t) => t.status === 'pending').length;
  const clearAll = () => { setAccountId(''); setCategoryId(''); setTag(''); setAllTime(false); setQ(''); setType('all'); };
  const hasFilter = activeFilters > 0 || !!q.trim() || type !== 'all';

  return (
    <div className="screen">
      <div className="topbar"><h1 className="title page-title">Extrato</h1></div>
      <div className="split rev">
      <div className="split-col aside">
      <div style={{ display: 'flex', gap: 8 }}>
        <label className="search ios" style={{ flex: 1 }}>
          <Search size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar lançamentos" aria-label="Buscar" type="search" enterKeyHint="search"
            onFocus={() => setSearching(true)} onBlur={() => setTimeout(() => setSearching(false), 150)} />
          {q && <button type="button" className="clear-x" aria-label="Limpar busca" onClick={() => setQ('')}><X size={16} /></button>}
        </label>
        {searching || q ? (
          <button className="text-btn" onClick={() => { setQ(''); setSearching(false); (document.activeElement as HTMLElement | null)?.blur(); }}>Cancelar</button>
        ) : (
          <button className={`filter-btn ${activeFilters ? 'on' : ''}`} onClick={() => setShowFilters((v) => !v)} aria-label="Filtros" aria-expanded={showFilters}>
            <SlidersHorizontal size={18} /> <span>Filtros{activeFilters ? ` · ${activeFilters}` : ''}</span>
          </button>
        )}
      </div>

      {activeFilters > 0 && !showFilters && (
        <div className="filter-chips" aria-label="Filtros ativos">
          {accountId && <button className="chip active" onClick={() => setAccountId('')}>{s.accounts.find((a) => a.id === accountId)?.name} <X size={14} /></button>}
          {categoryId && <button className="chip active" onClick={() => setCategoryId('')}>{s.categories.find((c) => c.id === categoryId)?.name} <X size={14} /></button>}
          {tag && <button className="chip active" onClick={() => setTag('')}>#{tag} <X size={14} /></button>}
        </div>
      )}

      {showFilters && (
        <div className="card stack">
          <div className="field"><span className="lbl">Conta</span>
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Todas</option>{s.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></div>
          <div className="field"><span className="lbl">Categoria</span>
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Todas</option>{s.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div className="field"><span className="lbl">Tag</span>
            <select className="select" value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">Todas</option>{tags.map((t) => <option key={t} value={t}>#{t}</option>)}
            </select></div>
          <div className="row-between">
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={allTime} onChange={(e) => setAllTime(e.target.checked)} /> Todo o período</label>
            <button className="btn sm" onClick={() => { setAccountId(''); setCategoryId(''); setTag(''); setAllTime(false); }}>Limpar</button>
          </div>
        </div>
      )}

      <Pills<Type> value={type} onChange={setType} options={[
        { id: 'all', label: 'Todos' }, { id: 'expense', label: 'Despesas' }, { id: 'income', label: 'Receitas' },
        { id: 'transfer', label: 'Transferências' }, { id: 'pending', label: pendingCount ? `Pendentes · ${pendingCount}` : 'Pendentes' },
      ]} />
      {!allTime && <MonthNav month={month} onChange={setMonth} />}

      {hasFilter && <p className="result-count" role="status">{filtered.length === 0 ? 'Nenhum resultado' : `${filtered.length} ${filtered.length === 1 ? 'resultado' : 'resultados'}`}{allTime ? ' em todo o período' : ''}</p>}
      <div className="mini-stats solo" style={{ marginTop: 0 }}>
        <div className="mini"><span>Entradas</span><b className="green"><Money value={inc} /></b></div>
        <div className="mini"><span>Saídas</span><b><Money value={exp} /></b></div>
      </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <Empty icon={<Receipt size={26} />} title={hasFilter ? 'Nada com esses filtros' : 'Nenhum lançamento neste mês'}
            action={hasFilter ? <button className="btn" onClick={clearAll}>Limpar filtros</button> : <button className="btn primary" onClick={() => newTx()}>Novo lançamento</button>}>
            {hasFilter ? 'Tente outra busca ou limpe os filtros.' : 'Use o botão + ou o lançamento rápido na tela inicial.'}
          </Empty>
        </div>
      ) : (
        <div className="list">
          {Object.entries(groups).map(([date, rows]) => (
            <div key={date} className="list">
              <div className="day-label"><span>{dayLabel(date, s.today)}</span><b><Money value={dayNet(rows)} signed /></b></div>
              {rows.map((t) => <TxRow key={t.id} tx={t} accounts={s.accounts} categories={s.categories} onClick={() => editTx(t.id)} />)}
            </div>
          ))}
          {more > 0 && (
            <div ref={sentinel} className="more-rows">
              <button className="btn sm" onClick={() => setLimit((l) => l + PAGE)}>Mostrar mais {Math.min(PAGE, more)} <span className="muted">· faltam {more}</span></button>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
