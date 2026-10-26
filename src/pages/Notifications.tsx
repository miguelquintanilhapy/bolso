import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, CalendarClock, CircleAlert, PieChart, Repeat, Wallet } from 'lucide-react';
import { useStore } from '../store';
import { Empty } from '../ui/common';
import { dayLabel } from '../lib/dates';

const ICON: Record<string, typeof Bell> = { budget: PieChart, invoice: Wallet, pending: CalendarClock, recurrence: Repeat };

export function Notifications() {
  const s = useStore();
  const nav = useNavigate();
  const list = [...s.notifications].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const unread = list.filter((n) => !n.read);
  return (
    <div className="screen narrow">
      <div className="topbar">
        <Link to="/" className="back" aria-label="Voltar"><ArrowLeft size={20} /></Link>
        <h1 className="title">Notificações</h1>
        {unread.length > 0 && <button className="btn sm" style={{ whiteSpace: 'nowrap' }} onClick={() => void s.markRead(unread.map((n) => n.id))}>Ler todas</button>}
      </div>
      {list.length === 0 ? (
        <div className="card"><Empty title="Tudo em dia"><Bell size={28} style={{ margin: '8px auto' }} /><p>Avisos de orçamento, faturas e contas a vencer aparecem aqui.</p></Empty></div>
      ) : (
        <div className="group">
          {list.map((n) => {
            const I = ICON[n.kind] ?? CircleAlert;
            return (
              <button key={n.id} className={`item notif ${n.read ? '' : 'unread'}`} onClick={() => { void s.markRead([n.id]); if (n.link) nav(n.link); }}>
                <span className={`ico ${/estourou|atraso|atrasado/i.test(n.title) ? 'bad' : ''}`}><I size={19} /></span>
                <span className="main"><b style={{ whiteSpace: 'normal' }}>{n.title}</b><small style={{ whiteSpace: 'normal' }}>{n.body}</small></span>
                <span className="side"><small>{dayLabel(n.created_at.slice(0, 10), s.today)}</small></span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
