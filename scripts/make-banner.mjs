// Gera o banner do README (docs/img/banner-v4.png) a partir da logo e dos prints reais em docs/img.
// Uso: CHROMIUM_PATH=/caminho/do/chrome node scripts/make-banner.mjs
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const u = (p) => pathToFileURL(join(root, p)).href;
const W = 1600, H = 520;

const html = `<!doctype html><meta charset="utf-8">
<style>
@font-face { font-family: Inter; src: url('${u('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')}'); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
body { width: ${W}px; height: ${H}px; overflow: hidden; font-family: Inter, sans-serif; color: #fff; background: #0e0f11; position: relative; }
/* coluna de texto, centrada na vertical */
.copy { position: absolute; left: 88px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; }
.logo { width: 330px; display: block; }
h1 { margin-top: 38px; font-size: 56px; line-height: 1.1; letter-spacing: -0.035em; font-weight: 800; }
h1 span { display: block; color: #2a78d6; }
p { margin-top: 24px; font-size: 22px; line-height: 1.4; font-weight: 450; letter-spacing: -0.005em; color: #9ba1a9; }
/* celulares: o do meio é o protagonista; os laterais ficam atrás e mais perto */
.phone { position: absolute; border-radius: 36px; background: #000; border: 5px solid #2b2f35; overflow: hidden;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.09), 0 22px 44px rgba(0,0,0,0.42); }
.phone img { display: block; width: 100%; }
.side { width: 212px; height: 418px; top: 76px; }
.mid { width: 234px; height: 460px; top: 30px; z-index: 3; border-radius: 40px; }
.left { left: 938px; transform: rotate(-4deg); z-index: 1; }
.mid { left: 1110px; }
.right { left: 1304px; transform: rotate(4deg); z-index: 2; }
</style>
<div class="copy">
  <img class="logo" src="${u('public/logo-white.png')}">
  <h1>Seu dinheiro sob controle.<span>Sua vida financeira em dia.</span></h1>
  <p>Finanças pessoais simples, privadas e gratuitas.</p>
</div>
<div class="phone side left"><img src="${u('docs/img/orcamento-dark.png')}"></div>
<div class="phone mid"><img src="${u('docs/img/inicio-dark.png')}"></div>
<div class="phone side right"><img src="${u('docs/img/cartao-dark.png')}"></div>`;

const dir = mkdtempSync(join(tmpdir(), 'bolso-banner-'));
const file = join(dir, 'banner.html');
writeFileSync(file, html);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--allow-file-access-from-files'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })).newPage();
await page.goto(pathToFileURL(file).href);
await page.waitForTimeout(800);
await page.screenshot({ path: join(root, 'docs/img/banner-v4.png') });
await browser.close();
console.log('docs/img/banner-v4.png gerado');
