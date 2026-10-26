// Varredor de responsividade: abre cada tela e cada formulário em vários tamanhos de tela, com dados normais e de estresse,
// e mede o que sai do lugar. Uso: node scripts/qa/layout.mjs <url> <pasta-de-saida> [normal|stress|all]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [url = 'http://localhost:4173', out = '/tmp/qa', which = 'all'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const VIEWPORTS = [[320, 568], [360, 740], [390, 844], [430, 932], [600, 900], [719, 900], [720, 900], [768, 1024], [900, 1000], [1023, 768], [1024, 768], [1100, 800], [1180, 800], [1280, 720], [1366, 768], [1440, 900], [1536, 864], [1920, 1080], [2560, 1440], [844, 390], [1280, 500]];
const STRESS_VIEWPORTS = [[320, 568], [390, 844], [768, 1024], [1024, 768], [1280, 720], [1920, 1080]];

// dados de estresse: nomes enormes, valores gigantes e minúsculos, muitas contas, muitas tags
function seedStress() {
  const id = () => crypto.randomUUID();
  const now = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ago = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return iso(d); };
  const ts = new Date().toISOString();
  const long = 'Conta corrente principal do Banco Internacional de Investimentos e Participações S.A. ';
  const acct = (name, kind, extra = {}) => ({ id: id(), created_at: ts, name, kind, initial_balance: 0, closing_day: null, due_day: null, credit_limit: null, color: '#4a8fe5', is_default: false, archived: false, ...extra });
  const accounts = [
    acct(long.slice(0, 60), 'checking', { initial_balance: 999999999.99, is_default: true }),
    acct('Itaú', 'checking', { initial_balance: -1234567.89 }),
    acct('Nubank Ultravioleta Black Cartão de Crédito Internacional Mastercard', 'credit', { closing_day: 31, due_day: 5, credit_limit: 99999999.99, color: '#111111' }),
    acct('XP', 'credit', { closing_day: 1, due_day: 28, credit_limit: 500, color: '#e0566b' }),
    acct('Tesouro Selic 2029 com juros semestrais e vencimento longo demais para caber', 'investment', { initial_balance: 0.01, color: '#2f9e5b' }),
    acct('Cofrinho', 'investment', { initial_balance: 1e9, color: '#d6a13a' }),
    acct('Carteira', 'checking', { initial_balance: 0 }), acct('Poupança', 'checking', { initial_balance: 12 }),
  ];
  const kinds = [['Alimentação', 'utensils', 'expense'], ['Categoria com um nome absurdamente comprido que ninguém usaria na vida', 'tag', 'expense'], ['Salário', 'wallet', 'income']];
  const categories = kinds.map(([name, icon, kind]) => ({ id: id(), created_at: ts, name, kind, icon, color: '#e5844a', keywords: ['a'.repeat(40), 'mercado'], budget_limit: kind === 'expense' ? 100 : null, archived: false }));
  const base = { notes: '', tags: [], to_account_id: null, installment_group: null, installment_number: null, installment_total: null, recurrence_id: null, ref_month: null, invoice_ref: null, status: 'paid', created_at: ts };
  const txs = [];
  for (let i = 0; i < 60; i++) {
    const a = accounts[i % accounts.length];
    txs.push({ ...base, id: id(), kind: i % 7 === 0 ? 'income' : 'expense', amount: [0.01, 999999999.99, 12.5, 1234567.89, 3][i % 5], date: ago(i % 40), account_id: a.id, category_id: categories[i % 3].id,
      description: ['Compra', 'Descrição gigantesca '.repeat(8), 'ÃÇÕÊ ' + 'ü'.repeat(30), '🙂'.repeat(12), 'palavra'.repeat(30)][i % 5], tags: i % 3 === 0 ? ['tagbemcompridademaisparacaber'.repeat(2), 'b', 'c', 'd', 'e', 'f'] : [],
      notes: i % 4 === 0 ? 'Observação longa. '.repeat(30) : '', status: i % 9 === 0 ? 'pending' : 'paid', installment_total: i % 11 === 0 ? 12 : null, installment_number: i % 11 === 0 ? 3 : null });
  }
  const recurrences = [{ id: id(), created_at: ts, description: 'Assinatura '.repeat(10), amount: 99999.99, kind: 'expense', account_id: accounts[0].id, category_id: null, tags: [], day_of_month: 31, start_month: iso(now).slice(0, 7), end_month: null, last_generated_month: iso(now).slice(0, 7), active: true }];
  const notifications = [{ id: id(), created_at: ts, kind: 'budget', title: 'Orçamento de uma categoria com nome enorme estourou e o título é longo '.repeat(2), body: 'Texto de aviso '.repeat(30), link: '/orcamentos', dedupe_key: 'k1', read: false }];
  const investment_snapshots = [{ id: id(), created_at: ts, account_id: accounts[4].id, date: ago(60), balance: 100 }, { id: id(), created_at: ts, account_id: accounts[4].id, date: ago(3), balance: 99999999.5 }];
  localStorage.setItem('bolso:demo:v1', JSON.stringify({ accounts, categories, transactions: txs, recurrences, notifications, investment_snapshots }));
}

