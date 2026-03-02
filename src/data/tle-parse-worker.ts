/**
 * Web Worker for parallel TLE parsing.
 * Runs twoline2satrec (the dominant cost — 94% of parse time) off the main thread.
 */
import { twoline2satrec } from 'satellite.js';
import stdmagData from './stdmag.json';
import { J2, EARTH_RADIUS_EQ_KM } from '../constants';

// Pre-index stdmag data for fast numeric lookup
const stdmagMap = new Map<number, number>();
for (const [k, v] of Object.entries(stdmagData as Record<string, number>)) {
  stdmagMap.set(Number(k), v);
}

const TWO_PI = 2.0 * Math.PI;
const NDOT_CONV = TWO_PI / (86400.0 * 86400.0);

function computeJ2Rates(n: number, a: number, e: number, inc: number) {
  const p = a * (1 - e * e);
  const ReOverP = EARTH_RADIUS_EQ_KM / p;
  const factor = 1.5 * n * J2 * ReOverP * ReOverP;
  const cosI = Math.cos(inc);
  const sinI = Math.sin(inc);
  return {
    raanRate: -factor * cosI,
    argPerigeeRate: factor * (2.0 - 2.5 * sinI * sinI),
  };
}

// Signal that module compilation is complete and worker is ready
postMessage({ ready: true });

self.onmessage = (e: MessageEvent<{ entries: [string, string, string][]; id: number }>) => {
  const { entries, id } = e.data;
  const results: any[] = [];

  for (const [name, line1, line2] of entries) {
    try {
      const satrec = twoline2satrec(line1, line2);
      const sr = satrec as any;
      const noradId = Number(sr.satnum);
      const meanMotion = sr.no / 60;
      const semiMajorAxis = sr.a * EARTH_RADIUS_EQ_KM;
      const inclination: number = sr.inclo;
      const eccentricity: number = sr.ecco;
      const { raanRate, argPerigeeRate } = computeJ2Rates(
        meanMotion, semiMajorAxis, eccentricity, inclination
      );

      results.push({
        noradId,
        name: name.trim(),
        epochDays: sr.epochyr * 1000 + sr.epochdays,
        inclination,
        raan: sr.nodeo,
        eccentricity,
        argPerigee: sr.argpo,
        meanAnomaly: sr.mo,
        meanMotion,
        semiMajorAxis,
        satrec,
        tleLine1: line1,
        tleLine2: line2,
        raanRate,
        argPerigeeRate,
        ndot: 2.0 * sr.ndot * NDOT_CONV,
        stdMag: stdmagMap.get(noradId) ?? null,
        visualMag: null,
        decayed: false,
      });
    } catch {
      // Skip invalid TLE entries
    }
  }

  postMessage({ results, id });
};
