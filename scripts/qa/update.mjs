// Testa a atualização automática do app: gera uma versão "antiga" (build com código de versão), simula o servidor publicando outra
// e confere quando o app recarrega sozinho, quando só avisa e que nunca entra em laço de recarregamento.
// Uso: CHROMIUM_PATH=... node scripts/qa/update.mjs
import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';

const OUT = '/tmp/bolso-update-test';
execSync(`rm -rf ${OUT} && VERCEL_GIT_COMMIT_SHA=1111111 npx vite build --outDir ${OUT}`, { stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--outDir', OUT, '--port', '4175', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 3000));
const url = 'http://localhost:4175';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : extra); if (!ok) failed++; };

const open = async (published) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  let build = published;
  await page.route('**/version.json*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ build }) }));
  await page.goto(`${url}/?demo`); await page.waitForSelector('.hero');
  await page.evaluate(() => { window.__m = 1; });
  return { page, ctx, publish: (b) => { build = b; } };
};
const alive = (page) => page.evaluate(() => window.__m === 1).catch(() => false);
const tick = (page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

// 1) mesma versão: nada acontece
{
  const { page, ctx } = await open('1111111');
  await tick(page); await page.waitForTimeout(1500);
  check('mesma versão: não recarrega e não avisa', (await alive(page)) && (await page.locator('.update-bar').count()) === 0);
  await ctx.close();
}
// 2) versão nova com o app em uso seguro: recarrega sozinho; se a cópia velha voltar, não entra em laço e avisa
{
  const { page, ctx } = await open('2222222');
  await tick(page);
  await page.waitForFunction(() => window.__m !== 1, null, { timeout: 8000 }).catch(() => {});
  check('versão nova: recarrega sozinho', !(await alive(page)));
  await page.waitForSelector('.hero'); await page.evaluate(() => { window.__m = 1; });
  await tick(page); await page.waitForTimeout(2500);
  check('a cópia velha voltou: não recarrega de novo (sem laço)', await alive(page));
  check('…e mostra o aviso "Atualizar agora"', (await page.locator('.update-bar button:has-text("Atualizar agora")').count()) === 1);
  await page.click('.update-bar button');
  await page.waitForFunction(() => window.__m !== 1, null, { timeout: 8000 }).catch(() => {});
  check('"Atualizar agora" força o recarregamento', !(await alive(page)));
  await ctx.close();
}
// 3) janela aberta: só avisa; ao fechar, recarrega
{
  const { page, ctx } = await open('3333333');
  await page.click('.action:has-text("Despesa")'); await page.waitForSelector('.sheet');
  await tick(page); await page.waitForTimeout(1500);
  check('janela aberta: não recarrega', await alive(page));
  check('janela aberta: mostra o aviso', (await page.locator('.update-bar').count()) === 1);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__m !== 1, null, { timeout: 9000 }).catch(() => {});
  check('ao fechar a janela, recarrega sozinho', !(await alive(page)));
  await ctx.close();
}
// 4) digitando no campo rápido: só avisa; ao limpar, recarrega
{
  const { page, ctx } = await open('4444444');
  await page.fill('input[aria-label="Lançamento rápido"]', '50 merc');
  await tick(page); await page.waitForTimeout(1500);
  check('digitando: não recarrega (não perde o que a pessoa escreveu)', (await alive(page)) && (await page.inputValue('input[aria-label="Lançamento rápido"]')) === '50 merc');
  await page.fill('input[aria-label="Lançamento rápido"]', '');
  await page.waitForFunction(() => window.__m !== 1, null, { timeout: 9000 }).catch(() => {});
  check('campo vazio de novo: recarrega sozinho', !(await alive(page)));
  await ctx.close();
}
// 5) sem rede para o version.json: nada quebra
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.route('**/version.json*', (route) => route.abort());
  await page.goto(`${url}/?demo`); await page.waitForSelector('.hero'); await page.evaluate(() => { window.__m = 1; });
  await tick(page); await page.waitForTimeout(1500);
  check('falha ao consultar a versão: o app segue normal', (await alive(page)) && (await page.locator('.update-bar').count()) === 0);
  await ctx.close();
}
await browser.close();
server.kill();
console.log(failed ? `\n${failed} falha(s)` : '\natualização automática OK');
process.exit(failed ? 1 : 0);
