import type { Db } from './api';
import { createDemoDb } from './demo';
import { createSupabaseDb } from './supabase';

/** Remove espaços, quebras de linha e aspas coladas junto do valor. */
const clean = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim() : undefined);

const url = clean(import.meta.env.VITE_SUPABASE_URL);
const key = clean(import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

function validate(): string | null {
  if (!url && !key) return null; // sem variáveis: modo demonstração
  if (!url || !key) return 'Falta uma das variáveis: VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY.';
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) return 'VITE_SUPABASE_URL está fora do formato https://SEU-ID.supabase.co (sem barra no meio, sem espaços).';
  if (!/^[A-Za-z0-9._-]+$/.test(key)) return 'VITE_SUPABASE_ANON_KEY contém caracteres inválidos (espaço, aspas, "…" ou quebra de linha). Apague o valor no Vercel e cole a chave inteira de novo.';
  return null;
}

/** Mensagem de erro de configuração, se as variáveis estiverem mal preenchidas. */
export const configError = validate();

/** Sem as variáveis do Supabase o app roda em modo demo (dados só neste aparelho). */
export const db: Db = !configError && url && key ? createSupabaseDb(url.replace(/\/$/, ''), key) : createDemoDb();
