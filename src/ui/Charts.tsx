import { useEffect, useMemo, useRef, useState } from 'react';
import { compactBRL, formatBRL } from '../lib/money';
import { useMaskedText, usePrivacy } from './privacy';

export function Ring({ ratio, level, size = 46, children }: { ratio: number; level: 'ok' | 'warn' | 'over'; size?: number; children?: React.ReactNode }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const color = level === 'over' ? 'var(--red)' : level === 'warn' ? 'var(--amber)' : 'var(--green)';
  const [shown, setShown] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(id); }, []);
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--card-2)" strokeWidth="4" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={`${shown ? c * Math.min(1, Math.max(0, ratio)) : 0} ${c}`} style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.22, 0.8, 0.24, 1) 0.1s' }} />
      </svg>
      {children}
    </div>
  );
}

function niceTicks(min: number, max: number, count = 4) {
  if (min === max) { max = min + 1; }
  const span = max - min;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

const W = 360;
const H = 190;
const PAD = { l: 44, r: 12, t: 14, b: 26 };

interface Point { label: string; short: string; value: number }

/** Gráfico de área com crosshair e tooltip ao tocar/passar o mouse. */
export function AreaChart({ points, title }: { points: Point[]; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const { hidden } = usePrivacy();
  const mask = useMaskedText();

  const geo = useMemo(() => {
    const vals = points.map((p) => p.value);
    const ticks = niceTicks(Math.min(...vals, 0), Math.max(...vals, 0));
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const x = (i: number) => PAD.l + (points.length === 1 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (points.length - 1));
    const y = (v: number) => PAD.t + ((hi - v) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
    return { ticks, x, y };
  }, [points]);

  if (!points.length) return null;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${geo.x(i).toFixed(1)},${geo.y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${geo.x(points.length - 1)},${geo.y(Math.max(geo.ticks[0], Math.min(0, ...points.map((p) => p.value))))} L${geo.x(0)},${geo.y(Math.max(geo.ticks[0], Math.min(0, ...points.map((p) => p.value))))} Z`;

  const onMove = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    points.forEach((_, i) => { if (Math.abs(geo.x(i) - px) < Math.abs(geo.x(best) - px)) best = i; });
    setHover(best);
  };
  const active = hover ?? points.length - 1;
  const animKey = `${points.length}-${points[points.length - 1].value}`;
  const showTip = hover !== null;
  const gid = `g${title.replace(/\W/g, '')}`;
  const step = Math.ceil(points.length / 6);

  return (
    <>
      <div className="chart" ref={ref}
        onPointerMove={(e) => onMove(e.clientX)} onPointerDown={(e) => onMove(e.clientX)} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--blue)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--blue)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {geo.ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={geo.y(t)} y2={geo.y(t)} />
              <text className="axis" x={PAD.l - 6} y={geo.y(t) + 4} textAnchor="end">{hidden ? '••' : compactBRL(t)}</text>
            </g>
          ))}
          <path key={`a${animKey}`} className="area-fill" d={area} fill={`url(#${gid})`} />
          <path key={`l${animKey}`} className="draw-line" pathLength={1} d={line} fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => ((points.length - 1 - i) % step === 0) && (
            <text key={p.label} className="axis" x={geo.x(i)} y={H - 6} textAnchor={i === points.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'}>{p.short}</text>
          ))}
          {showTip && <line x1={geo.x(active)} x2={geo.x(active)} y1={PAD.t} y2={H - PAD.b} stroke="var(--muted)" strokeWidth="1" />}
          <circle cx={geo.x(active)} cy={geo.y(points[active].value)} r="5" fill="var(--blue)" stroke="var(--card)" strokeWidth="2" />
        </svg>
        {showTip && (
          <div className="tip" style={{ left: `${Math.min(88, Math.max(12, (geo.x(active) / W) * 100))}%`, top: `${(geo.y(points[active].value) / H) * 100 - 4}%` }}>
            {points[active].label}<b>{mask(points[active].value)}</b>
          </div>
        )}
      </div>
      <TableView title={title} rows={points.map((p) => [p.label, hidden ? '••••' : formatBRL(p.value)])} />
    </>
  );
}

interface Group { label: string; short: string; a: number; b: number }

/** Barras agrupadas (Entradas × Saídas) por mês. */
export function BarChart({ groups, aLabel, bLabel, title }: { groups: Group[]; aLabel: string; bLabel: string; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const { hidden } = usePrivacy();
  const mask = useMaskedText();
  const max = Math.max(1, ...groups.flatMap((g) => [g.a, g.b]));
  const animKey = `${groups.length}-${Math.round(max)}`;
  const ticks = niceTicks(0, max);
  const top = ticks[ticks.length - 1];
  const y = (v: number) => PAD.t + ((top - v) / top) * (H - PAD.t - PAD.b);
  const slot = (W - PAD.l - PAD.r) / groups.length;
  const bw = Math.min(14, (slot - 8) / 2 - 1);

  const onMove = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W - PAD.l;
    setHover(Math.max(0, Math.min(groups.length - 1, Math.floor(px / slot))));
  };
  const bar = (x: number, v: number, color: string, i: number) => {
    const h = Math.max(0, y(0) - y(v));
    const r = Math.min(4, h / 2, bw / 2);
    return <path key={`${animKey}-${i}-${x}`} className="bar-grow" style={{ animationDelay: `${i * 55}ms` }} d={`M${x},${y(0)} v${-(h - r)} a${r},${r} 0 0 1 ${r},${-r} h${bw - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} z`} fill={color} />;
  };

  return (
    <>
      <div className="chart" ref={ref} onPointerMove={(e) => onMove(e.clientX)} onPointerDown={(e) => onMove(e.clientX)} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
              <text className="axis" x={PAD.l - 6} y={y(t) + 4} textAnchor="end">{hidden ? '••' : compactBRL(t)}</text>
            </g>
          ))}
          {groups.map((g, i) => {
            const cx = PAD.l + slot * i + slot / 2;
            return (
              <g key={g.label} opacity={hover === null || hover === i ? 1 : 0.45}>
                {bar(cx - bw - 1, g.a, 'var(--blue)', i)}
                {bar(cx + 1, g.b, 'var(--orange)', i)}
                <text className="axis" x={cx} y={H - 6} textAnchor="middle">{g.short}</text>
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div className="tip" style={{ left: `${Math.min(80, Math.max(20, ((PAD.l + slot * hover + slot / 2) / W) * 100))}%`, top: '2%' }}>
            {groups[hover].label}
            <b style={{ color: 'var(--blue)' }}>{aLabel}: {mask(groups[hover].a)}</b>
            <b style={{ color: 'var(--orange)' }}>{bLabel}: {mask(groups[hover].b)}</b>
          </div>
        )}
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--blue)' }} />{aLabel}</span>
        <span><i style={{ background: 'var(--orange)' }} />{bLabel}</span>
      </div>
      <TableView title={title} head={['Mês', aLabel, bLabel]} rows={groups.map((g) => [g.label, hidden ? '••••' : formatBRL(g.a), hidden ? '••••' : formatBRL(g.b)])} />
    </>
  );
}

function TableView({ title, rows, head }: { title: string; rows: string[][]; head?: string[] }) {
  return (
    <details className="table-view">
      <summary>Ver como tabela</summary>
      <table>
        <caption style={{ display: 'none' }}>{title}</caption>
        {head && <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>}
        <tbody>{rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
      </table>
    </details>
  );
}
