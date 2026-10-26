export interface BolsoSplashOptions {
  /** Caminho do logo.png transparente (padrão: '/logo.png'). */
  logo?: string;
  /** Onde inserir a splash (padrão: document.body). */
  parent?: HTMLElement;
}

/** Mostra a splash e resolve quando ela some da tela. */
export function showBolsoSplash(options?: BolsoSplashOptions): Promise<void>;
