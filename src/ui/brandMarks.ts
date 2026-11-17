import { siMercadopago, siNubank, siPicpay } from 'simple-icons';

/** Marcas embutidas no app (SVG, sem rede). As outras usam o ícone do site da marca. */
export const BRAND_MARKS: Record<string, string> = {
  nubank: siNubank.path,
  picpay: siPicpay.path,
  mercadopago: siMercadopago.path,
};
