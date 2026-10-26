// Teste de atualização com service worker de verdade: publica a versão A, abre o app, "publica" a versão B e confere que o app passa a rodar o código novo.
// (O teste com versões simuladas é scripts/qa/update.mjs; este usa o service worker real, que é onde o problema aparecia.)
// Uso: CHROMIUM_PATH=... node scripts/qa/update-real.mjs
import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';

const A = '/tmp/bolso-real-A', B = '/tmp/bolso-real-B', LIVE = '/tmp/bolso-real-live';
const build = (sha, out) => execSync(`rm -rf ${out} && VERCEL_GIT_COMMIT_SHA=${sha} npx vite build --outDir ${out}`, { stdio: 'ignore' });
build('1111111', A); build('2222222', B);
const deploy = (from) => execSync(`rm -rf ${LIVE} && cp -r ${from} ${LIVE}`);
deploy(A);
const server = spawn('npx', ['vite', 'preview', '--outDir', LIVE, '--port', '4177', '--strictPort'], { stdio: 'ignore', detached: true });
await new Promise((r) => setTimeout(r, 3500));
const url = 'http://localhost:4177';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : extra); if (!ok) failed++; };
const bundle = (page) => page.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => /assets\/index-/.test(s))?.split('/').pop()).catch(() => null);
const tick = (page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
const waitBundleChange = async (page, from, ms) => { const t = Date.now(); while (Date.now() - t < ms) { await page.waitForTimeout(500); const b = await bundle(page); if (b && b !== from) return b; } return null; };
const start = async () => {
  deploy(A);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${url}/?demo`); await page.waitForSelector('.hero');
  await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(1200);
  // como no celular da pessoa: o app já foi aberto antes, então a página está sob controle do service worker
  await page.reload(); await page.waitForSelector('.hero'); await page.waitForTimeout(800);
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) { console.log('FAIL a página deveria estar controlada pelo service worker'); failed++; }
  return { ctx, page, first: await bundle(page) };
};

try {
  // 0) o service worker novo assume sozinho (sem isso ele ficava "esperando" para sempre e o app nunca atualizava)
  {
    const { ctx, page } = await start();
    deploy(B);
    await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
    let state = null;
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(500);
      state = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); const keys = []; for (const k of await caches.keys()) for (const q of await (await caches.open(k)).keys()) if (/assets\/index-.*\.js/.test(q.url)) keys.push(q.url.split('/').pop()); return { waiting: !!r.waiting, installing: !!r.installing, bundles: keys.length }; }).catch(() => state); // o app pode recarregar sozinho durante a espera
      if (state && !state.waiting && !state.installing && state.bundles === 1) break;
    }
    check('service worker novo instala e assume sozinho (nada fica "esperando")', state && !state.waiting && !state.installing && state.bundles === 1, JSON.stringify(state));
    await ctx.close();
  }
  // 1) caso normal: nova versão publicada → o app passa a rodar o código novo sozinho
  {
    const { ctx, page, first } = await start();
    deploy(B); await tick(page);
    const now = await waitBundleChange(page, first, 20000);
    check('com service worker real: o app passa para o código novo sozinho', !!now && now !== first, `${first} → ${now}`);
    await page.waitForSelector('.hero'); await page.waitForTimeout(3500);
    check('…e o aviso não fica na tela', (await page.locator('.update-bar').count()) === 0);
    await ctx.close();
  }
  // 2) janela aberta: não recarrega por conta própria; ao fechar, atualiza
  {
    const { ctx, page, first } = await start();
    await page.click('.action:has-text("Despesa")'); await page.waitForSelector('.sheet');
    deploy(B); await tick(page);
    await page.waitForTimeout(9000);
    check('janela aberta: o código não muda (nada de recarregar no meio do formulário)', (await bundle(page)) === first && (await page.locator('.sheet').count()) === 1);
    check('janela aberta: aparece o aviso', (await page.locator('.update-bar').count()) === 1);
    await page.keyboard.press('Escape');
    const now = await waitBundleChange(page, first, 20000);
    check('ao fechar a janela, atualiza sozinho', !!now);
    await ctx.close();
  }
  // 3) "Atualizar agora" com a janela aberta: plano B completo, atualiza mesmo assim
  {
    const { ctx, page, first } = await start();
    await page.click('.action:has-text("Despesa")'); await page.waitForSelector('.sheet');
    deploy(B); await tick(page);
    await page.waitForSelector('.update-bar button', { timeout: 8000 });
    await page.click('.update-bar button');
    const now = await waitBundleChange(page, first, 20000);
    check('"Atualizar agora": o código novo aparece e o aviso some', !!now && (await page.locator('.update-bar').count()) === 0, `${first} → ${now}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  try { process.kill(-server.pid); } catch { /* já encerrou */ }
}
console.log(failed ? `\n${failed} falha(s)` : '\natualização com service worker real OK');
process.exit(failed ? 1 : 0);
