import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
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

/** Valor grande com centavos em cinza. */
export function Hero({ value, small }: { value: number; small?: boolean }) {
  const { hidden } = usePrivacy();
  if (hidden) return <div className={`hero ${small ? 'sm' : ''}`}>{MASK}</div>;
  const { sign, int, cents } = splitBRL(value);
  return <div className={`hero num ${small ? 'sm' : ''}`}>{sign}{int}<span className="cents">{cents}</span></div>;
}

export function useMaskedText() {
  const { hidden } = usePrivacy();
  return (n: number) => (hidden ? MASK : formatBRL(n));
}
