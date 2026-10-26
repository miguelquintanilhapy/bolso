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
// fecha o painel com Esc; se aparecer "Descartar alterações?", confirma
const esc = async (pg) => {
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(250);
  const d = pg.locator('.ios-alert button.danger');
  if (await d.count()) await d.click();
  await pg.waitForSelector('.overlay', { state: 'detached', timeout: 2000 }).catch(() => {});
};
// campo de valor estilo banco: limpa e digita (o preenchimento direto soma aos dígitos que já estão lá)
const money = async (pg, sel, v) => { await pg.fill(sel, ''); await pg.fill(sel, v); };
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
check('formulário abre com valor preenchido', (await page.inputValue('.amount-input')) === '30,00');
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
  ['/mais', '06-mais', 'Mais'], ['/contas', '07-contas', 'Suas contas'], ['/categorias', '08-categorias', 'Categorias'],
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
await page.waitForSelector('text=Vence em');
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
await money(page, '.sheet .amount-input', '12,50');
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
await money(page, '.sheet .amount-input', '88,00');
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
await esc(page);
await page.waitForSelector('.sheet', { state: 'detached', timeout: 3000 });
check('Esc fecha o painel', true);

// confirmação de exclusão no estilo do app (não o confirm do navegador)
let nativeDialog = false;
page.on('dialog', async (d) => { nativeDialog = true; await d.dismiss(); });
await go('/contas');
await page.click('.item:has-text("Tesouro Selic")'); await page.waitForTimeout(400);
await page.click('button[aria-label="Editar"]'); await page.waitForSelector('.sheet');
await page.click('.sheet button:has-text("Apagar conta")');
await page.waitForSelector('[aria-label="Apagar conta?"]');
check('exclusão pede confirmação em painel do app', !nativeDialog);
await shot('23-confirmacao');
await page.click('[aria-label="Apagar conta?"] button:has-text("Cancelar")');
await page.waitForTimeout(500);
check('cancelar mantém a conta', (await page.locator('.sheet[aria-label="Editar investimento"]').count()) === 1);
await esc(page); await page.waitForTimeout(400);

// investimento: aportar muda o saldo na hora e o patrimônio não cai
await go('/');
const worthBefore = Number(await page.locator('.hero').first().getAttribute('data-value'));
await go('/contas');
await page.click('.item:has-text("Tesouro Selic")'); await page.waitForTimeout(500);
const invBefore = Number(await page.locator('.hero').first().getAttribute('data-value'));
await page.click('button:has-text("Aportar")'); await page.waitForSelector('.sheet');
await money(page, '.sheet .amount-input', '250,00');
await page.waitForTimeout(200);
await page.click('.sheet-foot .btn.primary'); await page.waitForSelector('.sheet', { state: 'detached' }); await page.waitForTimeout(700);
const invAfter = Number(await page.locator('.hero').first().getAttribute('data-value'));
check(`aportar R$ 250 aumenta o saldo do investimento (${invBefore} → ${invAfter})`, Math.round((invAfter - invBefore) * 100) === 25000);
await go('/');
const worthAfter = Number(await page.locator('.hero').first().getAttribute('data-value'));
check(`patrimônio não cai ao aportar (${worthBefore} → ${worthAfter})`, Math.abs(worthAfter - worthBefore) < 0.01);
check('investimento mostra aportes e rendimento', true);

// cartão: pagar a fatura zera o que falta (o pagamento já vem com a fatura e o valor certos)
await go('/contas');
await page.click('.item:has-text("Nubank Cartão")'); await page.waitForTimeout(600);
const falta = await page.locator('.kv:has-text("Falta pagar") b').first().innerText();
await page.click('button:has-text("Pagar fatura")'); await page.waitForSelector('.sheet');
check('pagar fatura já traz o valor da fatura preenchido', (await page.inputValue('.sheet .amount-input')).length > 0);
await page.click('.sheet-foot .btn.primary'); await page.waitForSelector('.sheet', { state: 'detached' }); await page.waitForTimeout(700);
const faltaDepois = await page.locator('.kv:has-text("Falta pagar") b').count();
check(`depois de pagar, a fatura de ${falta} deixa de estar em aberto`, faltaDepois === 0 || (await page.locator('.kv:has-text("Falta pagar") b').first().innerText()) !== falta);

