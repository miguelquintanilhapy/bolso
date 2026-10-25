// Splash animada do Bolso. Requer bolso-splash.css carregado.
//
//   import { showBolsoSplash } from './bolso-splash.js';
//   await showBolsoSplash();            // resolve quando a splash some
//   await showBolsoSplash({ logo: '/logo.png' });

// Caixas de cada letra de "Bolso" no logo.png (932x322): [x0, x1]
const LETTERS = [[331, 463], [471, 603], [616, 648], [660, 766], [774, 907]];

const WALLET_SVG = `
<svg viewBox="362 335 550 633" aria-hidden="true">
  <path d="M 362 660 L 362 562 C 362 512 384 478 418 464
           L 726 342 C 796 318 836 362 845 432
           L 436 566 C 426 569 424 573 426 580 L 440 660 Z" />
  <path d="M 362 612 L 422 574
           C 428 596 450 610 470 604 L 820 500
           C 870 488 912 522 912 580 L 912 622 L 836 622
           A 99 99 0 0 0 836 820 L 912 820 L 912 850
           C 912 924 856 974 784 964 L 432 880
           C 390 868 362 836 362 796 Z" />
  <circle class="bs-dot" cx="835" cy="722" r="46" />
</svg>`;

export function showBolsoSplash({ logo = '/logo.png', parent = document.body } = {}) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'bs-splash';
    root.setAttribute('role', 'img');
    root.setAttribute('aria-label', 'Bolso');
    root.innerHTML = `
      <div class="bs-lockup">
        <div class="bs-icon"><div class="bs-mark">${WALLET_SVG}</div></div>
        <div class="bs-word"></div>
      </div>`;

    const word = root.querySelector('.bs-word');
    LETTERS.forEach(([x0, x1], i) => {
      const left = x0 - 3, width = x1 - x0 + 7;
      const clip = document.createElement('div');
      clip.className = 'bs-clip';
      clip.style.left = `calc(var(--bs-u) * ${left - 24})`;
      clip.style.width = `calc(var(--bs-u) * ${width})`;
      const g = document.createElement('div');
      g.className = 'bs-glyph';
      g.style.setProperty('--i', i);
      const pos = `calc(var(--bs-u) * ${-left}) calc(var(--bs-u) * -66)`;
      g.style.webkitMaskImage = g.style.maskImage = `url("${logo}")`;
      g.style.webkitMaskPosition = g.style.maskPosition = pos;
      clip.appendChild(g);
      word.appendChild(clip);
    });

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      root.remove();
      resolve();
    };
    root.addEventListener('animationend', (e) => {
      if (e.target === root) finish();
    });
    // garantia: se a aba estiver em segundo plano as animações pausam,
    // então nunca deixa a splash travar o app
    setTimeout(finish, 4500);
    parent.appendChild(root);

    // espera o logo carregar pra não "piscar" as letras
    const img = new Image();
    img.onload = img.onerror = () => root.classList.add('bs-play');
    img.src = logo;
  });
}
