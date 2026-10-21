const pad = (n: number) => String(n).padStart(2, '0');

export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());
export const parseISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const monthOf = (iso: string) => iso.slice(0, 7);
export const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
export const addMonthsToMonth = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
export const monthRange = (from: string, to: string) => {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonthsToMonth(m, 1)) out.push(m);
  return out;
};
/** Soma meses mantendo o dia (ou o último dia do mês, se não existir). */
export const addMonthsToDate = (iso: string, n: number) => {
  const day = Number(iso.slice(8, 10));
  const month = addMonthsToMonth(monthOf(iso), n);
  return `${month}-${pad(Math.min(day, daysInMonth(month)))}`;
};
export const addDays = (iso: string, n: number) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
export const diffDays = (a: string, b: string) =>
  Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86_400_000);
export const dateInMonth = (month: string, day: number) => `${month}-${pad(Math.min(day, daysInMonth(month)))}`;
export const endOfMonth = (month: string) => `${month}-${pad(daysInMonth(month))}`;

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const monthName = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1];
export const monthLabel = (month: string, withYear = true) =>
  `${monthName(month)}${withYear ? ` de ${month.slice(0, 4)}` : ''}`;
export const monthShort = (month: string) => monthName(month).slice(0, 3);
export const dayLabel = (iso: string, today = todayISO()) => {
  if (iso === today) return 'Hoje';
  if (iso === addDays(today, -1)) return 'Ontem';
  if (iso === addDays(today, 1)) return 'Amanhã';
  const d = parseISO(iso);
  const base = `${d.getDate()} de ${monthName(monthOf(iso)).slice(0, 3)}`;
  return iso.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${iso.slice(0, 4)}`;
};
export const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
