const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const num = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const formatBRL = (n: number) => brl.format(round2(n)).replace(/ /g, ' ');
/** Parte inteira e centavos separados, para destacar a parte inteira (R$ 1.234 + ,56). */
export const splitBRL = (n: number) => {
  const v = round2(Math.abs(n));
  const [int, cents] = num.format(v).split(',');
  return { sign: n < 0 ? '-' : '', int: `R$ ${int}`, cents: `,${cents}` };
};
export const compactBRL = (n: number) => {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(1).replace('.', ',')} mi`;
  if (a >= 1_000) return `${sign}${(a / 1_000).toFixed(a >= 10_000 ? 0 : 1).replace('.', ',')} mil`;
  return `${sign}${Math.round(a)}`;
};

/** Interpreta "1.200,50", "23,90", "R$ 15", "1200.5". Retorna null se não for valor. */
export function parseAmount(raw: string): number | null {
  let t = raw.trim().replace(/^r\$\s*/i, '').replace(/^[+-]/, '');
  if (!/^\d[\d.,]*$/.test(t)) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = parseFloat(t);
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
}
