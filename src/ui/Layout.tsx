import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChartNoAxesColumn, Ellipsis, House, PieChart, Plus, Receipt, WifiOff } from 'lucide-react';
import { useStore } from '../store';
import { useEditor } from './editors';

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
  const { toasts, dismissToast } = useStore();
  const { newTx } = useEditor();
  const { pathname } = useLocation();
  const online = useOnline();
  const showFab = pathname.startsWith('/lancamentos');
  const section = pathname.split('/')[1] || 'inicio';
  useEffect(() => { window.scrollTo(0, 0); }, [section]);
  return (
    <>
      <div className="status-fill" aria-hidden />
      {!online && <div className="offline" role="status"><WifiOff size={14} style={{ verticalAlign: -2 }} /> Sem conexão — o que você alterar agora pode não ser salvo.</div>}
      <div className="app"><div className="page" key={section}><Outlet /></div></div>
      {showFab && <button className="fab" onClick={() => newTx()} aria-label="Novo lançamento"><Plus size={26} /></button>}
      <nav className="nav" aria-label="Navegação principal" style={{ '--i': tabIndex(pathname) } as React.CSSProperties}>
        <span className="nav-pill" aria-hidden />
        {items.map(({ to, label, icon: I, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')} aria-label={label}>
            <I size={21} strokeWidth={2} /><span>{label}</span>
          </NavLink>
        ))}
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
