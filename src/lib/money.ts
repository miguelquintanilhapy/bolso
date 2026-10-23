const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const num = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const formatBRL = (n: number) => brl.format(round2(n) + 0).replace(/\u00a0/g, ' '); // + 0 troca -0 por 0: nunca mostra "-R$ 0,00"
/** Parte inteira e centavos separados, para destacar a parte inteira (R$ 1.234 + ,56). */
export const splitBRL = (n: number) => {
  const v = round2(Math.abs(n));
  const [int, cents] = num.format(v).split(',');
  return { sign: n < 0 && v !== 0 ? '-' : '', int: `R$ ${int}`, cents: `,${cents}` };
};
export const compactBRL = (n: number) => {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const thousands = a >= 10_000 ? Math.round(a / 1000) : Math.round(a / 100) / 10;
  if (a >= 1_000_000 || thousands >= 1000) return `${sign}${(a / 1_000_000).toFixed(1).replace('.', ',')} mi`;
  if (a >= 1_000) return `${sign}${String(thousands).replace('.', ',')} mil`;
  return `${sign}${Math.round(a)}`;
};

/** Maior valor aceito (cabe com folga no numeric(14,2) do banco). */
export const MAX_AMOUNT = 999_999_999.99;

export type AmountCheck = { value: number } | { problem: 'invalido' | 'zero' | 'muito-alto' | 'casas'; message: string };

const MSG = {
  invalido: 'Valor inválido. Use só números, com vírgula nos centavos. Ex.: 1.234,56',
  zero: 'Informe um valor maior que zero.',
  'muito-alto': 'Valor muito alto (o máximo é R$ 999.999.999,99).',
  casas: 'Use no máximo 2 casas decimais (centavos).',
} as const;
const bad = (problem: keyof typeof MSG): AmountCheck => ({ problem, message: MSG[problem] });

/**
 * Lê um valor digitado em reais e diz o que há de errado quando não dá.
 * Aceita "1.234,56", "1234,5", "23.5", "R$ 15", "+50" (o sinal é ignorado aqui).
 * Recusa o ambíguo em vez de adivinhar: "1,2,3", "1.2.3", "1,239".
 */
export function checkAmount(raw: string): AmountCheck {
  const t = raw.trim().replace(/^r\$\s*/i, '').replace(/^[+-]/, '');
  if (!/^\d[\d.,]*$/.test(t)) return bad('invalido');
  let n: number;
  const commas = (t.match(/,/g) ?? []).length;
  if (commas > 1) return bad('invalido');
  if (commas === 1) {
    const [int, dec = ''] = t.split(',');
    if (!/^(\d+|\d{1,3}(\.\d{3})+)$/.test(int)) return bad('invalido');
    if (dec.length > 2) return bad('casas');
    n = parseFloat(`${int.replace(/\./g, '')}.${dec || '0'}`);
  } else if (t.includes('.')) {
    if (/^\d{1,3}(\.\d{3})+$/.test(t)) n = parseFloat(t.replace(/\./g, '')); // 1.200 = mil e duzentos
    else if (/^\d+\.\d{1,2}$/.test(t)) n = parseFloat(t); // 23.5
    else return bad(/^\d+\.\d{3,}$/.test(t) ? 'casas' : 'invalido');
  } else n = parseFloat(t);
  if (!Number.isFinite(n)) return bad('invalido');
  n = round2(n);
  if (n === 0) return bad('zero');
  if (n > MAX_AMOUNT) return bad('muito-alto');
  return { value: n };
}

/** Valor em reais, ou null se não for um valor válido (ver checkAmount para saber o motivo). */
export function parseAmount(raw: string): number | null {
  const r = checkAmount(raw);
  return 'value' in r ? r.value : null;
}

/** Mensagem de erro para o campo de valor (vazia = tudo certo). */
export const amountError = (raw: string): string => {
  if (!raw.trim()) return MSG.zero;
  const r = checkAmount(raw);
  return 'message' in r ? r.message : '';
};