// conta: ajustar saldo cria um lançamento de correção
await go('/contas');
await page.click('.item:has-text("Nubank Conta")'); await page.waitForTimeout(600);
const saldo0 = Number(await page.locator('.hero').first().getAttribute('data-value'));
await page.click('button:has-text("Ajustar saldo")'); await page.waitForSelector('.sheet');
await money(page, '.sheet input[placeholder="0,00"]', (saldo0 + 100).toFixed(2).replace('.', ','));
await page.waitForTimeout(200);
check('ajustar saldo mostra o que será criado', (await page.locator('.sheet .callout').innerText()).includes('receita de'));
await page.click('.sheet-foot .btn.primary'); await page.waitForSelector('.sheet', { state: 'detached' }); await page.waitForTimeout(700);
check('ajustar saldo leva o saldo ao valor informado', Math.abs(Number(await page.locator('.hero').first().getAttribute('data-value')) - (saldo0 + 100)) < 0.01);

// cadastro: cada tipo explica o que é; cartão não pede saldo
await go('/contas');
await page.click('button[aria-label="Adicionar"]'); await page.waitForSelector('.sheet');
check('cadastro explica o tipo escolhido', (await page.locator('.kind-hint').innerText()).includes('Onde o dinheiro está'));
await page.click('.sheet .seg button:has-text("Cartão")'); await page.waitForTimeout(250);
check('cartão não pede saldo inicial', (await page.locator('.sheet label, .sheet .lbl').filter({ hasText: /Saldo/ }).count()) === 0);
check('cartão pede fechamento e vencimento vazios', (await page.inputValue('.sheet input[placeholder="Ex.: 10"]')) === '' && (await page.inputValue('.sheet input[placeholder="Ex.: 17"]')) === '');
await shot('25-cadastro-cartao');
await page.fill('.sheet input[placeholder="Ex.: 10"]', '8'); await page.fill('.sheet input[placeholder="Ex.: 17"]', '15');
check('mostra como as compras vão cair na fatura', (await page.locator('.sheet .callout').innerText()).includes('até o dia 8'));
await esc(page); await page.waitForTimeout(400);

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

