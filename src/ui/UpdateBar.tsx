import { RefreshCw } from 'lucide-react';
import { updateNow, useUpdatePending } from '../lib/updates';

/** Aviso de versão nova (só aparece quando não deu para atualizar sozinho, ex.: com uma janela aberta). */
export function UpdateBar() {
  const pending = useUpdatePending();
  if (!pending) return null;
  return (
    <div className="update-bar" role="status">
      <RefreshCw size={16} aria-hidden />
      <span>Nova versão do Bolso pronta</span>
      <button onClick={updateNow}>Atualizar agora</button>
    </div>
  );
}
