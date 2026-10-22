import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ChevronRight, Download, Eye, FileJson, Landmark, LogOut, Palette, Pencil, Repeat, Tags } from 'lucide-react';
import { useStore } from '../store';
import { Switch } from '../ui/common';
import { usePrivacy } from '../ui/privacy';
import { ModalSheet } from '../ui/Sheet';
import { getName, setName } from '../lib/profile';
import { download, transactionsToCSV } from '../lib/exports';
import { todayISO } from '../lib/dates';

type Theme = 'auto' | 'light' | 'dark';
const THEME_KEY = 'bolso:theme';
export const applyTheme = (t: Theme) => {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
};

export function More() {
  const s = useStore();
  const { hidden, toggle } = usePrivacy();
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem(THEME_KEY) as Theme) || 'auto'; } catch { return 'auto'; }
  });
  const unread = s.notifications.filter((n) => !n.read).length;
  const [name, setNameState] = useState(() => getName(s.user.email));
  const [editName, setEditName] = useState(false);
  const [draft, setDraft] = useState('');
  const saveName = () => { setName(draft); setNameState(getName(s.user.email)); setEditName(false); s.toast('Nome atualizado'); };
  const pick = (t: Theme) => {
    setTheme(t);
    try { localStorage.setItem(THEME_KEY, t); } catch { /* sem armazenamento */ }
    applyTheme(t);
  };
  const row = (to: string, icon: React.ReactNode, label: string, extra?: React.ReactNode) => (
    <Link to={to} className="item">
      <span className="ico">{icon}</span><span className="main"><b>{label}</b></span>{extra}<ChevronRight className="chev" size={18} />
    </Link>
  );

  return (
    <div className="screen">
      <div className="topbar"><h1 className="title" style={{ fontSize: 22 }}>Mais</h1></div>
      <button className="card row-between" style={{ textAlign: 'left', width: '100%' }} onClick={() => { setDraft(name); setEditName(true); }} aria-label="Editar seu nome">
        <div className="row-between" style={{ justifyContent: 'flex-start' }}>
          <div className="avatar">{name[0]?.toUpperCase()}</div>
          <div><b>{name}</b><div className="muted" style={{ fontSize: 13 }}>{s.user.email} · {s.mode === 'demo' ? 'Modo demonstração' : 'Sincronizado'}</div></div>
        </div>
        <Pencil size={17} className="muted" />
      </button>
      <ModalSheet open={editName} onClose={() => setEditName(false)} title="Como quer ser chamado?"
        footer={<div className="foot-actions"><button className="btn primary" onClick={saveName}>Salvar</button></div>}>
        <div className="field"><span className="lbl">Seu nome</span>
          <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveName()} placeholder="Ex.: Miguel" autoFocus maxLength={30} /></div>
        <p className="muted" style={{ fontSize: 13 }}>Aparece na saudação da tela inicial. Fica salvo só neste aparelho.</p>
      </ModalSheet>

      <span className="group-title">Dinheiro</span>
      <div className="group">
        {row('/contas', <Landmark size={19} />, 'Contas e cartões')}
        {row('/categorias', <Tags size={19} />, 'Categorias e limites')}
        {row('/recorrencias', <Repeat size={19} />, 'Recorrências e assinaturas')}
        {row('/notificacoes', <Bell size={19} />, 'Notificações', unread ? <span className="badge pending">{unread} nova{unread > 1 ? 's' : ''}</span> : undefined)}
      </div>

      <span className="group-title">Preferências</span>
      <div className="group">
        <div className="item"><span className="ico"><Eye size={19} /></span><span className="main"><b>Ocultar valores</b><small>Esconde saldos e valores</small></span><Switch checked={hidden} onChange={toggle} label="Ocultar valores" /></div>
        <div className="item" style={{ flexWrap: 'wrap' }}>
          <span className="ico"><Palette size={19} /></span><span className="main"><b>Aparência</b></span>
          <div className="seg" style={{ flexBasis: '100%' }}>
            {(['auto', 'light', 'dark'] as Theme[]).map((t) => (
              <button key={t} className={theme === t ? 'active' : ''} onClick={() => pick(t)}>{t === 'auto' ? 'Auto' : t === 'light' ? 'Claro' : 'Escuro'}</button>
            ))}
          </div>
        </div>
      </div>

      <span className="group-title">Seus dados</span>
      <div className="group">
        <button className="item" onClick={() => download(`bolso-${todayISO()}.csv`, transactionsToCSV(s.transactions, s.accounts, s.categories), 'text/csv;charset=utf-8')}>
          <span className="ico"><Download size={19} /></span><span className="main"><b>Exportar lançamentos (CSV)</b><small>Abre no Excel e no Google Planilhas</small></span>
        </button>
        <button className="item" onClick={() => download(`bolso-backup-${todayISO()}.json`, JSON.stringify({ accounts: s.accounts, categories: s.categories, transactions: s.transactions, recurrences: s.recurrences, investment_snapshots: s.investment_snapshots }, null, 2), 'application/json')}>
          <span className="ico"><FileJson size={19} /></span><span className="main"><b>Backup completo (JSON)</b><small>Todas as contas, categorias e lançamentos</small></span>
        </button>
      </div>

      <div className="group">
        <button className="item" onClick={() => void s.signOut()}><span className="ico bad"><LogOut size={19} /></span><span className="main"><b className="red">Sair</b></span></button>
      </div>
      <p className="muted" style={{ textAlign: 'center', fontSize: 12.5 }}>Bolso 0.1 · feito para uso pessoal</p>
    </div>
  );
}
