import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { ChartNoAxesColumn, Ellipsis, House, LoaderCircle, PieChart, Plus, Receipt, Search, WifiOff } from 'lucide-react';
import { useStore } from '../store';
import { useEditor } from './editors';
import { getName } from '../lib/profile';
import { SearchPalette, openSearch } from './SearchPalette';
import { BrandLogo } from './BrandLogo';

const items = [
  { to: '/', label: 'Início', icon: House, end: true },
  { to: '/lancamentos', label: 'Extrato', icon: Receipt },
  { to: '/orcamentos', label: 'Orçamento', icon: PieChart },
  { to: '/insights', label: 'Insights', icon: ChartNoAxesColumn },
  { to: '/mais', label: 'Mais', icon: Ellipsis },
];

const tabIndex = (path: string) =>
  path === '/' || path.startsWith('/notificacoes') ? 0
  : path.startsWith('/lancamentos') ? 1
  : path.startsWith('/orcamentos') ? 2
  : path.startsWith('/insights') ? 3
  : 4;

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    return () => { removeEventListener('online', on); removeEventListener('offline', off); };
  }, []);
  return online;
}

const scrollMem = new Map<string, number>();

export function Layout() {
  const { toasts, dismissToast, user, reload } = useStore();
  const navType = useNavigationType();
  const { newTx } = useEditor();
  const { pathname, key } = useLocation();
  const keyRef = useRef(key);
  const online = useOnline();
  const showFab = pathname.startsWith('/lancamentos');
  const section = pathname.split('/')[1] || 'inicio';
  // voltar devolve a posição da rolagem; ir para uma tela nova começa no topo
  useEffect(() => {
    keyRef.current = key;
    if (navType === 'REPLACE') return;
    const y = navType === 'POP' ? scrollMem.get(key) ?? 0 : 0;
    window.scrollTo(0, y);
    const t = y ? setTimeout(() => window.scrollTo(0, y), 120) : undefined; // depois que a lista carrega
    return () => clearTimeout(t);
  }, [key, navType]);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => scrollMem.set(keyRef.current, window.scrollY)); };
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, []);

  // puxar para atualizar (celular)
  const [pull, setPull] = useState(0);
  const [spinning, setSpinning] = useState(false);
  useEffect(() => {
    let y0 = -1;
    let dist = 0;
    const small = () => matchMedia('(max-width: 1023px)').matches;
    const start = (e: TouchEvent) => { y0 = window.scrollY <= 0 && small() && !document.querySelector('[role="dialog"], [role="alertdialog"]') ? e.touches[0].clientY : -1; dist = 0; };
    const move = (e: TouchEvent) => {
      if (y0 < 0) return;
      dist = Math.max(0, e.touches[0].clientY - y0);
      if (window.scrollY > 0) { y0 = -1; setPull(0); return; }
      setPull(Math.min(80, dist * 0.45));
    };
    const end = () => {
      if (y0 >= 0 && dist * 0.45 >= 56) { setSpinning(true); setPull(52); void Promise.all([reload(), new Promise((r) => setTimeout(r, 700))]).catch(() => {}).finally(() => { setSpinning(false); setPull(0); }); }
      else setPull(0);
      y0 = -1;
    };
    addEventListener('touchstart', start, { passive: true });
    addEventListener('touchmove', move, { passive: true });
    addEventListener('touchend', end);
    addEventListener('touchcancel', end);
    return () => { removeEventListener('touchstart', start); removeEventListener('touchmove', move); removeEventListener('touchend', end); removeEventListener('touchcancel', end); };
  }, [reload]);

  // título grande que vira título compacto na barra translúcida ao rolar (como nas telas do iOS)
  const [barTitle, setBarTitle] = useState('');
  useEffect(() => {
    setBarTitle('');
    const el = document.querySelector<HTMLElement>('.topbar .page-title');
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setBarTitle(!e.isIntersecting && e.boundingClientRect.top < 0 ? el.textContent ?? '' : ''), { rootMargin: '-6px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [section]);

  // atalhos de teclado (computador): N = novo lançamento · / = buscar ou lançamento rápido
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('[role="dialog"]')) return;
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); newTx(); }
      else if (e.key === '/') {
        const field = document.querySelector<HTMLInputElement>('input[aria-label="Buscar"], input[aria-label="Lançamento rápido"]');
        if (field) { e.preventDefault(); field.focus(); }
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [newTx]);
  return (
    <>
      <SearchPalette />
      <div className="status-fill" aria-hidden />
      <div className={`ptr${pull ? ' on' : ''}${spinning ? ' spin' : ''}`} style={{ transform: `translate(-50%, ${pull - 44}px)`, opacity: Math.min(1, pull / 40) }} aria-hidden><LoaderCircle size={22} /></div>
      <div className={`inline-bar${barTitle ? ' on' : ''}`} aria-hidden>{barTitle}</div>
      {!online && <div className="offline" role="status"><WifiOff size={14} style={{ verticalAlign: -2 }} /> Sem conexão — o que você alterar agora pode não ser salvo.</div>}
      <div className="app"><div className="page" key={section}><Outlet /></div></div>
      {showFab && <button className="fab" onClick={() => newTx()} aria-label="Novo lançamento"><Plus size={26} /></button>}
      <nav className="nav" aria-label="Navegação principal" style={{ '--i': tabIndex(pathname) } as React.CSSProperties}>
        <Link to="/" className="nav-brand" aria-label="Bolso, ir para o início"><BrandLogo /><img className="brand-mark mark-light" src="/favicon-64.png" alt="" /><img className="brand-mark mark-dark" src="/favicon-dark-64.png" alt="" /></Link>
        <button className="nav-new" onClick={() => newTx()} aria-label="Novo lançamento"><Plus size={18} /><span className="lbl"> Novo lançamento</span> <kbd>N</kbd></button>
        <button className="nav-search" onClick={openSearch} aria-label="Buscar em tudo"><Search size={18} /><span className="lbl">Buscar</span> <kbd>Ctrl K</kbd></button>
        <div className="nav-items">
          <span className="nav-pill" aria-hidden />
          {items.map(({ to, label, icon: I, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')} aria-label={label}>
              <I size={21} strokeWidth={2} /><span>{label}</span>
            </NavLink>
          ))}
        </div>
        <Link to="/mais" className="nav-user" aria-label="Seu perfil e configurações">
          <span className="avatar" aria-hidden>{getName(user.email)[0]?.toUpperCase()}</span>
          <span className="nm"><b>{getName(user.email)}</b><small>{user.email}</small></span>
        </Link>
      </nav>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.message}</span>
            {t.action && <button onClick={() => { t.action!.run(); dismissToast(t.id); }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </>
  );
}