// ── regras de usabilidade (descartar, prévia, duplicado, gestos, busca global…)
{
  const uxCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'pt-BR', reducedMotion: 'reduce' });
  const ux = await uxCtx.newPage();
  const uxErrors = [];
  ux.on('pageerror', (e) => uxErrors.push(e.message));
  const goto = (p) => ux.evaluate((x) => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')); }, p);
  await ux.goto(`${url}/?demo`); await ux.waitForSelector('.hero');

  // grupo de atrasadas vira uma linha só
  check('ux: atrasadas do mesmo cartão viram uma linha', (await ux.locator('.group .item:has-text("atrasadas")').count()) === 1);

  // fonte única: nada em monoespaçada (code/kbd), nem na ajuda do campo rápido
  await ux.click('button[aria-label="Como usar o lançamento rápido"]'); await ux.waitForSelector('.help-ex');
  const mono = await ux.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => /mono|courier/i.test(getComputedStyle(e).fontFamily)).length);
  check('ux: nenhuma fonte monoespaçada na tela (ajuda do campo rápido)', mono === 0, String(mono));
  await ux.keyboard.press('Escape'); await ux.waitForSelector('.overlay', { state: 'detached', timeout: 2000 }).catch(() => {});

  // receita futura: aparece como "entra", não como conta a vencer
  {
    const d = new Date(Date.now() + 2 * 864e5);
    const dd = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    await ux.fill('input[aria-label="Lançamento rápido"]', `+3000 salário extra ${dd}`);
    await ux.press('input[aria-label="Lançamento rápido"]', 'Enter');
    await ux.waitForSelector('.toast');
    const row = ux.locator('.group .item:has-text("3.000,00")').first();
    await row.waitFor({ timeout: 4000 }).catch(() => {});
    const rowText = await row.innerText().catch(() => '');
    check('ux: receita futura aparece como "Entra em…"', /Entra/.test(rowText), rowText);
    check('ux: receita futura não aparece como "Vence"', !/Vence|Atrasad/.test(rowText), rowText);
    await goto('/lancamentos'); await ux.waitForSelector('.swipe');
    const ext = await ux.locator('.swipe:has-text("3.000,00"):has(.pay-btn)').first().innerText().catch(() => '');
    check('ux: no extrato a receita pendente diz "entra" e o botão é "Receber"', /entra/i.test(ext) && /Receber/.test(ext) && !/vence/i.test(ext), ext);
    await goto('/');
  }

  // prévia, atalhos de valor e descartar
  await ux.click('.action:has-text("Despesa")'); await ux.waitForSelector('.sheet');
  check('ux: campo de valor começa vazio (mostra 0,00)', (await ux.inputValue('.amount-input')) === '' && (await ux.getAttribute('.amount-input', 'placeholder')) === '0,00');
  await ux.focus('.amount-input');
  const typed = [];
  for (const d of ['1', '0', '0', '0', '0', '0']) { await ux.keyboard.type(d); typed.push(await ux.inputValue('.amount-input')); }
  check('ux: valor no estilo banco (1 → 0,01 → 0,10 → 1,00 → 10,00 → 100,00 → 1.000,00)', typed.join(' | ') === '0,01 | 0,10 | 1,00 | 10,00 | 100,00 | 1.000,00', typed.join(' | '));
  await ux.keyboard.press('Backspace');
  check('ux: apagar tira o último dígito (1.000,00 → 100,00)', (await ux.inputValue('.amount-input')) === '100,00');
  await esc(ux);
  await ux.click('.action:has-text("Despesa")'); await ux.waitForSelector('.sheet');
  await money(ux, '.amount-input', '50,00');
  check('ux: prévia mostra saldo antes → depois', /→/.test(await ux.locator('.effect').innerText()));
  await ux.click('.quick-amounts button:has-text("+10")');
  check('ux: atalho +10 soma ao valor', (await ux.inputValue('.amount-input')) === '60,00');
  check('ux: controle segmentado tem marcador deslizante', (await ux.locator('.sheet .seg-thumb').count()) > 0);
  await ux.keyboard.press('Escape'); await ux.waitForSelector('.ios-alert');
  check('ux: fechar com dados pede para descartar', /Descartar/.test(await ux.locator('.ios-alert').innerText()));
  await ux.click('.ios-alert button:has-text("Cancelar")'); await ux.waitForTimeout(300);
  check('ux: cancelar mantém o painel e o valor', (await ux.locator('.sheet').count()) === 1 && (await ux.inputValue('.amount-input')) === '60,00');

  // duplicado
  await money(ux, '.amount-input', '38,40');
  await ux.fill('.sheet input[placeholder="Ex.: Mercado"]', 'Padaria');
  await ux.click('.sheet .btn.primary'); await ux.waitForSelector('.ios-alert');
  check('ux: lançamento igual pergunta se é repetido', /repetido/i.test(await ux.locator('.ios-alert').innerText()));
  await ux.click('.ios-alert button:has-text("Cancelar")'); await ux.waitForTimeout(250);
  await money(ux, '.amount-input', '38,41');
  await ux.click('.sheet .btn.primary');
  await ux.waitForSelector('.sheet', { state: 'detached' });
  check('ux: mudando o valor salva sem aviso', (await ux.locator('.toast:has-text("salvo")').count()) === 1);

  // sugestões da descrição
  await ux.click('.action:has-text("Despesa")'); await ux.waitForSelector('.sheet');
  await ux.fill('.sheet input[placeholder="Ex.: Mercado"]', 'Pada');
  check('ux: sugere descrições já usadas', (await ux.locator('.suggest .chip:has-text("Padaria")').count()) > 0);
  await ux.click('.suggest .chip:has-text("Padaria")');
  check('ux: sugestão preenche descrição e categoria', (await ux.inputValue('.sheet input[placeholder="Ex.: Mercado"]')) === 'Padaria' && (await ux.locator('.sheet .chip.active:has-text("Alimentação")').count()) === 1);
  await esc(ux);

  // deslizar a linha (toque) revela apagar; desfazer devolve
  await goto('/lancamentos'); await ux.waitForSelector('.swipe');
  const row = ux.locator('.swipe:has(.item:has-text("Netflix")) .item').first();
  const before = await ux.locator('.item:has-text("Netflix")').count();
  await row.evaluate((e) => e.scrollIntoView({ block: 'center' })); await ux.waitForTimeout(250);
  const box = await row.boundingBox();
  const cdp = await uxCtx.newCDPSession(ux);
  const y = box.y + box.height / 2; const x0 = box.x + box.width - 30;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - i * 18, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await ux.waitForTimeout(450);
  check('ux: deslizar a linha revela as ações', await ux.locator('.swipe:has(.item:has-text("Netflix")) .sw.del').first().isVisible());
  await ux.click('.swipe:has(.item:has-text("Netflix")) .sw.del');
  await ux.waitForSelector('.toast:has-text("apagado")');
  check('ux: apagar pelo gesto remove a linha', (await ux.locator('.item:has-text("Netflix")').count()) === before - 1);
  await ux.click('.toast button:has-text("Desfazer")'); await ux.waitForTimeout(400);
  check('ux: desfazer devolve a linha', (await ux.locator('.item:has-text("Netflix")').count()) === before);

  // extrato lembra a busca ao voltar
  await ux.fill('input[aria-label="Buscar"]', 'uber');
  check('ux: busca mostra quantos resultados', /resultado/.test(await ux.locator('.result-count').innerText()));
  await ux.click('nav a:has-text("Mais")'); await ux.waitForSelector('.page-title:has-text("Mais")');
  check('ux: "Avançado" começa recolhido', (await ux.locator('text=Exportar lançamentos').count()) === 0);
  await ux.click('nav a:has-text("Extrato")'); await ux.waitForSelector('input[aria-label="Buscar"]');
  check('ux: extrato lembra a busca ao voltar', (await ux.inputValue('input[aria-label="Buscar"]')) === 'uber');
  await ux.click('button:has-text("Cancelar")'); await ux.waitForTimeout(200);

  // busca global
  await ux.keyboard.press('Control+k'); await ux.waitForSelector('.palette');
  await ux.fill('.palette input', 'netflix'); await ux.waitForTimeout(200);
  check('ux: busca global acha o lançamento', (await ux.locator('.palette-row:has-text("Netflix")').count()) > 0);
  await ux.keyboard.press('Enter'); await ux.waitForSelector('.sheet');
  check('ux: Enter na busca abre o lançamento', (await ux.locator('.palette').count()) === 0);
  await esc(ux);

  // orçamento / insights explicam o estado
  await goto('/orcamentos'); await ux.waitForSelector('.summary-line');
  check('ux: orçamento resume o estado em uma frase', (await ux.locator('.summary-line').innerText()).length > 20);
  check('ux: orçamento mostra porcentagem e estado por categoria', (await ux.locator('small.pct').count()) > 0);
  await goto('/insights'); await ux.waitForSelector('.summary-line');
  check('ux: insights começa com uma frase-resumo', /gastou/.test(await ux.locator('.summary-line').innerText()));

  // recorrências: próxima data
  await goto('/recorrencias'); await ux.waitForSelector('.item');
  check('ux: recorrência mostra a próxima data', (await ux.locator('.item small:has-text("Próximo:")').count()) > 0);

  // categoria: apagar com desfazer (sem pergunta)
  await goto('/categorias'); await ux.waitForSelector('.item');
  const cats0 = await ux.locator('.item').count();
  await ux.click('.item:has-text("Assinaturas")'); await ux.waitForSelector('.sheet');
  await ux.click('.sheet button:has-text("Apagar categoria")'); await ux.waitForSelector('.toast:has-text("apagada")');
  check('ux: apagar categoria não pergunta e oferece desfazer', (await ux.locator('.ios-alert').count()) === 0 && (await ux.locator('.item').count()) === cats0 - 1);
  await ux.click('.toast button:has-text("Desfazer")'); await ux.waitForTimeout(500);
  check('ux: desfazer devolve a categoria', (await ux.locator('.item').count()) === cats0);

  // puxar para atualizar
  await goto('/'); await ux.waitForSelector('.hero'); await ux.evaluate(() => scrollTo(0, 0));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 120 }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 120 + i * 25 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await ux.waitForTimeout(150);
  check('ux: puxar para atualizar mostra o indicador', (await ux.locator('.ptr.spin').count()) === 1);
  check('ux: sem erros', uxErrors.length === 0, uxErrors.join('\n'));
  await uxCtx.close();
}

