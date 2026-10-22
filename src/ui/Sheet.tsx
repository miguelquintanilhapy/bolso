import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Verdadeiro enquanto o painel toca a animação de saída (controlado por quem o abriu). */
export const SheetClosing = createContext(false);

const CLOSE_DISTANCE = 110;

export function Sheet({ title, onClose, children, left, footer }: { title: string; onClose: () => void; children: ReactNode; left?: ReactNode; footer?: ReactNode }) {
  const closing = useContext(SheetClosing);
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  const [dy, setDy] = useState(0);
  const [mode, setMode] = useState<'idle' | 'dragging' | 'settling'>('idle');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const node = ref.current;
    if (node && !node.contains(document.activeElement)) node.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  const down = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    start.current = e.clientY;
    setMode('dragging');
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (start.current === null) return;
    setDy(Math.max(0, e.clientY - start.current));
  };
  const up = () => {
    if (start.current === null) return;
    start.current = null;
    if (dy > CLOSE_DISTANCE) {
      setMode('idle');
      onClose();
    } else {
      setMode('settling');
      setDy(0);
    }
  };

  const style: CSSProperties & Record<string, string> = { '--dy': `${dy}px` };
  if (mode !== 'idle' && !closing) style.transform = `translate(-50%, ${dy}px)`;

  return createPortal(
    <>
      <div className={`overlay ${closing ? 'closing' : ''}`} onClick={onClose} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} style={style}
        className={`sheet ${closing ? 'closing' : ''} ${mode === 'dragging' ? 'dragging' : mode === 'settling' ? 'settling' : ''}`}
        onTransitionEnd={() => mode === 'settling' && setMode('idle')}>
        <div className="sheet-grab" aria-hidden />
        <div className="sheet-head" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          {left ?? <span className="spacer" />}
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}

type SheetProps = Parameters<typeof Sheet>[0];

/** Painel controlado por `open`, com animação de saída. */
export function ModalSheet({ open, ...rest }: SheetProps & { open: boolean }) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); return; }
    if (!mounted) return;
    setClosing(true);
    const t = setTimeout(() => { setMounted(false); setClosing(false); }, 210);
    return () => clearTimeout(t);
  }, [open, mounted]);
  if (!mounted) return null;
  return <SheetClosing.Provider value={closing}><Sheet {...rest} /></SheetClosing.Provider>;
}
