// Cópia local dos dados (IndexedDB) para o app abrir na hora e atualizar por trás.
// É apagada ao sair da conta.
const DB_NAME = 'bolso-cache';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const readCache = async <T>(key: string): Promise<T | null> => {
  try { return ((await run('readonly', (s) => s.get(key))) as T | undefined) ?? null; } catch { return null; }
};
export const writeCache = async (key: string, value: unknown) => {
  try { await run('readwrite', (s) => s.put(value, key)); } catch { /* sem armazenamento: segue sem cache */ }
};
export const clearCache = async () => {
  try { await run('readwrite', (s) => s.clear()); } catch { /* nada a apagar */ }
};
