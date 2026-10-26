const KEY = 'bolso:name';

/** Nome exibido na saudação: o que a pessoa definiu ou, na falta, algo derivado do e-mail. */
export function getName(email: string): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
  } catch { /* sem armazenamento */ }
  const first = email.split('@')[0].replace(/\d+/g, '').split(/[._-]+/).find(Boolean) ?? 'você';
  return first[0].toUpperCase() + first.slice(1);
}

export function setName(name: string) {
  try {
    if (name.trim()) localStorage.setItem(KEY, name.trim());
    else localStorage.removeItem(KEY);
  } catch { /* sem armazenamento */ }
}

export const hasSavedName = () => {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
};
