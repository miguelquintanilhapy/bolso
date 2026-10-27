const p2 = (n: number) => String(n).padStart(2, '0');

/** Quando a pessoa registrou o lançamento (hora local). `null` para o que foi criado sozinho (recorrência) ou sem horário guardado. */
export function launchInfo(tx: { created_at?: string; date: string; recurrence_id?: string | null }) {
  if (!tx.created_at || tx.recurrence_id) return null;
  const d = new Date(tx.created_at);
  if (Number.isNaN(d.getTime())) return null;
  const ymd = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const time = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const dm = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
  return { time, dm, ymd, sameDay: ymd === tx.date, full: `${dm}/${d.getFullYear()} às ${time}`, csv: `${ymd} ${time}` };
}

type TimeFields = { occurred_time?: string | null; created_at?: string; date: string; recurrence_id?: string | null };

export const validTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** Hora a mostrar: a que a pessoa informou ("typed") ou, sem ela, a do registro. */
export function effectiveTime(tx: TimeFields): { time: string; typed: boolean } | null {
  if (tx.occurred_time) return { time: tx.occurred_time, typed: true };
  const l = launchInfo(tx);
  return l ? { time: l.time, typed: false } : null;
}

/** Hora usada para ordenar dentro do dia: informada > do registro (se foi no mesmo dia) > começo do dia. */
export function sortTime(tx: TimeFields): string {
  if (tx.occurred_time) return tx.occurred_time;
  const l = launchInfo(tx);
  return l?.sameDay ? l.time : '00:00';
}
