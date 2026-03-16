import * as THREE from 'three';
import { DEG2RAD } from '../constants';
import { computeMoonEcliptic } from './moon-core';

const _out = new THREE.Vector3();

export function calculateMoonPosition(currentEpoch: number): THREE.Vector3 {
  const { lambda, beta, distKm } = computeMoonEcliptic(currentEpoch);

  const xEcl = distKm * Math.cos(beta) * Math.cos(lambda);
  const yEcl = distKm * Math.cos(beta) * Math.sin(lambda);
  const zEcl = distKm * Math.sin(beta);

  const eps = 23.439 * DEG2RAD;
  const xEci = xEcl;
  const yEci = yEcl * Math.cos(eps) - zEcl * Math.sin(eps);
  const zEci = yEcl * Math.sin(eps) + zEcl * Math.cos(eps);

  // ECI to render: x=eci.x, y=eci.z, z=-eci.y
  return _out.set(xEci, zEci, -yEci);
}
