/**
 * Multi-format OMM parser: detects and normalizes CelesTrak GP data formats
 * (CSV, XML, KVN) into OMM JSON objects compatible with satellite.js json2satrec().
 */

export type DataFormat = 'json' | 'csv' | 'xml' | 'kvn' | 'tle';

/** OMM fields used by satellite.js (all present in CelesTrak output). */
const OMM_KEYS = new Set([
  'OBJECT_NAME', 'OBJECT_ID', 'CENTER_NAME', 'REF_FRAME', 'TIME_SYSTEM',
  'MEAN_ELEMENT_THEORY', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION',
  'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'EPHEMERIS_TYPE',
  'CLASSIFICATION_TYPE', 'NORAD_CAT_ID', 'ELEMENT_SET_NO', 'REV_AT_EPOCH',
  'BSTAR', 'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT', 'CREATION_DATE', 'ORIGINATOR',
  'CCSDS_OMM_VERS', 'COMMENT', 'CLASSIFICATION', 'REF_FRAME_EPOCH',
]);

/** CSV header keywords that positively identify CelesTrak CSV format. */
const CSV_MARKERS = ['OBJECT_NAME', 'NORAD_CAT_ID', 'MEAN_MOTION'];

export function detectFormat(text: string): DataFormat {
  const trimmed = text.trimStart();
  if (trimmed[0] === '[') return 'json';
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<ndm') || trimmed.startsWith('<omm')) return 'xml';
  // CSV: first line contains known OMM headers separated by commas
  const firstLine = trimmed.slice(0, trimmed.indexOf('\n')).trim();
  if (firstLine.includes(',') && CSV_MARKERS.some(m => firstLine.includes(m))) return 'csv';
  // KVN: has KEY = VALUE lines with known OMM keys
  if (/^(CCSDS_OMM_VERS|OBJECT_NAME)\s*=/m.test(trimmed)) return 'kvn';
  return 'tle';
}

// ---------------------------------------------------------------------------
// CSV Parser
// ---------------------------------------------------------------------------

/** Parse RFC 4180 CSV line, handling quoted fields. */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) { fields.push(''); break; }
    if (line[i] === '"') {
      // Quoted field
      let value = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') { value += '"'; i += 2; }
          else { i++; break; } // closing quote
        } else {
          value += line[i]; i++;
        }
      }
      fields.push(value);
      if (line[i] === ',') i++; // skip delimiter
    } else {
      const next = line.indexOf(',', i);
      if (next === -1) { fields.push(line.slice(i)); break; }
      fields.push(line.slice(i, next));
      i = next + 1;
    }
  }
  return fields;
}

export function parseCSV(text: string): Record<string, unknown>[] {
  const lines = text.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  const records: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < headers.length) continue;
    const rec: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      rec[headers[j]] = values[j];
    }
    records.push(rec);
  }
  return records;
}

// ---------------------------------------------------------------------------
// XML Parser (uses DOMParser — browser built-in)
// ---------------------------------------------------------------------------

/** Extract text content of a direct child element, or undefined. */
function childText(parent: Element, tag: string): string | undefined {
  const el = parent.getElementsByTagName(tag)[0];
  return el?.textContent?.trim() || undefined;
}

export function parseXML(text: string): Record<string, unknown>[] {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) return [];

  const records: Record<string, unknown>[] = [];
  // Each satellite is an <omm> element under <ndm>
  const omms = doc.getElementsByTagName('omm');
  for (let i = 0; i < omms.length; i++) {
    const omm = omms[i];
    const rec: Record<string, unknown> = {};

    // Metadata fields live under <metadata>
    const metadata = omm.getElementsByTagName('metadata')[0];
    if (metadata) {
      for (const key of OMM_KEYS) {
        const val = childText(metadata, key);
        if (val !== undefined) rec[key] = val;
      }
    }

    // Mean elements under <data><meanElements>
    const meanEl = omm.getElementsByTagName('meanElements')[0];
    if (meanEl) {
      for (const key of OMM_KEYS) {
        const val = childText(meanEl, key);
        if (val !== undefined) rec[key] = val;
      }
    }

    // TLE parameters under <data><tleParameters>
    const tleParams = omm.getElementsByTagName('tleParameters')[0];
    if (tleParams) {
      for (const key of OMM_KEYS) {
        const val = childText(tleParams, key);
        if (val !== undefined) rec[key] = val;
      }
    }

    if (rec.OBJECT_NAME || rec.NORAD_CAT_ID) {
      records.push(rec);
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// KVN Parser
// ---------------------------------------------------------------------------

export function parseKVN(text: string): Record<string, unknown>[] {
  const lines = text.split('\n');
  const records: Record<string, unknown>[] = [];
  let current: Record<string, unknown> = {};
  let hasData = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('COMMENT')) {
      // Blank line or end may delimit records, but not always.
      // KVN uses OBJECT_NAME as the start of a new satellite block.
      continue;
    }
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();

    // OBJECT_NAME signals a new record (except the very first)
    if (key === 'OBJECT_NAME' && hasData) {
      if (current.OBJECT_NAME || current.NORAD_CAT_ID) {
        records.push(current);
      }
      current = {};
    }

    if (value) current[key] = value;
    hasData = true;
  }

  // Push last record
  if (current.OBJECT_NAME || current.NORAD_CAT_ID) {
    records.push(current);
  }

  return records;
}

