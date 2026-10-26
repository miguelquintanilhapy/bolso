import { BrandLogo } from '../ui/BrandLogo';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { db } from '../data';

export function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      if (mode === 'in') await db.signIn(email.trim(), password);
      else {
        if (password.length < 8) throw new Error('Use uma senha com pelo menos 8 caracteres.');
        const r = await db.signUp(email.trim(), password);
        if (r.needsConfirmation) setInfo('Conta criada! Confirme pelo link enviado ao seu e-mail e depois entre.');
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Algo deu errado.';
      setError(
        /invalid login/i.test(m) ? 'E-mail ou senha incorretos.'
        : /não permitido|database error saving/i.test(m) ? 'Este e-mail não está autorizado a criar conta no Bolso.'
        : /signups? (are|is) disabled/i.test(m) ? 'O cadastro está desligado no Supabase. Ative em Authentication → Sign In / Providers → "Allow new users to sign up" e confirme que o provedor Email está ligado.'
        : /already registered/i.test(m) ? 'Este e-mail já tem conta. Use "Entrar".'
        : m,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="login" onSubmit={submit}>
      <div>
        <BrandLogo width={152} height={52} />
        <p className="sub">Seu controle financeiro, só seu.</p>
      </div>
      <div className="seg">
        <button type="button" className={mode === 'in' ? 'active' : ''} onClick={() => setMode('in')}>Entrar</button>
        <button type="button" className={mode === 'up' ? 'active' : ''} onClick={() => setMode('up')}>Criar conta</button>
      </div>
      <div className="field"><label className="lbl" htmlFor="email">E-mail</label>
        <input id="email" className="input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="field"><label className="lbl" htmlFor="pw">Senha</label>
        <div className="pw-wrap">
          <input id="pw" className="input" type={show ? 'text' : 'password'} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="pw-toggle" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>{show ? <EyeOff size={19} /> : <Eye size={19} />}</button>
        </div>
        {mode === 'up' && <small className="muted" style={{ paddingLeft: 4 }}>Mínimo de 8 caracteres.</small>}</div>
      {error && <p key={error} className="error-text shake" role="alert">{error}</p>}
      {info && <p className="banner">{info}</p>}
      <button className="btn primary block" disabled={busy}>{busy ? 'Aguarde…' : mode === 'in' ? 'Entrar' : 'Criar conta'}</button>
    </form>
  );
}
