/**
 * Thin async IndexedDB wrapper for TLE/catalog data caching.
 * Replaces localStorage for large data — effectively unlimited storage.
 */

const DB_NAME = 'threescope-cache';
const DB_VERSION = 1;
const STORE_NAME = 'cache';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDB().then(db => db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Wrapped cache entry (same shape as old localStorage JSON). */
export interface CacheEntry {
  ts: number;
  data: string;
  count?: number;
}

/** Get a JSON-wrapped cache entry by key. */
export async function cacheGet(key: string): Promise<CacheEntry | null> {
  try {
    const store = await tx('readonly');
    const val = await wrap(store.get(key));
    return val ?? null;
  } catch {
    return null;
  }
}

/** Put a JSON-wrapped cache entry. */
export async function cachePut(key: string, entry: CacheEntry): Promise<void> {
  try {
    const store = await tx('readwrite');
    await wrap(store.put(entry, key));
  } catch {
    console.warn(`[cache-db] failed to write "${key}"`);
  }
}

/** Delete a single cache entry. */
export async function cacheDelete(key: string): Promise<void> {
  try {
    const store = await tx('readwrite');
    await wrap(store.delete(key));
  } catch {}
}

/** Get raw string value (for satvisor_source_text_* entries). */
export async function cacheGetRaw(key: string): Promise<string | null> {
  try {
    const store = await tx('readonly');
    const val = await wrap(store.get(key));
    return typeof val === 'string' ? val : null;
  } catch {
    return null;
  }
}

/** Put a raw string value. */
export async function cachePutRaw(key: string, text: string): Promise<void> {
  try {
    const store = await tx('readwrite');
    await wrap(store.put(text, key));
  } catch {
    console.warn(`[cache-db] failed to write raw "${key}"`);
  }
}

/** Get all keys in the store. */
export async function cacheKeys(): Promise<string[]> {
  try {
    const store = await tx('readonly');
    const keys = await wrap(store.getAllKeys());
    return keys.map(k => String(k));
  } catch {
    return [];
  }
}

/** Delete all keys matching a prefix. */
export async function cacheDeleteByPrefix(prefix: string): Promise<void> {
  try {
    const keys = await cacheKeys();
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    for (const key of keys) {
      if (key.startsWith(prefix)) store.delete(key);
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {}
}

/** Clean up old localStorage cache entries (one-time migration). */
export function cleanupLocalStorage(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (
        key?.startsWith('tlescope_tle_') ||
        key?.startsWith('satvisor_source_text_') ||
        key?.startsWith('threescope_catalog_')
      ) {
        localStorage.removeItem(key);
      }
    }
  } catch {}
}
