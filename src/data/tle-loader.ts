import { Vector3 } from 'three';
import type { Satellite } from '../types';
import { parseTLE, parseOMM } from '../astro/propagator';
import { getMirrorUrl, getCelestrakUrl, getSourceByGroup } from './tle-sources';
import { applyStdmag } from './catalog';
import { detectFormat, normalizeToOMM } from './omm-formats';
import { cacheGet, cacheGetRaw, cachePut, cacheDelete, cacheKeys } from './cache-db';

const CACHE_KEY_PREFIX = 'tlescope_tle_';
const CACHE_MAX_AGE_MS = __TLE_CACHE_MAX_AGE_H__ * 60 * 60 * 1000;
const CACHE_EVICT_AGE_MS = __TLE_CACHE_EVICT_AGE_H__ * 60 * 60 * 1000;
const RATELIMIT_KEY = 'tlescope_ratelimited';
const RATELIMIT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export interface FetchResult {
  satellites: Satellite[];
  source: 'cache' | 'mirror' | 'network' | 'stale-cache';
  cacheAge?: number; // ms since cache was saved
  rateLimited?: boolean;
}

// ── Rate limiting ──

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

// ── Format auto-detection ──

/** Detect if text is OMM JSON (starts with '[') or TLE text. */
function isOMMJson(text: string): boolean {
  return text.trimStart()[0] === '[';
}

// ── Unified parsing (auto-detects JSON, CSV, XML, KVN, TLE) ──

/** Parse OMM records (already-parsed objects) via satellite.js json2satrec. */
function parseOMMRecords(records: Record<string, unknown>[]): Satellite[] {
  const satellites: Satellite[] = [];
  for (const omm of records) {
    const sat = parseOMM(omm);
    if (sat) satellites.push(sat);
  }
  return satellites;
}

/** Parse OMM JSON text directly. */
function parseOMMJson(text: string): Satellite[] {
  return parseOMMRecords(JSON.parse(text));
}

/** Parse satellite data from any supported format (JSON, CSV, XML, KVN, TLE). */
export function parseSatelliteData(text: string): Satellite[] {
  const fmt = detectFormat(text);
  if (fmt === 'tle') return parseTLEText(text);
  if (fmt === 'json') return parseOMMJson(text);
  // CSV, XML, KVN: normalize to OMM records, then parse
  const records = normalizeToOMM(text);
  return records ? parseOMMRecords(records) : [];
}

// ── TLE text parsing ──

