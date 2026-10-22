import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Atualização automática: confere se há versão nova a cada 30 min e sempre que o app volta para a tela.
// (registerType: 'autoUpdate' troca o service worker e recarrega a página sozinho.)
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => { if (navigator.onLine) void reg.update().catch(() => {}); };
    setInterval(check, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  },
});
