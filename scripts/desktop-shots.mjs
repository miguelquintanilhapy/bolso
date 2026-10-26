// Tira prints das telas em tamanhos de computador/tablet. Uso: node scripts/desktop-shots.mjs <url> <pasta> [LxA] [claro|escuro] [prefixo]
import { chromium } from 'playwright';
const [url = 'http://localhost:4173', dir = '/tmp/shots', size = '1280x800', scheme = 'claro', prefix = 'd'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme === 'escuro' ? 'dark' : 'light' });
const p = await ctx.newPage();
await p.goto(`${url}/?demo`); await p.waitForSelector('.hero'); await p.waitForTimeout(1500);
const go = async (path) => { await p.evaluate((x) => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')); }, path); await p.waitForTimeout(1100); };
const shot = async (n) => p.screenshot({ path: `${dir}/${prefix}-${n}.png` });
await shot('home');
for (const [path, name] of [['/lancamentos', 'extrato'], ['/orcamentos', 'orcamento'], ['/insights', 'insights'], ['/mais', 'mais'], ['/contas', 'contas']]) { await go(path); await shot(name); }
await go('/contas'); await p.click('.item:has-text("Nubank Cartão")'); await p.waitForTimeout(1100); await shot('cartao');
await go('/lancamentos'); await p.click('.item >> nth=1'); await p.waitForSelector('.sheet'); await p.waitForTimeout(700); await shot('painel');
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log(`${size} ${scheme}: rolagem lateral = ${overflow}px`);
await browser.close();