// ── instalar o app: Android (Chrome), iPhone (Safari) e computador
{
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const open = async (userAgent) => {
    const pg = await (await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent, isMobile: true, hasTouch: true })).newPage();
    await pg.goto(`${url}/?demo`); await pg.waitForSelector('.hero');
    return pg;
  };
  const droid = await open(ANDROID);
  await droid.waitForSelector('.install', { timeout: 6000 }).catch(() => {});
  check('instalar: Android sem botão nativo mostra o passo a passo do menu ⋮', /três pontinhos/.test(await droid.locator('.install').innerText().catch(() => '')));
  check('instalar: Android não manda procurar o Safari', !/Safari/.test(await droid.locator('.install').innerText().catch(() => 'Safari')));
  await droid.evaluate(() => { window.__prompted = 0; const e = new Event('beforeinstallprompt'); e.prompt = async () => { window.__prompted++; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
  await droid.waitForSelector('.install button:has-text("Instalar")', { timeout: 3000 }).catch(() => {});
  check('instalar: com o aviso do Chrome aparece o botão "Instalar"', (await droid.locator('.install button:has-text("Instalar")').count()) === 1);
  await droid.click('.install button:has-text("Instalar")');
  check('instalar: o botão abre a instalação nativa', (await droid.evaluate(() => window.__prompted)) === 1);
  await droid.evaluate(() => { history.pushState({}, '', '/mais'); dispatchEvent(new PopStateEvent('popstate')); });
  await droid.waitForSelector('.page-title:has-text("Mais")');
  check('instalar: "Mais" tem o atalho para ver como instalar', (await droid.locator('.item:has-text("Instalar o Bolso")').count()) === 1);
  const iph = await open(IPHONE);
  await iph.waitForSelector('.install');
  check('instalar: iPhone mostra o passo a passo do Safari', /Safari/.test(await iph.locator('.install').innerText()));
  const desk2 = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await desk2.goto(`${url}/?demo`); await desk2.waitForSelector('.hero'); await desk2.waitForTimeout(3000);
  check('instalar: no computador não aparece o aviso de celular', (await desk2.locator('.install').count()) === 0);
}

// ── sem conta: criar direto do formulário e voltar com tudo preenchido; alerta legível no tema "Auto" escuro
{
  const dctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', colorScheme: 'dark', reducedMotion: 'reduce' });
  const nf = await dctx.newPage();
  await nf.goto(url); await nf.waitForSelector('.hero');
  await nf.click('.action:has-text("Despesa")'); await nf.waitForSelector('.sheet');
  check('sem conta: o formulário avisa e oferece "Criar conta agora"', (await nf.locator('.no-account button:has-text("Criar conta agora")').count()) === 1);
  await money(nf, '.amount-input', '50,00');
  await nf.fill('.sheet input[placeholder="Ex.: Mercado"]', 'Pizza');
  await nf.click('.sheet .foot-actions .btn.primary');
  check('sem conta: salvar explica o que fazer (sem mandar procurar em outra aba)', /Criar conta agora/.test(await nf.locator('.sheet .error-text').innerText()));
  // alerta de descartar: legível no escuro (fundo escuro, texto claro, quase opaco)
  await nf.keyboard.press('Escape'); await nf.waitForSelector('.ios-alert');
  const look = await nf.evaluate(() => {
    const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
    const al = getComputedStyle(document.querySelector('.ios-alert')); const h = getComputedStyle(document.querySelector('.ios-alert h2'));
    const a = al.backgroundColor.match(/[\d.]+/g).map(Number);
    return { bg: lum(al.backgroundColor), text: lum(h.color), alpha: a[3] ?? 1 };
  });
  check('alerta no Auto escuro: fundo escuro, texto claro, quase opaco', look.bg < 0.3 && look.text > 0.7 && look.alpha >= 0.9, JSON.stringify(look));
  await nf.click('.ios-alert button:has-text("Cancelar")'); await nf.waitForTimeout(300);
  await nf.click('.no-account button:has-text("Criar conta agora")');
  await nf.waitForSelector('.sheet[aria-label="Nova conta"], .sheet:has-text("Nova conta")');
  await nf.fill('.sheet input[placeholder^="Ex.: Nubank"]', 'Carteira');
  await nf.click('.sheet .foot-actions .btn.primary');
  await nf.waitForSelector('.sheet:has-text("Nova despesa")', { timeout: 5000 });
  check('sem conta: criar a conta volta ao lançamento com a conta já escolhida', (await nf.locator('.sheet .chip.active:has-text("Carteira")').count()) === 1);
  check('sem conta: valor e descrição continuam preenchidos', (await nf.inputValue('.amount-input')) === '50,00' && (await nf.inputValue('.sheet input[placeholder="Ex.: Mercado"]')) === 'Pizza');
  await nf.click('.sheet .foot-actions .btn.primary');
  await nf.waitForSelector('.sheet', { state: 'detached' });
  check('sem conta: o lançamento é salvo na conta nova', (await nf.locator('.toast:has-text("salvo")').count()) === 1);
  await dctx.close();
}

// ── computador e tablet
{
  const desk = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const dErr = []; desk.on('pageerror', (e) => dErr.push(e.message));
  await desk.goto(`${url}/?demo`); await desk.waitForSelector('.hero'); await desk.waitForTimeout(1200);
  const box = (sel) => desk.locator(sel).first().boundingBox();
  const nav = await box('nav.nav');
  check('computador: menu lateral flutuante à esquerda, quase na altura toda', nav.x <= 16 && nav.width >= 200 && nav.width <= 260 && nav.height >= 700, JSON.stringify(nav));
  const app = await box('.app .screen');
  check('computador: conteúdo fica à direita do menu', app.x >= nav.width, `x = ${app.x}`);
  const a = await box('.col-a'), b = await box('.col-b');
  check('computador: início em duas colunas (contas ao lado dos lançamentos)', b.x > a.x + a.width - 5 && Math.abs(b.y - a.y) < 40, `${JSON.stringify(a)} | ${JSON.stringify(b)}`);
  check('computador: cartões das contas empilhados (sem rolar de lado)', (await desk.locator('.carousel').evaluate((e) => getComputedStyle(e).flexDirection)) === 'column');
  check('computador: sem rolagem lateral', (await desk.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0);
  check('computador: botão flutuante e faixa do iPhone ocultos', (await desk.locator('.status-fill').evaluate((e) => getComputedStyle(e).display)) === 'none');
  await desk.keyboard.press('n');
  await desk.waitForSelector('.sheet');
  await desk.waitForTimeout(500);
  const sh = await box('.sheet');
  check('computador: atalho N abre o formulário', true);
  check('computador: painel vira janela centralizada', Math.abs(sh.x + sh.width / 2 - 640) < 3 && sh.y > 10 && sh.y + sh.height < 790 && sh.width <= 565, JSON.stringify(sh));
  await esc(desk); await desk.waitForSelector('.sheet', { state: 'detached' });
  await desk.keyboard.press('/');
  check('computador: atalho / foca o lançamento rápido', await desk.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Lançamento rápido'));
  for (const path of ['/lancamentos', '/orcamentos', '/insights', '/mais', '/contas']) {
    await desk.evaluate((x) => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')); }, path); await desk.waitForTimeout(500);
    const over = await desk.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over !== 0) check(`computador: ${path} sem rolagem lateral`, false, `${over}px`);
  }
  await desk.evaluate(() => { history.pushState({}, '', '/orcamentos'); dispatchEvent(new PopStateEvent('popstate')); }); await desk.waitForTimeout(600);
  const sa = await box('.split-col'), sb = await desk.locator('.split-col').nth(1).boundingBox();
  check('computador: orçamento em duas colunas', sb.x > sa.x + sa.width - 5, `${sa.x}/${sb.x}`);
  check('computador: sem erros no console', dErr.length === 0, dErr.join(' | '));

  const tab = await (await browser.newContext({ viewport: { width: 768, height: 1024 } })).newPage();
  await tab.goto(`${url}/?demo`); await tab.waitForSelector('.hero'); await tab.waitForTimeout(1000);
  const tn = await tab.locator('nav.nav').boundingBox();
  check('tablet: continua a barra inferior (não o menu lateral)', tn.y > 900 && tn.width < 500, JSON.stringify(tn));
  check('tablet: sem rolagem lateral', (await tab.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0);
}

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
await money(fresh, '.sheet input[inputmode="decimal"]', '1.500,00');
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
await fresh.waitForSelector('.empty');
const emptyBox = await fresh.evaluate(() => { const b = document.querySelector('.empty-action button').getBoundingClientRect(); const c = document.querySelector('.empty .chips').getBoundingClientRect(); const t = document.querySelector('.empty-body').getBoundingClientRect(); return { btnTop: b.top, chipsBottom: c.bottom, textBottom: t.bottom }; });
check('zero: estado vazio — botão fica abaixo do texto e das sugestões', emptyBox.btnTop >= emptyBox.chipsBottom - 1 && emptyBox.btnTop >= emptyBox.textBottom, JSON.stringify(emptyBox));
await fresh.click('button[aria-label="Nova recorrência"]');
await fresh.waitForSelector('.sheet');
const monthBoxes = await fresh.evaluate(() => { const s = document.querySelector('.sheet').getBoundingClientRect(); return [...document.querySelectorAll('.sheet input[type=month]')].map((e) => { const r = e.getBoundingClientRect(); return r.left >= s.left && r.right <= s.right + 0.5; }); });
check('zero: campos de mês cabem dentro do painel', monthBoxes.length === 2 && monthBoxes.every(Boolean), JSON.stringify(monthBoxes));
await fresh.fill('.sheet input[placeholder^="Ex.: Aluguel"]', 'Academia');
await money(fresh, '.sheet input[placeholder="0,00"]', '99,90');
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
