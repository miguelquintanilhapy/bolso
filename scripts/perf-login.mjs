// Tempo (dentro da página) até a tela principal, ao entrar numa conta que já tem dados e AVISOS PENDENTES de criar.
// Uso: node scripts/perf-login.mjs <url> [latencia-ms]
import { chromium } from 'playwright';
const [url = 'http://localhost:4173', lat = '400'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => {
  window.__hero = null;
  new MutationObserver(() => { if (window.__hero === null && document.querySelector('.hero')) window.__hero = Math.round(performance.now()); }).observe(document, { childList: true, subtree: true });
});
// 1) prepara uma conta com dados (sem atraso)
const prep = await ctx.newPage();
await prep.goto(`${url}/?demo`); await prep.waitForSelector('.hero'); await prep.waitForTimeout(2500);
// 2) simula "acabei de entrar": sem cópia local e com os avisos ainda por criar
await prep.evaluate((ms) => new Promise((r) => {
  const key = 'bolso:demo:v1'; const st = JSON.parse(localStorage.getItem(key)); st.notifications = []; localStorage.setItem(key, JSON.stringify(st));
  localStorage.setItem('bolso:demo-latency', ms);
  const q = indexedDB.deleteDatabase('bolso-cache'); q.onsuccess = q.onerror = q.onblocked = () => r();
}), lat);
await prep.close();
const times = [];
for (let i = 0; i < 3; i++) {
  const p = await ctx.newPage();
  await p.goto(url); await p.waitForSelector('.hero'); await p.waitForTimeout(300);
  times.push(await p.evaluate(() => window.__hero));
  // repete a situação: limpa avisos e cópia local para a próxima rodada
  await p.waitForTimeout(2500);
  await p.evaluate(() => new Promise((r) => { const key = 'bolso:demo:v1'; const st = JSON.parse(localStorage.getItem(key)); st.notifications = []; localStorage.setItem(key, JSON.stringify(st)); const q = indexedDB.deleteDatabase('bolso-cache'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await p.close();
}
console.log(`  ${times.join(' / ')} ms  (média ${Math.round(times.reduce((a, b) => a + b) / times.length)} ms)`);
await browser.close();
