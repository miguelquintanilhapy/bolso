/** Código de convite vindo do link (…/?convite=CODIGO), já limpo; null se não houver. */
export function inviteFromSearch(search: string): string | null {
  const v = new URLSearchParams(search).get('convite');
  const code = v?.trim().slice(0, 64);
  return code && /^[\w-]+$/.test(code) ? code : null;
}
