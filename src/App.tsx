import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { db } from './data';
import type { SessionUser } from './data/api';
import { StoreProvider } from './store';
import { PrivacyProvider } from './ui/privacy';
import { EditorProvider } from './ui/editors';
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

  if (user === undefined) return <div className="splash"><div className="splash-logo">Bolso</div></div>;
  if (!user) return <Login />;

  return (
    <PrivacyProvider>
      <StoreProvider key={user.id} user={user}>
        <BrowserRouter>
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
        </BrowserRouter>
      </StoreProvider>
    </PrivacyProvider>
  );
}
