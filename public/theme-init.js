// aplica o tema salvo antes da primeira pintura (evita piscar); arquivo externo para a política de segurança (CSP) dispensar script inline
try {
  var t = localStorage.getItem('bolso:theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) {}