// ---------------------------------------------------------------------------
// Unified normalizer
// ---------------------------------------------------------------------------

/**
 * Attempt to normalize any text input into OMM JSON records.
 * Returns null if the format is TLE (caller should use TLE parser instead).
 */
export function normalizeToOMM(text: string): Record<string, unknown>[] | null {
  const fmt = detectFormat(text);
  switch (fmt) {
    case 'json': return JSON.parse(text);
    case 'csv': return parseCSV(text);
    case 'xml': return parseXML(text);
    case 'kvn': return parseKVN(text);
    case 'tle': return null;
  }
}

/**
 * Serialize OMM records back to pretty JSON (canonical round-trip format).
 */
export function ommToJson(records: Record<string, unknown>[]): string {
  return JSON.stringify(records, null, 2);
}

/**
 * Convert raw text of any supported format to OMM records.
 * For TLE text, converts each entry to an OMM-like record for the visual editor.
 * Returns records + detected format.
 */
export function textToRecords(text: string): { records: Record<string, unknown>[]; format: DataFormat } {
  const fmt = detectFormat(text);
  if (fmt === 'tle') {
    return { records: tleTextToRecords(text), format: fmt };
  }
  const records = normalizeToOMM(text);
  return { records: records ?? [], format: fmt };
}

/**
 * Parse TLE text into OMM-like records for the visual editor.
 * These have the same field names as OMM JSON but are derived from TLE lines.
 */
function tleTextToRecords(text: string): Record<string, unknown>[] {
  const lines = text.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
  const records: Record<string, unknown>[] = [];
  let i = 0;
  while (i < lines.length) {
    if (i + 2 < lines.length && lines[i + 1].startsWith('1 ') && lines[i + 2].startsWith('2 ')) {
      records.push(tleLinesToRecord(lines[i], lines[i + 1], lines[i + 2]));
      i += 3;
    } else if (i + 1 < lines.length && lines[i].startsWith('1 ') && lines[i + 1].startsWith('2 ')) {
      const noradId = lines[i].substring(2, 7).trim();
      records.push(tleLinesToRecord(noradId, lines[i], lines[i + 1]));
      i += 2;
    } else {
      i++;
    }
  }
  return records;
}

/** Extract OMM fields from TLE line 1 + line 2. */
function tleLinesToRecord(name: string, line1: string, line2: string): Record<string, unknown> {
  const noradId = line1.substring(2, 7).trim();
  const classification = line1[7] || 'U';
  const intlDesig = line1.substring(9, 17).trim();
  const epochYr = parseInt(line1.substring(18, 20));
  const epochDay = parseFloat(line1.substring(20, 32));
  const ndot = line1.substring(33, 43).trim();
  const nddot = parseTLEExponent(line1.substring(44, 52).trim());
  const bstar = parseTLEExponent(line1.substring(53, 61).trim());
  const ephType = line1[62]?.trim() || '0';
  const elsetNo = line1.substring(64, 68).trim();

  const inc = parseFloat(line2.substring(8, 16));
  const raan = parseFloat(line2.substring(17, 25));
  const ecc = parseFloat('0.' + line2.substring(26, 33).trim());
  const argp = parseFloat(line2.substring(34, 42));
  const ma = parseFloat(line2.substring(43, 51));
  const mm = parseFloat(line2.substring(52, 63));
  const revnum = line2.substring(63, 68).trim();

  // Convert TLE epoch to ISO string
  const fullYear = epochYr < 57 ? 2000 + epochYr : 1900 + epochYr;
  const jan1 = new Date(Date.UTC(fullYear, 0, 1));
  const epochMs = jan1.getTime() + (epochDay - 1) * 86400000;
  const epochDate = new Date(epochMs);
  const epochStr = epochDate.toISOString().replace('Z', '');

  // Convert international designator to YYYY-NNNP format
  const launchYr = intlDesig.substring(0, 2);
  const fullLaunchYr = parseInt(launchYr) < 57 ? '20' + launchYr : '19' + launchYr;
  const objectId = intlDesig ? `${fullLaunchYr}-${intlDesig.substring(2)}` : '';

  return {
    OBJECT_NAME: name.trim(),
    OBJECT_ID: objectId,
    NORAD_CAT_ID: noradId,
    CLASSIFICATION_TYPE: classification,
    EPOCH: epochStr,
    MEAN_MOTION: mm,
    ECCENTRICITY: ecc,
    INCLINATION: inc,
    RA_OF_ASC_NODE: raan,
    ARG_OF_PERICENTER: argp,
    MEAN_ANOMALY: ma,
    EPHEMERIS_TYPE: ephType,
    ELEMENT_SET_NO: elsetNo,
    REV_AT_EPOCH: revnum,
    BSTAR: bstar,
    MEAN_MOTION_DOT: ndot,
    MEAN_MOTION_DDOT: nddot,
  };
}

/** Parse TLE implied-decimal exponent format like " 12345-6" → "0.12345e-6" as string. */
function parseTLEExponent(s: string): string {
  if (!s || s === '0' || s === '00000-0' || s === ' 00000-0') return '0';
  // Format: [+-]NNNNN[+-]N where the decimal point is implied before the digits
  const match = s.match(/^([+-]?)(\d+)([+-]\d)$/);
  if (!match) return s;
  const [, sign, digits, exp] = match;
  return `${sign || ''}.${digits}E${exp}`;
}
