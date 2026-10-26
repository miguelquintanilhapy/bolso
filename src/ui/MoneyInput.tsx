import { useLayoutEffect, useRef, type InputHTMLAttributes } from 'react';
import { typedToValue, valueToDisplay } from '../lib/money';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> {
  /** Valor guardado no formato "1234,56" (vazio = zero). */
  value: string;
  onChange: (value: string) => void;
  /** Mostra o botão ± (saldos podem ser negativos). */
  allowNegative?: boolean;
}

/** Campo de valor como nos bancos: os dígitos entram pela direita (1 → 0,01 · 10 → 0,10 · 100 → 1,00). */
export function MoneyInput({ value, onChange, allowNegative, placeholder = '0,00', ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const shown = valueToDisplay(value);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && document.activeElement === el) el.setSelectionRange(shown.length, shown.length);
  }, [shown]);
  const toEnd = () => {
    const el = ref.current;
    if (el) { const n = el.value.length; requestAnimationFrame(() => el.setSelectionRange(n, n)); }
  };
  const input = (
    <input {...rest} ref={ref} inputMode={allowNegative ? 'decimal' : 'numeric'} autoComplete="off" placeholder={placeholder} value={shown}
      onChange={(e) => { const v = typedToValue(e.target.value, value, allowNegative); if (v !== null) onChange(v); }}
      onFocus={(e) => { rest.onFocus?.(e); toEnd(); }} onClick={toEnd} />
  );
  if (!allowNegative) return input;
  return (
    <div className="money-wrap">
      {input}
      <button type="button" className="sign-btn" aria-label="Alternar entre positivo e negativo" aria-pressed={value.startsWith('-')}
        onClick={() => value && onChange(value.startsWith('-') ? value.slice(1) : `-${value}`)}>±</button>
    </div>
  );
}
