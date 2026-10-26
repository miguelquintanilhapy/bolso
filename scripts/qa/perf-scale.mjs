// Desempenho com muitos lançamentos (modo demo): abertura, trocas de tela, extrato do período todo, busca, formulário e memória.
// Uso: CHROMIUM_PATH=... node scripts/qa/perf-scale.mjs [url] [quantidade=5000] [lentidao-cpu=1]
import { chromium } from 'playwright';
import { gzipSync } from 'node:zlib';

const [url = 'http://localhost:4173', countArg = '5000', cpuArg = '1'] = process.argv.slice(2);
const N = Number(countArg), CPU = Number(cpuArg);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'pt-BR' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// 1) abre o demo para criar contas/categorias, depois enche o armazenamento com N lançamentos de 3 anos
await page.goto(`${url}/?demo`); await page.waitForSelector('.hero');
const stats = await page.evaluate((n) => {
  const store = JSON.parse(localStorage.getItem('bolso:demo:v1'));
  const cats = store.categories.filter((c) => c.kind === 'expense'), income = store.categories.filter((c) => c.kind === 'income');
  const accs = store.accounts.filter((a) => a.kind !== 'investment');
  const sample = store.transactions[0];
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const today = new Date(); const rows = [];
  const names = ['Mercado', 'Uber', 'Padaria', 'Farmácia', 'Restaurante', 'Netflix', 'Gasolina', 'Lanche', 'Academia', 'Ifood', 'Cinema', 'Livraria'];
  for (let i = 0; i < n; i++) {
    const d = new Date(today.getTime() - Math.floor(rnd() * 1095) * 864e5);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const inc = rnd() < 0.08, acc = accs[Math.floor(rnd() * accs.length)];
    const cat = inc ? income[Math.floor(rnd() * income.length)] : cats[Math.floor(rnd() * cats.length)];
    rows.push({ ...sample, id: crypto.randomUUID(), kind: inc ? 'income' : 'expense', amount: Math.round((5 + rnd() * (inc ? 4000 : 400)) * 100) / 100, date: iso,
      description: inc ? 'Salário' : names[Math.floor(rnd() * names.length)] + ' ' + (i % 97), category_id: cat?.id ?? null, account_id: acc.id, to_account_id: null,
      status: d > today ? 'pending' : 'paid', updated_at: `${iso}T12:00:00.000Z`, tags: rnd() < 0.1 ? ['viagem'] : [], notes: '', installment_group: null, installment_number: null, installment_total: null, recurrence_id: null, ref_month: null, invoice_ref: null });
  }
  const longAgo = new Date(Date.now() - 40 * 864e5).toISOString();
  for (const t of ['accounts', 'categories', 'recurrences', 'notifications', 'investment_snapshots']) for (const r of store[t]) r.updated_at = longAgo;
  store.transactions = rows.map((r) => (r.date > today.toISOString().slice(0, 10) ? { ...r, updated_at: longAgo } : r));
  const json = JSON.stringify(store);
  localStorage.setItem('bolso:demo:v1', json);
  return { bytes: json.length };
}, N);
const raw = await page.evaluate(() => localStorage.getItem('bolso:demo:v1'));
const gz = gzipSync(raw).length;

// 2) mede com a base cheia
const cdp = await ctx.newCDPSession(page);
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
await page.addInitScript(() => {
  window.__long = [];
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch { /* sem suporte */ }
});
const t0 = Date.now();
await page.goto(`${url}/`); await page.waitForSelector('.hero');
const boot = Date.now() - t0;
const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
const timeIt = async (fn) => { const t = Date.now(); await fn(); await frame(); return Date.now() - t; };
const nodes = () => page.evaluate(() => document.querySelectorAll('*').length);
const res = {};
res['abrir o app (até o patrimônio aparecer)'] = boot;
res['Início → Extrato'] = await timeIt(async () => { await page.click('nav a:has-text("Extrato")'); await page.waitForSelector('.swipe, .empty'); });
res['  linhas no mês (DOM)'] = await page.locator('.swipe').count();
res['Extrato: ligar "Todo o período"'] = await timeIt(async () => { await page.click('button:has-text("Filtros")'); await page.check('input[type=checkbox]'); await page.waitForTimeout(50); });
res['  linhas no período todo (DOM)'] = await page.locator('.swipe').count();
res['  elementos na página (DOM)'] = await nodes();
res['Extrato: digitar "merc" na busca (período todo)'] = await timeIt(async () => { await page.fill('input[aria-label="Buscar"]', 'merc'); await page.waitForTimeout(30); });
res['  resultados'] = await page.locator('.swipe').count();
await page.fill('input[aria-label="Buscar"]', '');
await page.uncheck('input[type=checkbox]');
for (const [label, sel, tab] of [['Orçamento', 'nav a:has-text("Orçamento")'], ['Insights (Resumo)', 'nav a:has-text("Insights")'], ['Mais', 'nav a:has-text("Mais")'], ['Início', 'nav a:has-text("Início")']]) {
  res[`→ ${label}`] = await timeIt(async () => { await page.click(sel); await page.waitForTimeout(40); });
  void tab;
}
await page.click('nav a:has-text("Insights")'); await page.waitForTimeout(100);
res['Insights: aba Evolução'] = await timeIt(async () => { await page.click('button[role="tab"]:has-text("Evolução")'); await page.waitForTimeout(40); });
res['Insights: aba Patrimônio'] = await timeIt(async () => { await page.click('button[role="tab"]:has-text("Patrimônio")'); await page.waitForTimeout(40); });
await page.click('nav a:has-text("Início")'); await page.waitForTimeout(100);
res['Abrir o formulário de lançamento'] = await timeIt(async () => { await page.click('.action:has-text("Despesa")'); await page.waitForSelector('.sheet'); });
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
res['Lançamento rápido (salvar com a base cheia)'] = await timeIt(async () => { await page.fill('input[aria-label="Lançamento rápido"]', '12,50 mercado'); await page.press('input[aria-label="Lançamento rápido"]', 'Enter'); await page.waitForSelector('.toast'); });
const mem = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null));
const long = await page.evaluate(() => window.__long);

console.log(`\n${N} lançamentos · CPU ${CPU === 1 ? 'normal' : `${CPU}x mais lenta (celular)`}`);
console.log(`dados: ${(stats.bytes / 1024).toFixed(0)} KB em JSON, ${(gz / 1024).toFixed(0)} KB compactado (≈ o que trafega a cada abertura sem cópia local)`);
for (const [k, v] of Object.entries(res)) console.log(`  ${k.padEnd(52)} ${typeof v === 'number' && !k.includes('linhas') && !k.includes('elementos') && !k.includes('resultados') ? v + ' ms' : v}`);
console.log(`  memória JS usada: ${mem ?? 'n/d'} MB · tarefas longas (>50 ms): ${long.length}${long.length ? ' (maior ' + Math.max(...long) + ' ms)' : ''}`);
// 2ª abertura: com a cópia local, só o que mudou deve vir do servidor
await page.waitForTimeout(1500);
const first = await page.evaluate(() => window.__dbStats);
await page.reload(); await page.waitForSelector('.hero'); await page.waitForTimeout(800);
const second = await page.evaluate(() => window.__dbStats);
console.log(`  linhas baixadas na 1ª abertura (completa): ${first?.listRows ?? 'n/d'} · na 2ª abertura (incremental): lista ${second?.listRows ?? 'n/d'} + mudanças ${second?.changeRows ?? 'n/d'}`);
if (errors.length) console.log('ERROS:', errors.join(' | '));
await browser.close();
