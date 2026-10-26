import { StrictMode } from 'react';
import '@fontsource-variable/inter';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './lib/install';
import { startUpdateChecks } from './lib/updates';
import './ui/splash/bolso-splash.css';
import { showBolsoSplash } from './ui/splash/bolso-splash.js';

// Splash animada ao abrir o app; as cores vêm de --bg/--text, então segue o tema escolhido (Auto/Claro/Escuro).
// Pulada em navegador automatizado (Playwright) para não atrapalhar os testes e capturas de tela.
if (!navigator.webdriver) void showBolsoSplash();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

startUpdateChecks();

// Service worker (cópia offline e abertura rápida). Registrado à mão, sem recarregar a página por conta própria:
// quem decide quando recarregar é src/lib/updates.ts (só em momento seguro, sem perder o que a pessoa está digitando).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
      const check = () => { if (navigator.onLine) void reg.update().catch(() => {}); };
      setInterval(check, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    }).catch(() => { /* sem service worker o app funciona do mesmo jeito, só sem cópia offline */ });
  });
}
