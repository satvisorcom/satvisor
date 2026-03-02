import * as satellite from 'satellite.js';
import * as THREE from 'three';
import type { Satellite } from '../types';
import { normalizeEpoch, epochToUnix } from './epoch';
import { J2, EARTH_RADIUS_EQ_KM, MU } from '../constants';
import stdmagData from '../data/stdmag.json';

/**
 * Compute J2 secular perturbation rates for RAAN and argument of perigee.
 *
 * dΩ/dt = -1.5 · n · J2 · (Re/p)² · cos(i)
 * dω/dt =  1.5 · n · J2 · (Re/p)² · (2 - 2.5·sin²(i))
 */
function computeJ2Rates(
  n: number, a: number, e: number, inc: number
): { raanRate: number; argPerigeeRate: number } {
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

// Pre-index stdmag data for fast numeric lookup (avoid per-sat String conversion)
const stdmagMap = new Map<number, number>();
for (const [k, v] of Object.entries(stdmagData as Record<string, number>)) {
  stdmagMap.set(Number(k), v);
}

const TWO_PI = 2.0 * Math.PI;
const NDOT_CONV = TWO_PI / (86400.0 * 86400.0); // rev/day² → rad/s²

export function parseTLE(name: string, line1: string, line2: string): Satellite | null {
  try {
    const satrec = satellite.twoline2satrec(line1, line2);

    // Read orbital elements directly from satrec (already parsed by twoline2satrec)
    const sr = satrec as any;
    const noradId = Number(sr.satnum);
    const epochDays = sr.epochyr * 1000 + sr.epochdays;
    const inclination: number = sr.inclo;       // rad
    const raan: number = sr.nodeo;              // rad
    const eccentricity: number = sr.ecco;
    const argPerigee: number = sr.argpo;        // rad
    const meanAnomaly: number = sr.mo;          // rad
    const meanMotion = sr.no / 60;              // rad/min → rad/s
    const semiMajorAxis = sr.a * EARTH_RADIUS_EQ_KM; // earth radii → km

    // ndot: satrec stores raw TLE value (rev/day²/2), convert to rad/s²
    const ndot = 2.0 * sr.ndot * NDOT_CONV;

    // Compute J2 secular rates
    const { raanRate, argPerigeeRate } = computeJ2Rates(
      meanMotion, semiMajorAxis, eccentricity, inclination
    );

    return {
      noradId,
      name: name.trim(),
      epochDays,
      inclination,
      raan,
      eccentricity,
      argPerigee,
      meanAnomaly,
      meanMotion,
      semiMajorAxis,
      currentPos: new THREE.Vector3(),
      satrec,
      tleLine1: line1,
      tleLine2: line2,
      raanRate,
      argPerigeeRate,
      ndot,
      stdMag: stdmagMap.get(noradId) ?? null,
      visualMag: null,
      decayed: false,
    };
  } catch {
    return null;
  }
}

/**
 * Return J2-corrected RAAN and argument of perigee at the given epoch.
 * Uses precomputed secular rates on the Satellite object.
 */
export function getCorrectedElements(sat: Satellite, currentEpoch: number): { raan: number; argPerigee: number } {
  const deltaS = epochToUnix(currentEpoch) - epochToUnix(sat.epochDays);
  return {
    raan: sat.raan + sat.raanRate * deltaS,
    argPerigee: sat.argPerigee + sat.argPerigeeRate * deltaS,
  };
}

export function calculatePosition(sat: Satellite, currentEpoch: number, target?: THREE.Vector3): THREE.Vector3 {
  currentEpoch = normalizeEpoch(currentEpoch);
  const out = target ?? new THREE.Vector3();

  // Convert epoch to Date for satellite.js
  const yy = Math.floor(currentEpoch / 1000.0);
  const day = currentEpoch % 1000.0;
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const jan1 = Date.UTC(year, 0, 1);
  const dateMs = jan1 + (day - 1.0) * 86400000;
  const date = new Date(dateMs);

  const result = satellite.propagate(sat.satrec, date);

  if (!result.position || typeof result.position === 'boolean') {
    return out.set(0, 0, 0);
  }

  const eci = result.position as satellite.EciVec3<number>;

  // ECI to render coords: x=eci.x, y=eci.z, z=-eci.y
  return out.set(eci.x, eci.z, -eci.y);
}
