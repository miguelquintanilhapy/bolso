// Teste de fumaça no navegador (modo demo, viewport de iPhone). Uso: node scripts/e2e.mjs <url> <pasta-de-prints>
import { chromium } from 'playwright';

const [url = 'http://localhost:4173', shots = '/tmp/shots'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light', locale: 'pt-BR' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));

let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : extra); if (!ok) failed++; };
const shot = async (n) => { await page.waitForTimeout(750); await page.screenshot({ path: `${shots}/${n}.png`, fullPage: false }); };
const text = (sel) => page.locator(sel).first().innerText();
const quick = async (t) => { await page.fill('input[aria-label="Lançamento rápido"]', t); await page.press('input[aria-label="Lançamento rápido"]', 'Enter'); };

await page.goto(`${url}/?demo`);
await page.waitForSelector('.hero');
check('home carrega com patrimônio', /R\$/.test(await text('.hero')));
await shot('01-home');

// campo rápido: categoria conhecida
const before = await page.locator('.list .item').count();
await quick('50 mercado');
await page.waitForSelector('.toast');
check('toast de confirmação', /Saída de R\$\s?50,00 em Alimentação/.test(await text('.toast')), await text('.toast'));
await page.evaluate(() => { history.pushState({}, '', '/lancamentos'); dispatchEvent(new PopStateEvent('popstate')); });
await page.waitForSelector('.item:has-text("Mercado")');
check('lançamento apareceu na lista (exemplo + novo)', (await page.locator('.item:has-text("Mercado")').count()) === 2, String(await page.locator('.item:has-text("Mercado")').count()));
await page.click('.toast button'); // desfazer
await page.waitForTimeout(250);
check('desfazer removeu o lançamento', (await page.locator('.item:has-text("Mercado")').count()) === 1, String(await page.locator('.item:has-text("Mercado")').count()));
await page.evaluate(() => { history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate')); });
await page.waitForSelector('.hero');
void before;

// campo rápido: palavra desconhecida abre o formulário e aprende
await quick('30 xyz');
await page.waitForSelector('.sheet');
check('formulário abre com valor preenchido', (await page.inputValue('.amount-input')) === '30');
await page.click('.sheet .chip:has-text("Lazer")');
await shot('02-form');
await page.click('.sheet .btn.primary');
await page.waitForSelector('.sheet', { state: 'detached' });
await quick('15 xyz');
await page.waitForSelector('.toast:has-text("Lazer")');
check('palavra aprendida (xyz → Lazer)', true);

// entrada e parcelas no cartão
await quick('+3000 salário');
await page.waitForSelector('.toast:has-text("Entrada")');
await quick('600 tv 3x cartão');
await page.waitForSelector('.toast:has-text("3x")');
await page.evaluate(() => { history.pushState({}, '', '/lancamentos'); dispatchEvent(new PopStateEvent('popstate')); });
await page.fill('input[aria-label="Buscar"]', 'tv');
await page.waitForTimeout(200);
check('3 parcelas de R$ 200,00 criadas (1 no mês, outras nos próximos meses)', (await page.locator('.item:has-text("200,00")').count()) >= 1, String(await page.locator('.item').count()));
await page.click('input[aria-label="Buscar"]', { clickCount: 3 }); await page.fill('input[aria-label="Buscar"]', '');
await page.evaluate(() => { history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate')); });

// páginas
for (const [path, name, expect] of [
  ['/lancamentos', '03-lancamentos', 'Extrato'], ['/orcamentos', '04-orcamento', 'Orçamento'], ['/insights', '05-insights', 'Insights'],
  ['/mais', '06-mais', 'Mais'], ['/contas', '07-contas', 'Contas e cartões'], ['/categorias', '08-categorias', 'Categorias'],
  ['/recorrencias', '09-recorrencias', 'Recorrências'], ['/notificacoes', '10-notificacoes', 'Notificações'],
]) {
  const inNav = await page.locator(`nav a[href="${path}"]`).count();
  if (inNav) await page.click(`nav a[href="${path}"]`);
  else await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path);
  await page.waitForTimeout(250);
  check(`página ${path}`, (await page.locator('h1').first().innerText()).includes(expect), await page.locator('h1').first().innerText());
  await shot(name);
}

// insights: abas
await page.evaluate(() => { history.pushState({}, '', '/insights'); dispatchEvent(new PopStateEvent('popstate')); });
await page.waitForTimeout(200);
await page.click('button[role="tab"]:has-text("Evolução")'); await page.waitForTimeout(150); await shot('11-evolucao');
await page.click('button[role="tab"]:has-text("Patrimônio")'); await page.waitForTimeout(150); await shot('12-patrimonio');
const chart = page.locator('.chart').first();
const box = await chart.boundingBox();
await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4);
await page.waitForTimeout(100);
check('tooltip do gráfico', await page.locator('.tip').count() > 0);
await shot('13-tooltip');

// conta de cartão e pagamento da fatura
await page.evaluate(() => { history.pushState({}, '', '/contas'); dispatchEvent(new PopStateEvent('popstate')); });
await page.click('.item:has-text("Nubank Cartão")');
await page.waitForSelector('text=Fechamento');
await shot('14-cartao');
await page.click('button:has-text("Pagar fatura")');
await page.waitForSelector('.sheet');
check('pagar fatura abre transferência', /transfer/i.test(await text('.sheet-head h2')), await text('.sheet-head h2'));
await shot('15-pagar-fatura');
await page.click('.sheet .btn.primary');
await page.waitForSelector('.sheet', { state: 'detached' });

// ocultar valores
await page.evaluate(() => { history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate')); });
await page.click('button[aria-label="Ocultar valores"]');
check('valores ocultos', (await text('.hero')).includes('••'));
await shot('16-oculto');
await page.click('button[aria-label="Mostrar valores"]');

// tema escuro
await page.emulateMedia({ colorScheme: 'dark' });
await page.waitForTimeout(150);
await shot('17-home-escuro');
await page.evaluate(() => { history.pushState({}, '', '/orcamentos'); dispatchEvent(new PopStateEvent('popstate')); });
await page.waitForTimeout(200);
await shot('18-orcamento-escuro');


// ── novidades de UX (modo demo com dados de exemplo)
const go = async (path) => { await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path); await page.waitForTimeout(450); };
await go('/');
await page.click('nav a[href="/lancamentos"]'); await page.waitForTimeout(500);
check('barra: indicador desliza para a aba ativa (--i = 1)', (await page.locator('nav.nav').evaluate((n) => n.style.getPropertyValue('--i'))) === '1');
check('barra: todas as abas têm rótulo visível', (await page.locator('nav.nav a span').evaluateAll((els) => els.every((e) => getComputedStyle(e).display !== 'none' && e.textContent.trim()))));

// pagar com um toque
const payBtn = page.locator('.pay-btn').first();
check('pendentes mostram botão "Pagar" na própria linha', await payBtn.count() > 0);
const pendingBefore = await page.locator('.pay-btn').count();
await payBtn.click();
await page.waitForSelector('.toast:has-text("Marcado como")');
await page.waitForTimeout(300);
check('pagar com um toque remove o botão da linha', (await page.locator('.pay-btn').count()) === pendingBefore - 1);
await page.click('.toast button'); await page.waitForTimeout(300);
check('desfazer volta a ficar pendente', (await page.locator('.pay-btn').count()) === pendingBefore);

// formulário: sugestão de categoria, atalho "Ontem", Enter salva, rodapé fixo
await page.click('button[aria-label="Novo lançamento"]');
await page.waitForSelector('.sheet');
await page.fill('.sheet input[placeholder="Ex.: Mercado"]', 'mercado do bairro');
check('categoria sugerida pela descrição (Alimentação)', (await page.locator('.sheet .chip[aria-pressed="true"]:has-text("Alimentação")').count()) === 1);
await page.click('.sheet .seg button:has-text("Ontem")');
check('atalho "Ontem" não abre campo de data', (await page.locator('.sheet input[type="date"]').count()) === 0);
const footVisible = await page.locator('.sheet-foot .btn.primary').isVisible();
check('botão Salvar sempre visível (rodapé fixo)', footVisible);
await page.press('.sheet .amount-input', 'Enter');
await page.waitForTimeout(150);
check('Enter sem valor mostra erro', await page.locator('.sheet-foot .error-text').count() === 1);
await page.fill('.sheet .amount-input', '12,5');
await page.press('.sheet .amount-input', 'Enter');
await page.waitForSelector('.sheet', { state: 'detached' });
check('Enter com valor salva e fecha o painel', true);

// barra inferior fixa ao rolar (regressão: overflow-x em html/body quebra position:fixed no Safari do iPhone)
await go('/');
const navGap = () => page.evaluate(() => Math.round(innerHeight - document.querySelector('nav.nav').getBoundingClientRect().bottom));
const gap0 = await navGap();
await page.evaluate(() => window.scrollTo(0, 700)); await page.waitForTimeout(250);
check('barra inferior não se mexe ao rolar a página', (await navGap()) === gap0, `${gap0} → ${await navGap()}`);
const ov = await page.evaluate(() => [getComputedStyle(document.documentElement).overflowX, getComputedStyle(document.body).overflowX, document.scrollingElement.tagName].join(','));
check('rolagem é a da página (sem overflow-x em html/body)', ov === 'visible,visible,HTML', ov);
await page.evaluate(() => window.scrollTo(0, 0));

// duplo envio: dois disparos no mesmo instante não podem criar dois lançamentos
await go('/');
await page.fill('input[aria-label="Lançamento rápido"]', '77 mercado');
await page.evaluate(() => { const f = document.querySelector('form.quick'); f.requestSubmit(); f.requestSubmit(); });
await page.waitForSelector('.toast:has-text("R$ 77,00")'); await page.waitForTimeout(500);
await go('/lancamentos');
const dup = await page.locator('.item:has-text("R$ 77,00")').count();
check('campo rápido: duplo envio cria só 1 lançamento', dup === 1, `criou ${dup}`);
await page.click('button[aria-label="Novo lançamento"]'); await page.waitForSelector('.sheet');
await page.fill('.sheet .amount-input', '88');
await page.evaluate(() => { const b = document.querySelector('.sheet-foot .btn.primary'); b.click(); b.click(); });
await page.waitForSelector('.sheet', { state: 'detached' }); await page.waitForTimeout(500);
const dup2 = await page.locator('.item:has-text("R$ 88,00")').count();
check('formulário: duplo clique em Salvar cria só 1 lançamento', dup2 === 1, `criou ${dup2}`);

// arrastar o painel para baixo fecha
await page.click('button[aria-label="Novo lançamento"]');
await page.waitForSelector('.sheet');
await page.waitForTimeout(450);
const hb = await page.locator('.sheet-head h2').boundingBox();
await page.mouse.move(hb.x + hb.width / 2, hb.y + 5);
await page.mouse.down();
await page.mouse.move(hb.x + hb.width / 2, hb.y + 200, { steps: 8 });
await page.mouse.up();
await page.waitForSelector('.sheet', { state: 'detached', timeout: 3000 });
check('arrastar o painel para baixo fecha', true);

// Esc fecha
await page.click('button[aria-label="Novo lançamento"]'); await page.waitForSelector('.sheet');
await page.keyboard.press('Escape');
await page.waitForSelector('.sheet', { state: 'detached', timeout: 3000 });
check('Esc fecha o painel', true);

// confirmação de exclusão no estilo do app (não o confirm do navegador)
let nativeDialog = false;
page.on('dialog', async (d) => { nativeDialog = true; await d.dismiss(); });
await go('/contas');
await page.click('.item:has-text("Tesouro Selic")'); await page.waitForTimeout(400);
await page.click('button[aria-label="Editar conta"]'); await page.waitForSelector('.sheet');
await page.click('.sheet button:has-text("Apagar conta")');
await page.waitForSelector('.sheet[aria-label="Apagar conta?"]');
check('exclusão pede confirmação em painel do app', !nativeDialog);
await shot('23-confirmacao');
await page.click('.sheet[aria-label="Apagar conta?"] button:has-text("Cancelar")');
await page.waitForTimeout(500);
check('cancelar mantém a conta', (await page.locator('.sheet[aria-label="Editar conta"]').count()) === 1);
await page.keyboard.press('Escape'); await page.waitForTimeout(400);

// ajuda do campo rápido
await go('/');
await page.click('button[aria-label="Como usar o lançamento rápido"]');
await page.waitForSelector('.sheet[aria-label="Lançamento rápido"]');
await shot('24-ajuda-rapido');
await page.click('.help-ex:has-text("uber 23,90")');
await page.waitForTimeout(500);
check('exemplo da ajuda preenche o campo rápido', (await page.inputValue('input[aria-label="Lançamento rápido"]')) === 'uber 23,90');

// contraste mínimo do texto secundário (WCAG AA) no tema claro
const ratio = await page.evaluate(() => {
  const lum = (c) => { const [r, g, b] = c.match(/\d+/g).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const fg = getComputedStyle(document.querySelector('.hint')).color, bg = getComputedStyle(document.querySelector('.card')).backgroundColor;
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x); return (a + 0.05) / (b + 0.05);
});
check(`contraste do texto secundário ≥ 4.5 (medido ${ratio.toFixed(2)})`, ratio >= 4.5);

// modo "reduzir movimento": tudo continua funcionando, sem animações
const calm = await (await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })).newPage();
const calmErrors = []; calm.on('pageerror', (e) => calmErrors.push(e.message));
await calm.goto(`${url}/?demo`); await calm.waitForSelector('.hero');
const dur = await calm.locator('.screen > *').first().evaluate((e) => getComputedStyle(e).animationDuration);
check('reduzir movimento: animações desligadas', parseFloat(dur) < 0.01, dur);
check('reduzir movimento: sem erros', calmErrors.length === 0);

// cópia local: abre rápido mesmo com rede lenta, e sair da conta apaga a cópia
await page.waitForTimeout(800); // deixa o cache ser gravado (grava ~0,5 s depois de cada mudança)
await page.evaluate(() => localStorage.setItem('bolso:demo-latency', '700'));
const t0 = Date.now();
await page.reload(); await page.waitForSelector('.hero');
const withCache = Date.now() - t0;
check(`com rede lenta (700 ms/chamada) a tela abre pela cópia local (${withCache} ms)`, withCache < 600, String(withCache));
await page.evaluate(() => localStorage.setItem('bolso:demo-latency', '0'));
await page.waitForTimeout(1200);
const keys = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('bolso-cache'); r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('kv')) return res(0); const q = db.transaction('kv').objectStore('kv').count(); q.onsuccess = () => res(q.result); }; r.onerror = () => res(-1); }));
check('cópia local gravada', (await keys()) >= 1, String(await keys()));
await go('/mais');
await page.click('.item:has-text("Sair")');
await page.waitForLoadState('load'); await page.waitForTimeout(1500);
// no modo demo o app reabre sozinho (não há tela de login) e grava uma cópia VAZIA: o que importa é não sobrar dado antigo
const leftover = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('bolso-cache'); r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('kv')) return res(0); const q = db.transaction('kv').objectStore('kv').getAll(); q.onsuccess = () => res(q.result.reduce((n, d) => n + (d.transactions?.length ?? 0) + (d.accounts?.length ?? 0), 0)); }; r.onerror = () => res(-1); }));
check('sair da conta apaga os dados da cópia local (nenhum lançamento/conta sobra)', leftover === 0, `sobraram ${leftover} registros`);

