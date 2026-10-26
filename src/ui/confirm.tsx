import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}
type Ask = (o: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<Ask>(async () => false);
export const useConfirm = () => useContext(Ctx);

/** Substitui o window.confirm por um alerta no estilo do iOS. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const [closing, setClosing] = useState(false);

  const ask = useCallback<Ask>((opts) => new Promise((resolve) => setReq({ opts, resolve })), []);
  const finish = (value: boolean) => {
    if (!req || closing) return;
    setClosing(true);
    setTimeout(() => { req.resolve(value); setReq(null); setClosing(false); }, 200);
  };

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') e.stopImmediatePropagation();
      if (e.key === 'Escape') finish(false);
      if (e.key === 'Tab') { e.preventDefault(); const bs = [...document.querySelectorAll<HTMLButtonElement>('.ios-alert button')]; const i = bs.indexOf(document.activeElement as HTMLButtonElement); bs[(i + (e.shiftKey ? -1 : 1) + bs.length) % bs.length]?.focus(); }
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  });

  return (
    <Ctx.Provider value={ask}>
      {children}
      {req && (
        <div className={`ios-alert-wrap${closing ? ' closing' : ''}`} onClick={() => finish(false)}>
          <div className="ios-alert" role="alertdialog" aria-modal="true" aria-label={req.opts.title} onClick={(e) => e.stopPropagation()}>
            <div className="ios-alert-body"><h2>{req.opts.title}</h2><p>{req.opts.message}</p></div>
            <div className="ios-alert-actions">
              <button autoFocus onClick={() => finish(false)}>Cancelar</button>
              <button className={req.opts.danger ? 'danger' : 'strong'} onClick={() => finish(true)}>{req.opts.confirmLabel ?? 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
