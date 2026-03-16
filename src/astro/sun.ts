import * as THREE from 'three';
import { sunDirectionECI } from './sun-core';

const _out = new THREE.Vector3();

/** Sun direction in **render coords** (x=eci.x, y=eci.z, z=-eci.y). NOT standard ECI. */
export function calculateSunPosition(currentEpoch: number): THREE.Vector3 {
  const { x, y, z } = sunDirectionECI(currentEpoch);
  // ECI to render coords: x=eci.x, y=eci.z, z=-eci.y
  return _out.set(x, z, -y);
}