export function parseTLEText(text: string): Satellite[] {
  const lines = text.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
  const satellites: Satellite[] = [];

  let i = 0;
  while (i < lines.length) {
    if (i + 2 < lines.length && lines[i + 1].startsWith('1 ') && lines[i + 2].startsWith('2 ')) {
      const sat = parseTLE(lines[i], lines[i + 1], lines[i + 2]);
      if (sat) satellites.push(sat);
      i += 3;
    } else if (i + 1 < lines.length && lines[i].startsWith('1 ') && lines[i + 1].startsWith('2 ')) {
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

// ── Parallel parsing via Web Workers ──

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
  while (i < lines.length) {
    if (i + 2 < lines.length && lines[i + 1].startsWith('1 ') && lines[i + 2].startsWith('2 ')) {
      entries.push([lines[i], lines[i + 1], lines[i + 2]]);
      i += 3;
    } else if (i + 1 < lines.length && lines[i].startsWith('1 ') && lines[i + 1].startsWith('2 ')) {
      entries.push([lines[i].substring(2, 7).trim(), lines[i], lines[i + 1]]);
      i += 2;
    } else {
      i++;
    }
  }
  return entries;
}

/** Count satellites in data text (auto-detects format). */
function countSatellites(text: string): number {
  if (isOMMJson(text)) {
    // Quick count without full parse — count array elements
    try {
      return JSON.parse(text).length;
    } catch {
      return 0;
    }
  }
  return countTleLines(text);
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

/** Parse satellite data, dispatching to web workers for large datasets (>3000 sats). */
export async function parseSatelliteDataParallel(text: string): Promise<Satellite[]> {
  const fmt = detectFormat(text);
  const isOMM = fmt !== 'tle';

  // Normalize CSV/XML/KVN upfront into OMM records (lightweight text parsing)
  // For JSON, parse once; for TLE, use cheap line scan
  let items: unknown[] | null = null;
  let satCount: number;
  if (fmt === 'json') {
    try { items = JSON.parse(text); } catch { return []; }
    satCount = items!.length;
  } else if (fmt === 'csv' || fmt === 'xml' || fmt === 'kvn') {
    items = normalizeToOMM(text);
    satCount = items?.length ?? 0;
    if (!satCount) return [];
  } else {
    satCount = countTleLines(text);
  }

  if (satCount < PARALLEL_THRESHOLD || workersReady < 2) {
    // Sync path — reuse already-parsed OMM items if available
    if (isOMM && items) {
      return parseOMMRecords(items as Record<string, unknown>[]);
    }
    return parseSatelliteData(text);
  }

  try {
    const pool = getWorkerPool();
    const useCount = Math.min(workersReady, pool.length);

    // For OMM formats, items already parsed; for TLE, extract [name, line1, line2] triplets
    if (!items) items = extractTLEEntries(text);
    const chunkSize = Math.ceil(items.length / useCount);

    const promises: Promise<any[]>[] = [];
    for (let i = 0; i < useCount; i++) {
      const chunk = items.slice(i * chunkSize, (i + 1) * chunkSize);
      if (chunk.length === 0) break;
      promises.push(new Promise<any[]>((resolve) => {
        const id = nextMsgId++;
        pendingWorkerCalls.set(id, resolve);
        // Worker accepts either { entries, id } (TLE) or { ommRecords, id } (OMM)
        if (isOMM) {
          pool[i].postMessage({ ommRecords: chunk, id });
        } else {
          pool[i].postMessage({ entries: chunk, id });
        }
      }));
    }

    const results = await Promise.all(promises);

    const satellites: Satellite[] = [];
    for (const chunk of results) {
      for (const raw of chunk) {
        raw.currentPos = new Vector3();
        satellites.push(raw as Satellite);
      }
    }
    applyStdmag(satellites);
    return satellites;
  } catch {
    return parseSatelliteData(text);
  }
}

// ── Cache (IndexedDB) ──

async function loadFromCache(group: string, ignoreAge = false): Promise<{ data: string; age: number } | null> {
  const entry = await cacheGet(CACHE_KEY_PREFIX + group);
  if (!entry) return null;
  const age = Date.now() - entry.ts;
  if (!ignoreAge && age > CACHE_MAX_AGE_MS) return null;
  return { data: entry.data, age };
}

export async function getCacheAge(group: string): Promise<number | null> {
  const entry = await cacheGet(CACHE_KEY_PREFIX + group);
  if (!entry) return null;
  return Date.now() - entry.ts;
}

async function saveToCache(group: string, data: string, count?: number) {
  await cachePut(CACHE_KEY_PREFIX + group, { ts: Date.now(), data, count });
}

/**
 * Delete all TLE cache entries older than CACHE_EVICT_AGE_MS.
 * Called once at startup to prevent unbounded IndexedDB growth.
 * Set VITE_TLE_CACHE_EVICT_AGE_H=0 to disable (useful for offline/air-gapped deployments).
 */
export async function evictExpiredTLECaches() {
  if (!CACHE_EVICT_AGE_MS) return;
  if (!navigator.onLine) return;
  const now = Date.now();
  const keys = await cacheKeys();
  for (const key of keys) {
    if (!key.startsWith(CACHE_KEY_PREFIX)) continue;
    const entry = await cacheGet(key);
    if (!entry) continue;
    if (now - entry.ts > CACHE_EVICT_AGE_MS) {
      console.warn(`[TLE cache] evicting expired "${key.slice(CACHE_KEY_PREFIX.length)}" (older than ${__TLE_CACHE_EVICT_AGE_H__}h)`);
      await cacheDelete(key);
    }
  }
}

/** Read cached data text from IndexedDB (supports both CacheEntry and raw string). */
async function readCachedText(cacheKey: string): Promise<string | null> {
  // Try CacheEntry first (JSON-wrapped), then raw string
  const entry = await cacheGet(cacheKey);
  if (entry?.data) return entry.data;
  const raw = await cacheGetRaw(cacheKey);
  return raw;
}

/** Check if a NORAD ID exists in cached data (auto-detects format). */
export async function cachedTleHasNorad(cacheKey: string, noradId: number): Promise<boolean> {
  const text = await readCachedText(cacheKey);
  if (!text) return false;
  // JSON/CSV: search for NORAD ID as value
  if (text.includes(`"NORAD_CAT_ID":${noradId}`) || text.includes(`"NORAD_CAT_ID": ${noradId}`)) return true;
  // TLE: search for line-1 pattern
  const padded = String(noradId).padStart(5, '0');
  const needle = '1 ' + padded;
  if (text.includes('\n' + needle) || text.startsWith(needle)) return true;
  // CSV (unquoted): NORAD ID appears as a bare value after comma
  if (text.includes(`,${noradId},`) || text.includes(`,${noradId}\n`)) return true;
  return false;
}

/** Get satellite count from a cached source. */
export async function cachedTleSatCount(cacheKey: string): Promise<number> {
  const entry = await cacheGet(cacheKey);
  if (entry) {
    if (typeof entry.count === 'number') return entry.count;
    return countSatellites(entry.data);
  }
  // Raw string (text-type sources)
  const raw = await cacheGetRaw(cacheKey);
  if (raw) return countSatellites(raw);
  return 0;
}

// ── Fetching with mirror-first chain ──

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return resp;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export async function fetchTLEData(
  group: string,
  onStatus?: (msg: string) => void,
  forceRetry = false,
): Promise<FetchResult> {
  // Try IndexedDB cache first (skip if forcing refresh)
  const cached = !forceRetry ? await loadFromCache(group) : null;
  if (cached) {
    onStatus?.('Loading cached data...');
    return { satellites: await parseSatelliteDataParallel(cached.data), source: 'cache', cacheAge: cached.age };
  }

  // Skip network if rate limited (unless manual retry)
  if (!forceRetry && isRateLimited()) {
    const stale = await loadFromCache(group, true);
    if (stale) {
      onStatus?.('Rate limited, using cached data');
      return { satellites: await parseSatelliteDataParallel(stale.data), source: 'stale-cache', cacheAge: stale.age, rateLimited: true };
    }
    throw Object.assign(new Error('Rate limited by CelesTrak'), { rateLimited: true });
  }

  const src = getSourceByGroup(group);
  const isSpecial = src?.special ?? false;

  // 1. Try GitHub mirror (JSON format)
  const mirrorUrl = getMirrorUrl(group, isSpecial);
  try {
    onStatus?.('Fetching from mirror...');
    const resp = await fetchWithTimeout(mirrorUrl);
    if (resp.ok) {
      const text = await resp.text();
      if (text.trim().length > 0) {
        const satellites = await parseSatelliteDataParallel(text);
        await saveToCache(group, text, satellites.length);
        clearRateLimit();
        return { satellites, source: 'mirror' };
      }
    }
  } catch {
    // Mirror unavailable — fall through to CelesTrak
  }

  // 2. Try CelesTrak direct (JSON format)
  const celestrakUrl = getCelestrakUrl(group, isSpecial);
  try {
    onStatus?.('Fetching from CelesTrak...');
    const resp = await fetchWithTimeout(celestrakUrl);
    if (resp.status === 403) {
      setRateLimited();
      throw Object.assign(new Error('HTTP 403 — rate limited'), { rateLimited: true });
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    clearRateLimit();
    const satellites = await parseSatelliteDataParallel(text);
    await saveToCache(group, text, satellites.length);
    return { satellites, source: 'network' };
  } catch (e) {
    // On failure, try stale cache (ignore age)
    const stale = await loadFromCache(group, true);
    if (stale) {
      onStatus?.('Unavailable, using cached data');
      console.warn(`Fetch failed, using stale cache for "${group}"`);
      return {
        satellites: await parseSatelliteDataParallel(stale.data), source: 'stale-cache', cacheAge: stale.age,
        rateLimited: (e as any)?.rateLimited === true,
      };
    }
    onStatus?.('Unavailable, no cached data');
    throw e;
  }
}
