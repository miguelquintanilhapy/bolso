// aplica o tema salvo antes da primeira pintura (evita piscar); arquivo externo para a política de segurança (CSP) dispensar script inline
try {
  var t = localStorage.getItem('bolso:theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) {}

// ícone da tela de início: quem adiciona o app com o aparelho em modo escuro recebe a versão escura (carteira branca no fundo preto);
// em modo claro continua o ícone claro de sempre. O iOS lê este ícone no momento de "Adicionar à Tela de Início".
try {
  var mq = matchMedia('(prefers-color-scheme: dark)');
  var setIcon = function () {
    var l = document.querySelector('link[rel="apple-touch-icon"]');
    if (l) l.setAttribute('href', mq.matches ? '/apple-touch-icon-dark.png' : '/apple-touch-icon.png');
  };
  setIcon();
  if (mq.addEventListener) mq.addEventListener('change', setIcon);
} catch (e) {}
