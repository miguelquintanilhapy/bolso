import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { formatBRL, splitBRL } from '../lib/money';

const KEY = 'bolso:hide';
const Ctx = createContext<{ hidden: boolean; toggle: () => void }>({ hidden: false, toggle: () => {} });
export const usePrivacy = () => useContext(Ctx);

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  });
  const toggle = useCallback(() => setHidden((h) => {
    try { localStorage.setItem(KEY, h ? '0' : '1'); } catch { /* sem armazenamento */ }
    return !h;
  }), []);
  return <Ctx.Provider value={{ hidden, toggle }}>{children}</Ctx.Provider>;
}

const MASK = 'R$ ••••';

/** Valor em reais; some quando o modo "ocultar valores" está ligado. */
export function Money({ value, signed, className }: { value: number; signed?: boolean; className?: string }) {
  const { hidden } = usePrivacy();
  if (hidden) return <span className={className}>{MASK}</span>;
  const text = formatBRL(Math.abs(value));
  const sign = value < 0 ? '- ' : signed && value > 0 ? '+ ' : '';
  return <span className={`num ${className ?? ''}`}>{sign}{text}</span>;
}

/** Anima de um valor até o outro (some com "reduzir movimento"). */
function useTween(target: number, ms = 520) {
  const [v, setV] = useState(target);
  const cur = useRef(target); // valor atualmente exibido: uma nova animação continua de onde parou
  useEffect(() => {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || cur.current === target) { cur.current = target; setV(target); return; }
    const a = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      cur.current = k < 1 ? a + (target - a) * (1 - Math.pow(1 - k, 3)) : target;
      setV(cur.current);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** Valor grande com centavos em cinza; os números "rolam" quando o saldo muda. */
export function Hero({ value, small }: { value: number; small?: boolean }) {
  const { hidden } = usePrivacy();
  const shown = useTween(value);
  if (hidden) return <div className={`hero ${small ? 'sm' : ''}`} data-value={value}>{MASK}</div>;
  const { sign, int, cents } = splitBRL(shown);
  return <div className={`hero num ${small ? 'sm' : ''}`} data-value={value}>{sign}{int}<span className="cents">{cents}</span></div>;
}

export function useMaskedText() {
  const { hidden } = usePrivacy();
  return (n: number) => (hidden ? MASK : formatBRL(n));
}
