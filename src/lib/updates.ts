import { useSyncExternalStore } from 'react';

declare const __BUILD_ID__: string;

/**
 * Atualização do app sem a pessoa precisar sair e entrar.
 * A cada abertura, ao voltar para a tela e de tempos em tempos, compara a versão publicada (/version.json, sempre da rede)
 * com a que está rodando. Se há versão nova: recarrega sozinho quando é seguro (nenhuma janela aberta e nenhum campo em uso);
 * senão mostra um aviso "Atualizar agora" e recarrega assim que ficar seguro.
 */

const TRIED_KEY = 'bolso:update-tried'; // versão para a qual já recarregamos nesta sessão (evita laço se algo servir a cópia velha)
let pending = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export const currentBuild = () => __BUILD_ID__;

/** Decisão pura (testável): o que fazer com a versão publicada. */
export function updateDecision(opts: { current: string; latest: string | null; safe: boolean; visible: boolean; triedFor: string | null; forced?: boolean }): 'none' | 'reload' | 'banner' {
  const { current, latest, safe, visible, triedFor, forced } = opts;
  if (!latest || current === 'dev' || latest === current) return 'none';
  if (forced) return 'reload';
  if (triedFor === latest) return 'banner'; // já recarregamos para essa versão e ela não veio: não repete sozinho
  return safe && visible ? 'reload' : 'banner';
}

/** Seguro recarregar: sem janela aberta e sem digitação em andamento. */
export function isSafeToReload(): boolean {
  if (document.querySelector('[role="dialog"], [role="alertdialog"], .sheet')) return false;
  const a = document.activeElement as HTMLElement | null;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && (a as HTMLInputElement).value) return false;
  return true;
}

async function latestBuild(): Promise<string | null> {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { build?: string };
    return typeof j.build === 'string' ? j.build : null;
  } catch {
    return null;
  }
}

const readTried = () => { try { return sessionStorage.getItem(TRIED_KEY); } catch { return null; } };

/** Espera o service worker novo (se houver) terminar de instalar e assumir; sem isso o recarregamento serviria a cópia velha. */
async function waitForNewWorker(timeoutMs: number) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg) return;
    await reg.update();
    const sw = reg.installing ?? reg.waiting;
    if (!sw || sw.state === 'activated') return;
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      sw.addEventListener('statechange', () => { if (sw.state === 'activated' || sw.state === 'redundant') done(); });
      setTimeout(done, timeoutMs);
    });
  } catch { /* segue para o recarregamento */ }
}

/** Plano B (toque em "Atualizar agora"): apaga o service worker e as cópias guardadas e baixa tudo da rede. Os dados do app não são tocados. */
async function hardReset() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    if ('caches' in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch { /* segue */ }
}

async function reloadNow(latest: string, hard: boolean) {
  try { sessionStorage.setItem(TRIED_KEY, latest); } catch { /* sem armazenamento */ }
  if (hard) await hardReset();
  else await waitForNewWorker(8000);
  location.reload();
}

let latestSeen: string | null = null;

export async function checkForUpdate(opts?: { forced?: boolean }): Promise<void> {
  if (!navigator.onLine) return;
  const latest = (await latestBuild()) ?? latestSeen;
  if (latest) latestSeen = latest;
  const d = updateDecision({ current: currentBuild(), latest, safe: isSafeToReload(), visible: document.visibilityState === 'visible', triedFor: readTried(), forced: opts?.forced });
  // toque do usuário em "Atualizar agora" = plano B completo; recarga automática = espera o service worker novo assumir
  if (d === 'reload' && latest) { await reloadNow(latest, !!opts?.forced); return; }
  const next = d === 'banner';
  if (next !== pending) { pending = next; emit(); }
}

/** Liga as verificações (chamar uma vez ao iniciar). */
export function startUpdateChecks() {
  if (currentBuild() === 'dev') return;
  const run = () => void checkForUpdate();
  setTimeout(run, 2500);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
  addEventListener('online', run);
  setInterval(run, 10 * 60 * 1000);
  // com o aviso na tela, recarrega assim que a pessoa fechar a janela / sair do campo
  setInterval(() => { if (pending) run(); }, 4000);
}

export const updateNow = () => void checkForUpdate({ forced: true });

export function useUpdatePending() {
  return useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, () => pending, () => false);
}