// ── começar do zero (primeiro acesso, sem dados de exemplo)
const fresh = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' })).newPage();
fresh.on('pageerror', (e) => errors.push('fresh pageerror: ' + e.message));
fresh.on('console', (m) => m.type() === 'error' && errors.push('fresh console: ' + m.text()));
await fresh.goto(url);
await fresh.waitForSelector('.hero');
check('zero: mostra "Primeiros passos" com 3 etapas', await fresh.locator('.step').count() === 3);
await fresh.screenshot({ path: `${shots}/19-zero.png` });
await fresh.click('.step:has-text("Crie sua primeira conta")');
await fresh.fill('.sheet input[placeholder^="Ex.: Nubank"]', 'Itaú Conta');
await fresh.fill('.sheet input[inputmode="decimal"]', '1.500,00');
await fresh.click('.sheet .btn.primary');
await fresh.waitForSelector('.sheet', { state: 'detached' });
await fresh.waitForTimeout(800);
check('zero: conta criada e saldo refletido', (await fresh.locator('.hero').innerText()).includes('1.500'), await fresh.locator('.hero').innerText());
check('zero: etapa 1 marcada como concluída', await fresh.locator('.step.done').count() === 1);
// categorias padrão foram criadas → campo rápido funciona na hora
await fresh.fill('input[aria-label="Lançamento rápido"]', '200 mercado');
await fresh.press('input[aria-label="Lançamento rápido"]', 'Enter');
await fresh.waitForSelector('.toast:has-text("Alimentação")');
await fresh.waitForTimeout(800);
check('zero: categorias padrão e campo rápido', (await fresh.locator('.hero').innerText()).includes('1.300'), await fresh.locator('.hero').innerText());
// recorrência gera o lançamento do mês imediatamente
await fresh.evaluate(() => { history.pushState({}, '', '/recorrencias'); dispatchEvent(new PopStateEvent('popstate')); });
await fresh.click('button[aria-label="Nova recorrência"]');
await fresh.fill('.sheet input[placeholder^="Ex.: Aluguel"]', 'Academia');
await fresh.fill('.sheet input[placeholder="0,00"]', '99,90');
await fresh.fill('.sheet input[inputmode="numeric"]', '1');
await fresh.click('.sheet .btn.primary');
await fresh.waitForSelector('.sheet', { state: 'detached' });
await fresh.evaluate(() => { history.pushState({}, '', '/lancamentos'); dispatchEvent(new PopStateEvent('popstate')); });
await fresh.waitForSelector('.item:has-text("Academia")');
check('zero: recorrência gerou o lançamento do mês (pendente)', await fresh.locator('.item:has-text("Academia") .pay-btn').count() === 1);
await fresh.screenshot({ path: `${shots}/20-zero-lancamentos.png` });
// recarregar não duplica a recorrência
await fresh.reload(); // continua em /lancamentos
await fresh.waitForSelector('.item:has-text("Academia")');
check('zero: recarregar não duplica a recorrência', await fresh.locator('.item:has-text("Academia")').count() === 1);

check('sem erros no console', errors.length === 0, '\n' + errors.join('\n'));
await browser.close();
process.exit(failed ? 1 : 0);
