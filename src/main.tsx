import { StrictMode } from 'react';
import '@fontsource-variable/inter';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
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