// coleta de problemas dentro da página
function collect() {
  const vw = document.documentElement.clientWidth, vh = innerHeight;
  const issues = [];
  const sig = (e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
  const add = (type, e, detail = '') => issues.push({ type, sig: sig(e), detail });
  const shown = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const scroller = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { if (p.classList.contains('app') || p.classList.contains('page')) continue; const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return p; } return null; };
  const root = document.querySelector('.sheet') ?? document.querySelector('.app');
  const nav = document.querySelector('nav.nav');
  const nr = nav?.getBoundingClientRect();
  const side = nr && nr.left <= 0 && nr.height >= vh - 2 && nr.width > 150 && nr.width < 400;
  const bottomBar = nr && !side && nr.top > vh / 2;

  if (document.documentElement.scrollWidth > vw + 1) add('rolagem-lateral', document.documentElement, `${document.documentElement.scrollWidth} > ${vw}`);
  for (const e of root.querySelectorAll('*')) {
    if (!shown(e) || e.closest('svg') || e.closest('.overlay')) continue;
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    if ((r.right > vw + 1 || r.left < -1) && !scroller(e)) add('fora-da-tela', e, `${Math.round(r.left)}..${Math.round(r.right)} (tela ${vw})`);
    if (side && root.classList.contains('app') && r.left < nr.right - 1 && !e.closest('nav')) add('sob-o-menu', e, `x=${Math.round(r.left)} menu até ${Math.round(nr.right)}`);
    const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 11) add('fonte-pequena', e, `${fs}px`);
      if (e.scrollWidth > e.clientWidth + 1 && cs.overflowX === 'visible' && cs.display !== 'inline') add('texto-vaza', e, `${e.scrollWidth} > ${e.clientWidth}`);
      if (e.scrollWidth > e.clientWidth + 1 && cs.textOverflow === 'ellipsis') add('texto-truncado', e, `${e.scrollWidth} > ${e.clientWidth}`);
    }
    const parent = e.parentElement;
    if (parent && parent !== root && shown(parent)) {
      const pr = parent.getBoundingClientRect(), pcs = getComputedStyle(parent);
      if (pcs.overflowX === 'visible' && pcs.display !== 'contents' && (r.right > pr.right + 1.5 || r.left < pr.left - 1.5) && !['absolute', 'fixed'].includes(cs.position) && !e.closest('.nav-items') && !parent.classList.contains('carousel') && !parent.classList.contains('pills')) add('vaza-do-contêiner', e, `${Math.round(r.right)} > ${Math.round(pr.right)}`);
    }
    if (vw < 720 && ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName) || (vw < 720 && e.getAttribute('role') === 'button')) {
      if ((r.width < 40 || r.height < 40) && !e.matches('input[type=checkbox]') && !e.closest('.chart') && !e.matches('.link')) add('alvo-pequeno', e, `${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  const sticky = [...document.querySelectorAll('.col-b, .split-col.sticky')].find((e) => getComputedStyle(e).position === 'sticky');
  if (sticky) { const h = sticky.getBoundingClientRect().height; if (h > vh - 40) add('sticky-maior-que-a-tela', sticky, `${Math.round(h)} > ${vh - 40}`); }
  const sheet = document.querySelector('.sheet');
  if (sheet) {
    const r = sheet.getBoundingClientRect();
    if (r.top < -1 || r.bottom > vh + 1 || r.left < -1 || r.right > vw + 1) add('janela-fora-da-tela', sheet, `${Math.round(r.top)}..${Math.round(r.bottom)} (tela ${vh})`);
    const foot = sheet.querySelector('.sheet-foot');
    if (foot) { const f = foot.getBoundingClientRect(); if (f.bottom > vh + 1 || f.top < 0) add('rodape-da-janela-fora-da-tela', foot, `${Math.round(f.top)}..${Math.round(f.bottom)}`); }
    const body = sheet.querySelector('.sheet-body');
    if (body && body.getBoundingClientRect().height < 120 && body.scrollHeight > 200) add('janela-sem-espaço-para-o-conteúdo', body, `visível ${Math.round(body.getBoundingClientRect().height)}px de ${body.scrollHeight}px`);
  } else if (bottomBar) {
    window.scrollTo(0, 1e7);
    const last = Math.max(0, ...[...document.querySelectorAll('.screen *')].filter(shown).map((e) => e.getBoundingClientRect().bottom));
    if (last > nr.top - 2) add('escondido-pela-barra-inferior', nav, `conteúdo até ${Math.round(last)}, barra a partir de ${Math.round(nr.top)}`);
    window.scrollTo(0, 0);
  }
  return issues;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const results = [];
const seen = new Map();

async function runDataset(dataset, viewports) {
  for (const [w, h] of viewports) {
    const mobile = w < 720;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce', hasTouch: mobile, isMobile: mobile && w < 500 });
    if (dataset === 'stress') await ctx.addInitScript(seedStress);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(dataset === 'normal' ? `${url}/?demo` : url);
    await page.waitForSelector('.hero', { timeout: 20000 });
    await page.waitForTimeout(500);
    const ids = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('bolso:demo:v1')); const by = (k) => s.accounts.find((a) => a.kind === k)?.id; return { checking: by('checking'), credit: by('credit'), investment: by('investment') }; });
    const go = async (path) => { await page.evaluate((x) => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')); }, path); await page.waitForTimeout(220); };
    const record = async (state) => {
      let issues = [];
      try { issues = await page.evaluate(collect); } catch (e) { issues = [{ type: 'erro-no-teste', sig: state, detail: e.message }]; }
      for (const i of issues) {
        const key = `${dataset}|${state}|${i.type}|${i.sig}`;
        const row = seen.get(key) ?? { dataset, state, ...i, viewports: [], details: [] };
        row.viewports.push(`${w}x${h}`); if (row.details.length < 2) row.details.push(i.detail);
        seen.set(key, row);
      }
      if (issues.some((i) => !['texto-truncado'].includes(i.type))) {
        const shot = `${out}/${dataset}-${w}x${h}-${state.replace(/[^a-z0-9]+/gi, '_')}.png`;
        if (!results.includes(shot) && results.length < 140) { await page.screenshot({ path: shot }).catch(() => {}); results.push(shot); }
      }
    };
    const pages = ['/', '/lancamentos', '/orcamentos', '/insights', '/mais', '/contas', '/categorias', '/recorrencias', '/notificacoes', `/contas/${ids.credit}`, `/contas/${ids.investment}`, `/contas/${ids.checking}`];
    for (const p of pages) { await go(p); await record(p.replace(/[0-9a-f-]{36}/, ':id')); }
    await go('/insights');
    for (const tab of ['Evolução', 'Patrimônio']) { await page.click(`button[role="tab"]:has-text("${tab}")`).catch(() => {}); await page.waitForTimeout(220); await record(`/insights (${tab})`); }
    // formulários
    const openAndRecord = async (label, setup) => { try { await setup(); await page.waitForSelector('.sheet', { timeout: 3000 }); await page.waitForTimeout(260); await record(`janela: ${label}`); await page.keyboard.press('Escape'); await page.waitForTimeout(200); if (await page.locator('.ios-alert button.danger').count()) await page.click('.ios-alert button.danger'); await page.waitForSelector('.sheet', { state: 'detached', timeout: 3000 }); } catch (e) { seen.set(`${dataset}|janela ${label}|erro|${w}`, { dataset, state: `janela: ${label}`, type: 'janela-não-abriu', sig: label, viewports: [`${w}x${h}`], details: [e.message.split('\n')[0]] }); await page.keyboard.press('Escape').catch(() => {}); } };
    await go('/');
    await openAndRecord('novo lançamento', () => page.click('.action:has-text("Despesa")'));
    await openAndRecord('nova transferência', () => page.click('.action:has-text("Transferir")'));
    await go('/contas'); await openAndRecord('nova conta', () => page.click('button[aria-label="Adicionar"]'));
    await openAndRecord('nova conta (cartão)', async () => { await page.click('button[aria-label="Adicionar"]'); await page.waitForSelector('.sheet'); await page.click('.sheet .seg button:has-text("Cartão")'); });
    await go('/categorias'); await openAndRecord('categoria', () => page.click('.group .item >> nth=0'));
    await go('/recorrencias'); await openAndRecord('recorrência', () => page.click('button[aria-label="Nova recorrência"]'));
    await go(`/contas/${ids.checking}`); await openAndRecord('ajustar saldo', () => page.click('button:has-text("Ajustar saldo")'));
    await go(`/contas/${ids.investment}`); await openAndRecord('atualizar saldo', () => page.click('button:has-text("Atualizar saldo")'));
    await go('/lancamentos'); await openAndRecord('editar lançamento', () => page.click('.list .item >> nth=0'));
    if (errs.length) seen.set(`${dataset}|erros-js|${w}`, { dataset, state: 'geral', type: 'erro-javascript', sig: `${w}x${h}`, viewports: [`${w}x${h}`], details: errs.slice(0, 2) });
    await ctx.close();
    process.stdout.write(`${dataset} ${w}x${h} ok\n`);
  }
}

if (which !== 'stress') await runDataset('normal', VIEWPORTS);
if (which !== 'normal') await runDataset('stress', STRESS_VIEWPORTS);
await browser.close();
const rows = [...seen.values()].sort((a, b) => a.type.localeCompare(b.type) || a.state.localeCompare(b.state));
writeFileSync(`${out}/resultado.json`, JSON.stringify(rows, null, 1));
console.log(`\nFIM: ${rows.length} achados distintos. Detalhes em ${out}/resultado.json`);
