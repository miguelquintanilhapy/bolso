/** Logo do Bolso: versão preta no tema claro e branca no escuro (a troca é feita pelo CSS, seguindo o tema do app). */
export function BrandLogo({ width, height }: { width?: number; height?: number }) {
  return (
    <>
      <img className="brand-logo logo-light" src="/logo.png" alt="Bolso" width={width} height={height} />
      <img className="brand-logo logo-dark" src="/logo-white.png" alt="" aria-hidden width={width} height={height} />
    </>
  );
}
