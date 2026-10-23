import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChartNoAxesColumn, Ellipsis, House, PieChart, Plus, Receipt, WifiOff } from 'lucide-react';
import { useStore } from '../store';
import { useEditor } from './editors';
import { getName } from '../lib/profile';

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

export function Layout() {
  const { toasts, dismissToast, user } = useStore();
  const { newTx } = useEditor();
  const { pathname } = useLocation();
  const online = useOnline();
  const showFab = pathname.startsWith('/lancamentos');
  const section = pathname.split('/')[1] || 'inicio';
  useEffect(() => { window.scrollTo(0, 0); }, [section]);

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
      <div className="status-fill" aria-hidden />
      {!online && <div className="offline" role="status"><WifiOff size={14} style={{ verticalAlign: -2 }} /> Sem conexão — o que você alterar agora pode não ser salvo.</div>}
      <div className="app"><div className="page" key={section}><Outlet /></div></div>
      {showFab && <button className="fab" onClick={() => newTx()} aria-label="Novo lançamento"><Plus size={26} /></button>}
      <nav className="nav" aria-label="Navegação principal" style={{ '--i': tabIndex(pathname) } as React.CSSProperties}>
        <Link to="/" className="nav-brand" aria-label="Bolso, ir para o início"><img className="brand-logo" src="/logo.png" alt="Bolso" /><img className="brand-mark" src="/favicon-64.png" alt="" /></Link>
        <button className="nav-new" onClick={() => newTx()} aria-label="Novo lançamento"><Plus size={18} /><span className="lbl"> Novo lançamento</span> <kbd>N</kbd></button>
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
