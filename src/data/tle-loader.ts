import { Vector3 } from 'three';
import type { Satellite } from '../types';
import { parseTLE } from '../astro/propagator';
import { getCelestrakUrl } from './tle-sources';

const CACHE_KEY_PREFIX = 'tlescope_tle_';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const RATELIMIT_KEY = 'tlescope_ratelimited';
const RATELIMIT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export interface FetchResult {
  satellites: Satellite[];
  source: 'cache' | 'network' | 'stale-cache';
  cacheAge?: number; // ms since cache was saved
  rateLimited?: boolean;
}

export function isRateLimited(): boolean {
  try {
    const ts = localStorage.getItem(RATELIMIT_KEY);
    if (!ts) return false;
    return Date.now() - Number(ts) < RATELIMIT_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function clearRateLimit() {
  try { localStorage.removeItem(RATELIMIT_KEY); } catch {}
}

function setRateLimited() {
  try { localStorage.setItem(RATELIMIT_KEY, String(Date.now())); } catch {}
}

export async function fetchTLEData(
  group: string,
  onStatus?: (msg: string) => void,
  forceRetry = false,
): Promise<FetchResult> {
  // Try localStorage cache first (skip if forcing refresh) — single parse
  const cached = !forceRetry ? loadFromCache(group) : null;
  if (cached) {
    onStatus?.('Loading cached data...');
    return { satellites: await parseTLETextParallel(cached.data), source: 'cache', cacheAge: cached.age };
  }

  // Skip network if rate limited (unless manual retry)
  if (!forceRetry && isRateLimited()) {
    const stale = loadFromCache(group, true);
    if (stale) {
      onStatus?.('Rate limited, using cached data');
      return { satellites: await parseTLETextParallel(stale.data), source: 'stale-cache', cacheAge: stale.age, rateLimited: true };
    }
    throw Object.assign(new Error('Rate limited by CelesTrak'), { rateLimited: true });
  }

  onStatus?.('Fetching from CelesTrak...');
  const url = getCelestrakUrl(group);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (resp.status === 403) {
      setRateLimited();
      throw Object.assign(new Error('HTTP 403 — rate limited'), { rateLimited: true });
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    clearRateLimit();
    const satellites = await parseTLETextParallel(text);
    saveToCache(group, text, satellites.length);
    return { satellites, source: 'network' };
  } catch (e) {
    // On failure, try stale cache (ignore age)
    const stale = loadFromCache(group, true);
    if (stale) {
      onStatus?.('CelesTrak unavailable, using cached data');
      console.warn(`CelesTrak fetch failed, using stale cache for "${group}"`);
      return {
        satellites: await parseTLETextParallel(stale.data), source: 'stale-cache', cacheAge: stale.age,
        rateLimited: (e as any)?.rateLimited === true,
      };
    }
    onStatus?.('CelesTrak unavailable, no cached data');
    throw e;
  }
}

function loadFromCache(group: string, ignoreAge = false): { data: string; age: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + group);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    const age = Date.now() - ts;
    if (!ignoreAge && age > CACHE_MAX_AGE_MS) return null;
    return { data, age };
  } catch {
    return null;
  }
}

export function getCacheAge(group: string): number | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + group);
    if (!raw) return null;
    const { ts } = JSON.parse(raw);
    return Date.now() - ts;
  } catch {
    return null;
  }
}

function saveToCache(group: string, data: string, count?: number) {
  try {
    localStorage.setItem(CACHE_KEY_PREFIX + group, JSON.stringify({ ts: Date.now(), data, count }));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

/** Read cached TLE text from localStorage. Returns null if not cached. */
function readCachedText(cacheKey: string, isJsonWrapped: boolean): string | null {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    return isJsonWrapped ? (JSON.parse(raw) as { data: string }).data : raw;
  } catch {
    return null;
  }
}

/** Check if a NORAD ID exists in a cached TLE text (string search, no parsing). */
export function cachedTleHasNorad(cacheKey: string, noradId: number, isJsonWrapped = true): boolean {
  const text = readCachedText(cacheKey, isJsonWrapped);
  if (!text) return false;
  const padded = String(noradId).padStart(5, '0');
  const needle = '1 ' + padded;
  return text.includes('\n' + needle) || text.startsWith(needle);
}

/** Get satellite count from a cached TLE source. Uses stored count if available, falls back to text scan. */
export function cachedTleSatCount(cacheKey: string, isJsonWrapped = true): number {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return 0;
    if (isJsonWrapped) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.count === 'number') return parsed.count;
      // Fallback: scan text for old cache entries without count
      return countTleLines(parsed.data);
    }
    return countTleLines(raw);
  } catch {
    return 0;
  }
}

