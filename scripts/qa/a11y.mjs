// Auditoria de acessibilidade (axe-core) nas telas e janelas principais, em claro/escuro e celular/computador.
// Uso: CHROMIUM_PATH=... node scripts/qa/a11y.mjs [url]
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4173';
const axeSrc = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const found = new Map();
const note = (where, v) => {
  for (const n of v.nodes) {
    const key = `${v.id}|${n.target.join(' ')}`;
    const cur = found.get(key) ?? { id: v.id, impact: v.impact, help: v.help, target: n.target.join(' '), summary: n.failureSummary?.split('\n')[1]?.trim() ?? '', where: new Set() };
    cur.where.add(where);
    found.set(key, cur);
  }
};
const run = async (page, where) => {
  await page.evaluate(axeSrc);
  const r = await page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }));
  for (const v of r.violations) note(where, v);
};

for (const scheme of ['light', 'dark']) for (const [w, h] of [[390, 844], [1280, 800]]) {
  const tag = `${scheme} ${w}`;
  const page = await (await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: 'reduce' })).newPage();
  await page.goto(`${url}/?demo`); await page.waitForSelector('.hero'); await page.waitForTimeout(600);
  const go = async (p) => { await page.evaluate((x) => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')); }, p); await page.waitForTimeout(550); };
  await run(page, `${tag} início`);
  for (const [p, name] of [['/lancamentos', 'extrato'], ['/orcamentos', 'orçamento'], ['/insights', 'insights'], ['/mais', 'mais'], ['/contas', 'contas'], ['/categorias', 'categorias'], ['/recorrencias', 'recorrências'], ['/notificacoes', 'notificações']]) {
    await go(p); await run(page, `${tag} ${name}`);
  }
  await go('/insights');
  for (const t of ['Evolução', 'Patrimônio']) { await page.click(`button[role="tab"]:has-text("${t}")`); await page.waitForTimeout(400); await run(page, `${tag} insights ${t}`); }
  await go('/contas'); await page.click('.item:has-text("Nubank Cartão")'); await page.waitForTimeout(600); await run(page, `${tag} cartão`);
  await go('/'); await page.click('.action:has-text("Despesa")'); await page.waitForSelector('.sheet'); await page.waitForTimeout(400); await run(page, `${tag} novo lançamento`);
  await page.fill('.amount-input', '1000'); await page.keyboard.press('Escape'); await page.waitForSelector('.ios-alert'); await page.waitForTimeout(300); await run(page, `${tag} alerta`);
  await page.click('.ios-alert button:has-text("Descartar")'); await page.waitForTimeout(400);
  await go('/contas'); await page.click('button[aria-label="Adicionar"]'); await page.waitForSelector('.sheet'); await page.waitForTimeout(400); await run(page, `${tag} nova conta`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await go('/'); await page.keyboard.press('Control+k'); await page.waitForSelector('.palette'); await page.fill('.palette input', 'pad'); await page.waitForTimeout(300); await run(page, `${tag} busca`);
}
await browser.close();

const rank = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const list = [...found.values()].sort((a, b) => (rank[a.impact] ?? 9) - (rank[b.impact] ?? 9) || a.id.localeCompare(b.id));
const byRule = new Map();
for (const f of list) (byRule.get(f.id) ?? byRule.set(f.id, []).get(f.id)).push(f);
for (const [id, items] of byRule) {
  console.log(`\n[${items[0].impact}] ${id} — ${items[0].help} (${items.length} lugares)`);
  for (const f of items.slice(0, 6)) console.log(`   ${f.target.slice(0, 80)}  · ${[...f.where].slice(0, 3).join(', ')}${f.summary ? ' · ' + f.summary.slice(0, 90) : ''}`);
}
console.log(`\nFIM: ${list.length} problemas distintos em ${byRule.size} regras`);
process.exit(list.some((f) => f.impact === 'critical' || f.impact === 'serious') ? 1 : 0);
