import type { Db } from './api';
import { createDemoDb } from './demo';
import { createSupabaseDb } from './supabase';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined;

/** Sem as variáveis do Supabase o app roda em modo demo (dados só neste aparelho). */
export const db: Db = url && key ? createSupabaseDb(url, key) : createDemoDb();
