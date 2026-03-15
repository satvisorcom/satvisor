/** Shared types for protocol console logging (rotator + rig). */

export interface ConsoleLogEntry {
  timestamp: number;       // performance.now()
  direction: 'tx' | 'rx';
  text: string;            // display string (raw text or hex for binary)
  bytes?: Uint8Array;      // raw bytes for binary protocols
  error?: string;          // human-readable error description (e.g. RPRT code meaning)
}

export type OnLogCallback = (entry: ConsoleLogEntry) => void;

export const MAX_LOG_ENTRIES = 10000;

export function formatHex(data: Uint8Array): string {
  return Array.from(data).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

export function parseHexInput(input: string): Uint8Array | null {
  // Strip non-hex chars, collapse whitespace
  const cleaned = input.replace(/[^0-9a-fA-F\s]/g, '').trim();
  if (!cleaned) return null;
  // Split into tokens, then split long tokens into 2-char pairs
  const pairs: string[] = [];
  for (const token of cleaned.split(/\s+/)) {
    if (token.length <= 2) {
      pairs.push(token);
    } else {
      for (let i = 0; i < token.length; i += 2) {
        pairs.push(token.substring(i, i + 2));
      }
    }
  }
  const bytes = pairs.map(t => parseInt(t, 16));
  if (bytes.some(isNaN)) return null;
  return new Uint8Array(bytes);
}
