// Mede o tempo até a tela principal aparecer, com atraso simulado por chamada ao banco.
// Uso: node scripts/perf.mjs <url> [latencia-ms]
import { chromium } from 'playwright';
const [url = 'http://localhost:4173', lat = '400'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript((ms) => localStorage.setItem('bolso:demo-latency', ms), lat);
const visit = async (label) => {
  const p = await ctx.newPage();
  const t0 = Date.now();
  await p.goto(`${url}/${label.includes('demo') ? '?demo' : ''}`);
  await p.waitForSelector('.hero', { timeout: 30000 });
  const ms = Date.now() - t0;
  await p.waitForTimeout(3000); // deixa a manutenção em segundo plano terminar
  await p.close();
  return ms;
};
console.log(`atraso simulado: ${lat} ms por chamada ao banco`);
console.log(`  1º acesso, conta nova (cria categorias):   ${await visit('novo')} ms até aparecer a tela`);
console.log(`  2º acesso, já com dados (com ?demo, lote):  ${await visit('demo')} ms`);
console.log(`  3º acesso, volta ao app:                    ${await visit('volta')} ms`);
console.log(`  4º acesso, volta ao app:                    ${await visit('volta')} ms`);
// entrar de novo depois de sair: a cópia local foi apagada, mas a conta já tem dados
{
  const p = await ctx.newPage();
  await p.goto(url); await p.waitForSelector('.hero');
  await p.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('bolso-cache'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await p.close();
  console.log(`  5º acesso, SEM cópia local (login a frio):   ${await visit('frio')} ms   <- caso de quem acabou de entrar`);
}
await browser.close();