function countTleLines(text: string): number {
  let count = text.startsWith('1 ') ? 1 : 0;
  let pos = 0;
  while ((pos = text.indexOf('\n1 ', pos)) !== -1) {
    count++;
    pos += 3;
  }
  return count;
}

export function parseTLEText(text: string): Satellite[] {
  const lines = text.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
  const satellites: Satellite[] = [];

  let i = 0;
  while (i + 2 < lines.length) {
    // Try to detect 3-line format (name + line1 + line2) or 2-line format (line1 + line2)
    if (lines[i + 1].startsWith('1 ') && lines[i + 2].startsWith('2 ')) {
      // 3-line: name, line1, line2
      const sat = parseTLE(lines[i], lines[i + 1], lines[i + 2]);
      if (sat) satellites.push(sat);
      i += 3;
    } else if (lines[i].startsWith('1 ') && lines[i + 1].startsWith('2 ')) {
      // 2-line: line1, line2 (no name)
      const noradId = lines[i].substring(2, 7).trim();
      const sat = parseTLE(noradId, lines[i], lines[i + 1]);
      if (sat) satellites.push(sat);
      i += 2;
    } else {
      i++;
    }
  }

  return satellites;
}

// ── Parallel TLE parsing via Web Workers ──

const PARALLEL_THRESHOLD = 3000;
let workerPool: Worker[] | null = null;
let workersReady = 0;
let nextMsgId = 0;
const pendingWorkerCalls = new Map<number, (results: any[]) => void>();

function getWorkerPool(): Worker[] {
  if (workerPool) return workerPool;
  const count = Math.min(navigator.hardwareConcurrency || 4, 8);
  workerPool = [];
  for (let i = 0; i < count; i++) {
    const w = new Worker(
      new URL('./tle-parse-worker.ts', import.meta.url),
      { type: 'module' },
    );
    w.onmessage = (e: MessageEvent<{ ready?: boolean; results?: any[]; id?: number }>) => {
      if (e.data.ready) {
        workersReady++;
        return;
      }
      const resolve = pendingWorkerCalls.get(e.data.id!);
      if (resolve) {
        pendingWorkerCalls.delete(e.data.id!);
        resolve(e.data.results!);
      }
    };
    workerPool.push(w);
  }
  return workerPool;
}

/** Pre-create workers so module compilation overlaps with texture downloads. */
export function warmupTLEWorkers() {
  try { getWorkerPool(); } catch { /* workers unavailable */ }
}

/** Extract [name, line1, line2] triplets from TLE text without running twoline2satrec. */
function extractTLEEntries(text: string): [string, string, string][] {
  const lines = text.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
  const entries: [string, string, string][] = [];
  let i = 0;
  while (i + 2 < lines.length) {
    if (lines[i + 1].startsWith('1 ') && lines[i + 2].startsWith('2 ')) {
      entries.push([lines[i], lines[i + 1], lines[i + 2]]);
      i += 3;
    } else if (lines[i].startsWith('1 ') && lines[i + 1].startsWith('2 ')) {
      entries.push([lines[i].substring(2, 7).trim(), lines[i], lines[i + 1]]);
      i += 2;
    } else {
      i++;
    }
  }
  return entries;
}

/** Parse TLE text, dispatching to web workers for large datasets (>3000 sats). */
export async function parseTLETextParallel(text: string): Promise<Satellite[]> {
  // Quick line-1 count to decide sync vs parallel (avoids full entry extraction for small texts)
  if (countTleLines(text) < PARALLEL_THRESHOLD) {
    return parseTLEText(text);
  }

  // Workers not ready yet (still compiling modules) — use sync to avoid blocking on compilation
  if (workersReady < 2) {
    return parseTLEText(text);
  }

  try {
    const pool = getWorkerPool();
    // Only use workers that are ready (workersReady tracks how many sent 'ready')
    const useCount = Math.min(workersReady, pool.length);
    const entries = extractTLEEntries(text);
    const chunkSize = Math.ceil(entries.length / useCount);

    const promises: Promise<any[]>[] = [];
    for (let i = 0; i < useCount; i++) {
      const chunk = entries.slice(i * chunkSize, (i + 1) * chunkSize);
      if (chunk.length === 0) break;
      promises.push(new Promise<any[]>((resolve) => {
        const id = nextMsgId++;
        pendingWorkerCalls.set(id, resolve);
        pool[i].postMessage({ entries: chunk, id });
      }));
    }

    const results = await Promise.all(promises);

    // Workers return everything except currentPos (can't create THREE.Vector3 in worker)
    const satellites: Satellite[] = [];
    for (const chunk of results) {
      for (const raw of chunk) {
        raw.currentPos = new Vector3();
        satellites.push(raw as Satellite);
      }
    }
    return satellites;
  } catch {
    // Workers unavailable — fall back to sync parsing
    return parseTLEText(text);
  }
}
