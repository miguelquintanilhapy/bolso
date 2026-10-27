import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, CalendarClock, CircleAlert, PieChart, Repeat, Wallet, X } from 'lucide-react';
import { useStore } from '../store';
import { Empty } from '../ui/common';
import { dayLabel } from '../lib/dates';

const ICON: Record<string, typeof Bell> = { budget: PieChart, invoice: Wallet, pending: CalendarClock, recurrence: Repeat };

export function Notifications() {
  const s = useStore();
  const nav = useNavigate();
  const list = s.notifications.filter((n) => !n.dismissed).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const unreadIds = list.filter((n) => !n.read).map((n) => n.id);
  // quais eram novas quando a tela abriu: continuam destacadas enquanto a pessoa está aqui, mesmo já contadas como vistas
  const fresh = useRef<Set<string>>(new Set(unreadIds));
  for (const id of unreadIds) fresh.current.add(id);

  // abrir a tela (por qualquer botão) conta como ter visto: o ponto vermelho do sino some
  const key = unreadIds.join(',');
  useEffect(() => {
    if (!unreadIds.length) return;
    const t = setTimeout(() => void s.markRead(unreadIds), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="screen narrow">
      <div className="topbar">
        <Link to="/" className="back" aria-label="Voltar"><ArrowLeft size={20} /></Link>
        <h1 className="title">Notificações</h1>
        {list.length > 0 && <button className="btn sm" style={{ whiteSpace: 'nowrap' }} onClick={() => void s.dismissNotifications(list.map((n) => n.id))}>Limpar todas</button>}
      </div>
      {list.length === 0 ? (
        <div className="card"><Empty title="Tudo em dia"><Bell size={28} style={{ margin: '8px auto' }} /><p>Avisos de orçamento, faturas e contas a vencer aparecem aqui.</p></Empty></div>
      ) : (
        <div className="group">
          {list.map((n) => {
            const I = ICON[n.kind] ?? CircleAlert;
            return (
              <div key={n.id} role="button" tabIndex={0} className={`item notif ${fresh.current.has(n.id) ? 'unread' : ''}`}
                onClick={() => { void s.markRead([n.id]); if (n.link) nav(n.link); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void s.markRead([n.id]); if (n.link) nav(n.link); } }}>
                <span className={`ico ${/estourou|atraso|atrasado/i.test(n.title) ? 'bad' : ''}`}><I size={19} /></span>
                <span className="main"><b style={{ whiteSpace: 'normal' }}>{n.title}</b><small style={{ whiteSpace: 'normal' }}>{n.body}</small></span>
                <span className="side"><small>{dayLabel(n.created_at.slice(0, 10), s.today)}</small></span>
                <button className="trash" aria-label={`Excluir aviso: ${n.title}`} onClick={(e) => { e.stopPropagation(); void s.dismissNotifications([n.id]); }}><X size={18} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
