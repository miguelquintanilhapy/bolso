import type { InputHTMLAttributes } from 'react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode' | 'maxLength'> {
  /** "14:32" ou "" (vazio). Pode estar incompleto enquanto a pessoa digita. */
  value: string;
  onChange: (value: string) => void;
}

/** Só dígitos; os dois pontos entram sozinhos: 1432 → 14:32. */
export const maskTime = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
};

export function TimeInput({ value, onChange, placeholder = '--:--', ...rest }: Props) {
  return <input {...rest} inputMode="numeric" autoComplete="off" maxLength={5} placeholder={placeholder} value={value} onChange={(e) => onChange(maskTime(e.target.value))} />;
}
