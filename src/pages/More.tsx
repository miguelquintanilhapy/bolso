import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, Download, Smartphone, Eye, FileJson, Landmark, LogOut, Palette, Pencil, Repeat, Tags, ListChecks } from 'lucide-react';
import { useStore } from '../store';
import { Segmented, Switch } from '../ui/common';
import { usePrivacy } from '../ui/privacy';
import { ModalSheet } from '../ui/Sheet';
import { INSTALL_STEPS, useInstall } from '../lib/install';
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
  const nav = useNavigate();
  const { hidden, toggle } = usePrivacy();
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem(THEME_KEY) as Theme) || 'auto'; } catch { return 'auto'; }
  });
  const unread = s.notifications.filter((n) => !n.read && !n.dismissed).length;
  const [name, setNameState] = useState(() => getName(s.user.email));
  const [editName, setEditName] = useState(false);
  const [draft, setDraft] = useState('');
  const [adv, setAdv] = useState(false);
  const { mode: installMode, install } = useInstall();
  const [installHelp, setInstallHelp] = useState(false);
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
      <div className="topbar"><h1 className="title page-title">Mais</h1></div>
      <div className="cols even">
      <div className="col">
      <button className="card row-between" style={{ textAlign: 'left', width: '100%' }} onClick={() => { setDraft(name); setEditName(true); }}>
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
        {row('/contas', <Landmark size={19} />, 'Contas, cartões e investimentos')}
        {row('/categorias', <Tags size={19} />, 'Categorias e limites')}
        {row('/recorrencias', <Repeat size={19} />, 'Recorrências e assinaturas')}
        {row('/notificacoes', <Bell size={19} />, 'Notificações', unread ? <span className="badge pending">{unread} nova{unread > 1 ? 's' : ''}</span> : undefined)}
      </div>

      {installMode !== 'none' && (
        <div className="group">
          <button className="item" onClick={() => (installMode === 'prompt' ? void install() : setInstallHelp(true))}>
            <span className="ico"><Smartphone size={19} /></span>
            <span className="main"><b>Instalar o Bolso no celular</b><small>{installMode === 'prompt' ? 'Toque para instalar como app' : 'Veja como adicionar à tela inicial'}</small></span>
            <ChevronRight className="chev" size={18} />
          </button>
        </div>
      )}
      <ModalSheet open={installHelp} onClose={() => setInstallHelp(false)} title="Instalar o Bolso">
        <p>{installMode === 'ios' ? INSTALL_STEPS.ios : INSTALL_STEPS.android}</p>
      </ModalSheet>

      <span className="group-title">Preferências</span>
      <div className="group">
        <div className="item"><span className="ico"><Eye size={19} /></span><span className="main"><b>Ocultar valores</b><small>Esconde saldos e valores</small></span><Switch checked={hidden} onChange={toggle} label="Ocultar valores" /></div>
        <button className="item" onClick={() => {
          try { localStorage.removeItem('bolso:steps-off'); localStorage.removeItem('bolso:install-off'); localStorage.setItem('bolso:steps-force', '1'); } catch { /* sem armazenamento */ }
          nav('/');
        }}>
          <span className="ico"><ListChecks size={19} /></span><span className="main"><b>Mostrar primeiros passos</b><small>Traz de volta o tutorial e a dica de instalação no Início</small></span>
          <ChevronRight className="chev" size={18} />
        </button>
        <div className="item" style={{ flexWrap: 'wrap' }}>
          <span className="ico"><Palette size={19} /></span><span className="main"><b>Aparência</b></span>
          <div style={{ flexBasis: '100%' }}>
            <Segmented<Theme> value={theme} onChange={pick} options={[{ id: 'auto', label: 'Auto' }, { id: 'light', label: 'Claro' }, { id: 'dark', label: 'Escuro' }]} />
          </div>
        </div>
      </div>

      </div>
      <div className="col">
      <div className="group">
        <button className="item" onClick={() => setAdv((v) => !v)} aria-expanded={adv}>
          <span className="ico"><Download size={19} /></span><span className="main"><b>Avançado</b><small>Exportar e fazer backup dos seus dados</small></span>
          <ChevronRight className={`chev ${adv ? 'open' : ''}`} size={18} />
        </button>
        {adv && (
          <>

        <button className="item" onClick={() => download(`bolso-${todayISO()}.csv`, transactionsToCSV(s.transactions, s.accounts, s.categories), 'text/csv;charset=utf-8')}>
          <span className="ico"><Download size={19} /></span><span className="main"><b>Exportar lançamentos (CSV)</b><small>Abre no Excel e no Google Planilhas</small></span>
        </button>
        <button className="item" onClick={() => download(`bolso-backup-${todayISO()}.json`, JSON.stringify({ accounts: s.accounts, categories: s.categories, transactions: s.transactions, recurrences: s.recurrences, investment_snapshots: s.investment_snapshots }, null, 2), 'application/json')}>
          <span className="ico"><FileJson size={19} /></span><span className="main"><b>Backup completo (JSON)</b><small>Todas as contas, categorias e lançamentos</small></span>
        </button>
          </>
        )}
      </div>

      <div className="group">
        <button className="item" onClick={() => void s.signOut()}><span className="ico bad"><LogOut size={19} /></span><span className="main"><b className="red">Sair</b></span></button>
      </div>
      <p className="muted" style={{ textAlign: 'center', fontSize: 12.5 }}>Bolso · versão {__BUILD_ID__}{s.loadMs != null ? ` · abriu em ${(s.loadMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s` : ''}</p>
      </div>
      </div>
    </div>
  );
}
