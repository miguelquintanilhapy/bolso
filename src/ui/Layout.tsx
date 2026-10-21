import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChartNoAxesColumn, Ellipsis, House, PieChart, Plus, Receipt } from 'lucide-react';
import { useStore } from '../store';
import { useEditor } from './editors';

const items = [
  { to: '/', label: 'Início', icon: House, end: true },
  { to: '/lancamentos', label: 'Lançamentos', icon: Receipt },
  { to: '/orcamentos', label: 'Orçamento', icon: PieChart },
  { to: '/insights', label: 'Insights', icon: ChartNoAxesColumn },
  { to: '/mais', label: 'Mais', icon: Ellipsis },
];

export function Layout() {
  const { toasts, dismissToast } = useStore();
  const { newTx } = useEditor();
  const { pathname } = useLocation();
  const showFab = pathname.startsWith('/lancamentos');
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <>
      <div className="app"><Outlet /></div>
      {showFab && <button className="fab" onClick={() => newTx()} aria-label="Novo lançamento"><Plus size={26} /></button>}
      <nav className="nav" aria-label="Navegação principal">
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
