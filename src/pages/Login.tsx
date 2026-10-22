import { useState } from 'react';
import { db } from '../data';

export function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

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
        <div className="brand">Bolso</div>
        <p className="sub">Seu controle financeiro, só seu.</p>
      </div>
      <div className="seg">
        <button type="button" className={mode === 'in' ? 'active' : ''} onClick={() => setMode('in')}>Entrar</button>
        <button type="button" className={mode === 'up' ? 'active' : ''} onClick={() => setMode('up')}>Criar conta</button>
      </div>
      <div className="field"><label className="lbl" htmlFor="email">E-mail</label>
        <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="field"><label className="lbl" htmlFor="pw">Senha</label>
        <input id="pw" className="input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {info && <p className="banner">{info}</p>}
      <button className="btn primary block" disabled={busy}>{busy ? 'Aguarde…' : mode === 'in' ? 'Entrar' : 'Criar conta'}</button>
    </form>
  );
}
