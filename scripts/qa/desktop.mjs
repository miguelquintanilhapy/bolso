// Bateria de responsividade para computador: alinhamentos, margens, sobreposições e janelas, em várias larguras.
// Uso: CHROMIUM_PATH=... node scripts/qa/desktop.mjs [url]
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4173';
const SIZES = [[1024, 768], [1100, 800], [1180, 820], [1280, 720], [1366, 768], [1440, 900], [1536, 864], [1920, 1080], [2560, 1440]];
const PAGES = ['/', '/lancamentos', '/orcamentos', '/insights', '/mais', '/contas', '/categorias', '/recorrencias', '/notificacoes'];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const problems = [];
const add = (w, h, where, what) => problems.push({ size: `${w}x${h}`, where, what });

const measure = () => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
  const out = { issues: [] };
  const nav = document.querySelector('nav.nav');
  const screen = document.querySelector('.screen');
  const vw = innerWidth;
  const doc = document.documentElement;
  if (doc.scrollWidth > vw + 1) out.issues.push(`rolagem horizontal (${doc.scrollWidth} > ${vw})`);
  if (nav && screen) {
    const n = r(nav), s = r(screen);
    out.nav = n; out.screen = s;
    if (n.r > s.l - 8) out.issues.push(`menu lateral encosta no conteúdo (menu até ${Math.round(n.r)}, conteúdo desde ${Math.round(s.l)})`);
    if (s.r > vw - 16) out.issues.push(`conteúdo colado na borda direita (até ${Math.round(s.r)} de ${vw})`);
    const left = s.l - n.r, right = vw - s.r;
    out.gap = [Math.round(left), Math.round(right)];
    if (Math.abs(left - right) > 40) out.issues.push(`margens desiguais: esquerda ${Math.round(left)} × direita ${Math.round(right)}`);
  }
  const title = document.querySelector('.screen > .topbar > :first-child');
  if (title) out.title = r(title);
  // elementos que vazam do contêiner, sem contar rolagens horizontais de propósito
  if (screen) {
    const s = r(screen);
    for (const el of screen.querySelectorAll('*')) {
      if (el.closest('.pills, .carousel, .table-view, .swipe-actions')) continue;
      const b = r(el);
      if (b.w === 0 || b.h === 0) continue;
      if (b.r > s.r + 2 || b.l < s.l - 2) { out.issues.push(`vaza do contêiner: ${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} (${Math.round(b.l)}..${Math.round(b.r)} em ${Math.round(s.l)}..${Math.round(s.r)})`); break; }
    }
    // texto cortado sem reticências
    for (const el of screen.querySelectorAll('b, small, span, p, h1, h2')) {
      if (el.children.length) continue;
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 2 && cs.overflow === 'visible' && cs.display !== 'inline') { out.issues.push(`texto estourando: "${(el.textContent || '').slice(0, 30)}"`); break; }
    }
    // blocos irmãos sobrepostos (cartões sobre cartões)
    const cards = [...screen.querySelectorAll('.card, .group')].filter((e) => !e.parentElement.closest('.card, .group'));
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
      const a = r(cards[i]), c = r(cards[j]);
      const ox = Math.min(a.r, c.r) - Math.max(a.l, c.l), oy = Math.min(a.b, c.b) - Math.max(a.t, c.t);
      if (ox > 4 && oy > 4) out.issues.push('cartões sobrepostos');
    }
  }
  return out;
};

for (const [w, h] of SIZES) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' })).newPage();
  await page.goto(`${url}/?demo`); await page.waitForSelector('.hero'); await page.waitForTimeout(500);
  const edges = [];
  for (const path of PAGES) {
    await page.evaluate((x) => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')); }, path);
    await page.waitForTimeout(450);
    const m = await page.evaluate(measure);
    for (const i of m.issues) add(w, h, path, i);
    if (m.title) edges.push([path, Math.round(m.title.l), Math.round(m.title.t)]);
  }
  // título de todas as páginas começa no mesmo x
  const xs = new Set(edges.map((e) => e[1]));
  if (xs.size > 1) add(w, h, 'todas', `início do cabeçalho em x diferentes: ${edges.map((e) => `${e[0]}=${e[1]}`).join(' ')}`);
  // janela de novo lançamento: centralizada e dentro da tela
  await page.keyboard.press('n'); await page.waitForSelector('.sheet', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);
  const dlg = await page.evaluate(() => { const e = document.querySelector('.sheet'); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, vw: innerWidth, vh: innerHeight }; });
  if (!dlg) add(w, h, 'janela', 'atalho N não abriu a janela');
  else {
    if (Math.abs((dlg.l + dlg.r) / 2 - dlg.vw / 2) > 3) add(w, h, 'janela', 'não está centralizada na horizontal');
    if (dlg.t < 0 || dlg.b > dlg.vh) add(w, h, 'janela', `passa da tela (${Math.round(dlg.t)}..${Math.round(dlg.b)} de ${dlg.vh})`);
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  // busca global
  await page.keyboard.press('Control+k'); await page.waitForSelector('.palette', { timeout: 3000 }).catch(() => {});
  const pal = await page.evaluate(() => { const e = document.querySelector('.palette'); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, vw: innerWidth }; });
  if (!pal) add(w, h, 'busca', 'Ctrl+K não abriu');
  else if (Math.abs((pal.l + pal.r) / 2 - pal.vw / 2) > 3) add(w, h, 'busca', 'não está centralizada');
  await page.keyboard.press('Escape');
  console.log(`${w}x${h} ok`);
}
await browser.close();
const byKey = new Map();
for (const p of problems) { const k = `${p.where} | ${p.what}`; (byKey.get(k) ?? byKey.set(k, []).get(k)).push(p.size); }
for (const [k, sizes] of byKey) console.log(`- ${k}  [${sizes.join(', ')}]`);
console.log(`\nFIM: ${byKey.size} problemas distintos`);
process.exit(problems.length ? 1 : 0);
