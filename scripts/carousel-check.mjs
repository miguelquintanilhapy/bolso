// Confere o carrossel de contas: cartões chegam até a borda da tela ao rolar e o 1º alinha com o conteúdo.
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
const [url = 'http://localhost:4173'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto(`${url}/?demo`); await page.waitForSelector('.carousel .acc-card'); await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelector('.carousel').scrollIntoView({ block: 'center' })); await page.waitForTimeout(500);
let failed = 0;
const check = (n, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', n, ok ? '' : extra); if (!ok) failed++; };
const pixel = async (x, y) => { const png = PNG.sync.read(await page.screenshot()); const i = (png.width * y + x) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
const same = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 12;

const first = await page.locator('.carousel .acc-card').first().boundingBox();
check('1º cartão alinhado com o conteúdo (16px da borda)', Math.abs(first.x - 16) <= 1, `x = ${first.x}`);
// rola o carrossel um pouco: o cartão que sai deve ir até a borda da tela, sem cortar a 16px
// encaixe desligado só aqui: simula o meio de um arrasto, com o cartão saindo pela esquerda
await page.locator('.carousel').evaluate((e) => { e.style.scrollSnapType = 'none'; e.scrollTo({ left: 120, behavior: 'instant' }); }); await page.waitForTimeout(200);
const row = await page.locator('.carousel .acc-card').first().boundingBox();
const y = Math.round(row.y + row.height / 2);
const bg = await pixel(200, 3);
const edge = await pixel(3, y);
check('cartão que sai da tela não é cortado a 16px da borda', !same(edge, bg), `pixel em x=3 é a cor de fundo ${edge}`);
await page.locator('.carousel').evaluate((e) => { e.style.scrollSnapType = ''; e.scrollTo({ left: 0, behavior: 'instant' }); }); await page.waitForTimeout(300);
// depois do "encaixe", o cartão seguinte também alinha com o conteúdo
await page.locator('.carousel').evaluate((e) => e.scrollTo({ left: e.querySelector('.acc-card').offsetWidth + 12, behavior: 'smooth' })); await page.waitForTimeout(900);
const cards = await page.locator('.carousel .acc-card').all();
if (cards.length > 1) { const b = await cards[1].boundingBox(); check('2º cartão encaixa a 16px da borda (igual ao 1º)', Math.abs(b.x - 16) <= 2, `x = ${b.x}`); }
await browser.close();
process.exit(failed ? 1 : 0);
