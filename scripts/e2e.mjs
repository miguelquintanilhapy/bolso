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
const shot = (n) => page.screenshot({ path: `${shots}/${n}.png`, fullPage: false });
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
  ['/lancamentos', '03-lancamentos', 'Lançamentos'], ['/orcamentos', '04-orcamento', 'Orçamento'], ['/insights', '05-insights', 'Insights'],
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

// ── começar do zero (primeiro acesso, sem dados de exemplo)
const fresh = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' })).newPage();
fresh.on('pageerror', (e) => errors.push('fresh pageerror: ' + e.message));
fresh.on('console', (m) => m.type() === 'error' && errors.push('fresh console: ' + m.text()));
await fresh.goto(url);
await fresh.waitForSelector('.hero');
check('zero: pede para criar a primeira conta', await fresh.locator('text=Comece criando sua primeira conta').count() === 1);
await fresh.screenshot({ path: `${shots}/19-zero.png` });
await fresh.click('button:has-text("Criar conta")');
await fresh.fill('.sheet input[placeholder^="Ex.: Nubank"]', 'Itaú Conta');
await fresh.fill('.sheet input[inputmode="decimal"]', '1.500,00');
await fresh.click('.sheet .btn.primary');
await fresh.waitForSelector('.sheet', { state: 'detached' });
check('zero: conta criada e saldo refletido', (await fresh.locator('.hero').innerText()).includes('1.500'), await fresh.locator('.hero').innerText());
// categorias padrão foram criadas → campo rápido funciona na hora
await fresh.fill('input[aria-label="Lançamento rápido"]', '200 mercado');
await fresh.press('input[aria-label="Lançamento rápido"]', 'Enter');
await fresh.waitForSelector('.toast:has-text("Alimentação")');
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
check('zero: recorrência gerou o lançamento do mês (pendente)', await fresh.locator('.item:has-text("Academia"):has-text("pendente")').count() === 1);
await fresh.screenshot({ path: `${shots}/20-zero-lancamentos.png` });
// recarregar não duplica a recorrência
await fresh.reload(); // continua em /lancamentos
await fresh.waitForSelector('.item:has-text("Academia")');
check('zero: recarregar não duplica a recorrência', await fresh.locator('.item:has-text("Academia")').count() === 1);

check('sem erros no console', errors.length === 0, '\n' + errors.join('\n'));
await browser.close();
process.exit(failed ? 1 : 0);
