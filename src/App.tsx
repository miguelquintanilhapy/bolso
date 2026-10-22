import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { configError, db } from './data';
import type { SessionUser } from './data/api';
import { StoreProvider } from './store';
import { PrivacyProvider } from './ui/privacy';
import { EditorProvider } from './ui/editors';
import { ConfirmProvider } from './ui/confirm';
import { Layout } from './ui/Layout';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Transactions } from './pages/Transactions';
import { Budgets } from './pages/Budgets';
import { Insights } from './pages/Insights';
import { More } from './pages/More';
import { Accounts, AccountDetail } from './pages/Accounts';
import { Categories } from './pages/Categories';
import { Recurrences } from './pages/Recurrences';
import { Notifications } from './pages/Notifications';

export default function App() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  useEffect(() => {
    db.getUser().then(setUser);
    return db.onAuthChange(setUser);
  }, []);

  if (configError) return (
    <div className="splash">
      <div className="splash-error">
        <h2>Configuração do Supabase incorreta</h2>
        <p>{configError}</p>
        <p className="muted">Corrija em Vercel → Settings → Environment Variables e faça um Redeploy.</p>
      </div>
    </div>
  );
  if (user === undefined) return <div className="splash"><img className="brand-logo" src="/logo.png" alt="Bolso" /></div>;
  if (!user) return <Login />;

  return (
    <PrivacyProvider>
      <StoreProvider key={user.id} user={user}>
        <BrowserRouter>
          <ConfirmProvider>
          <EditorProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="lancamentos" element={<Transactions />} />
                <Route path="lancamentos/:id" element={<Transactions />} />
                <Route path="orcamentos" element={<Budgets />} />
                <Route path="insights" element={<Insights />} />
                <Route path="mais" element={<More />} />
                <Route path="contas" element={<Accounts />} />
                <Route path="contas/:id" element={<AccountDetail />} />
                <Route path="categorias" element={<Categories />} />
                <Route path="recorrencias" element={<Recurrences />} />
                <Route path="notificacoes" element={<Notifications />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </EditorProvider>
          </ConfirmProvider>
        </BrowserRouter>
      </StoreProvider>
    </PrivacyProvider>
  );
}
