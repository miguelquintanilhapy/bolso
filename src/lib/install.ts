import { useEffect, useState } from 'react';

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

// o Chrome do Android (e o do computador) avisa que dá para instalar; guardamos o aviso para usar quando a pessoa tocar em "Instalar"
const bootAt = Date.now();
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
}

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/i.test(navigator.userAgent);
export const isStandalone = () => (navigator as unknown as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;

/**
 * Como instalar neste aparelho:
 * - `prompt`: o navegador deixa instalar com um toque (Android/Chrome)
 * - `ios`: precisa do Safari → Compartilhar → Adicionar à Tela de Início
 * - `android`: sem botão automático; usar o menu do navegador
 * - `none`: já instalado, ou computador
 */
export type InstallMode = 'prompt' | 'ios' | 'android' | 'none';

export function useInstall() {
  const [, force] = useState(0);
  const [waited, setWaited] = useState(() => Date.now() - bootAt > 2500); // dá tempo do Chrome avisar antes de mostrar o passo a passo manual
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    const t = setTimeout(() => setWaited(true), Math.max(0, 2500 - (Date.now() - bootAt)));
    return () => { listeners.delete(f); clearTimeout(t); };
  }, []);
  const mode: InstallMode = isStandalone() ? 'none' : deferred && (isAndroid() || isIOS()) ? 'prompt' : isIOS() ? 'ios' : isAndroid() && waited ? 'android' : 'none';
  const install = async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    notify();
    return outcome === 'accepted';
  };
  return { mode, install };
}

export const INSTALL_STEPS: Record<'ios' | 'android', string> = {
  ios: 'Abra o Bolso no Safari, toque em Compartilhar (o quadrado com a seta) e depois em “Adicionar à Tela de Início”. Em outros navegadores do iPhone isso não aparece.',
  android: 'No Chrome (ou no navegador que você usa), toque nos três pontinhos ⋮ no canto e escolha “Instalar app” ou “Adicionar à tela inicial”.',
};
