import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Sheet, SheetClosing } from './Sheet';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}
type Ask = (o: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<Ask>(async () => false);
export const useConfirm = () => useContext(Ctx);

/** Substitui o window.confirm por um painel no estilo do app. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const [closing, setClosing] = useState(false);

  const ask = useCallback<Ask>((opts) => new Promise((resolve) => setReq({ opts, resolve })), []);
  const finish = (value: boolean) => {
    if (!req || closing) return;
    setClosing(true);
    setTimeout(() => { req.resolve(value); setReq(null); setClosing(false); }, 200);
  };

  return (
    <Ctx.Provider value={ask}>
      {children}
      {req && (
        <SheetClosing.Provider value={closing}>
          <Sheet title={req.opts.title} onClose={() => finish(false)}
            footer={
              <div className="foot-actions">
                <button className="btn" onClick={() => finish(false)}>Cancelar</button>
                <button className={`btn ${req.opts.danger ? 'danger' : 'primary'}`} style={{ flex: 1 }} onClick={() => finish(true)}>
                  {req.opts.confirmLabel ?? 'Confirmar'}
                </button>
              </div>
            }>
            <p style={{ color: 'var(--text-2)', lineHeight: 1.5 }}>{req.opts.message}</p>
          </Sheet>
        </SheetClosing.Provider>
      )}
    </Ctx.Provider>
  );
}
