import * as THREE from 'three';
import { MOON_RADIUS_KM, DRAW_SCALE } from '../constants';
import { calculateMoonPosition } from '../astro/moon';

const MOON_VERT = `
uniform sampler2D displacementMap;
uniform float displacementScale;
uniform float hasDisplacement;

varying vec3 vWorldNormal;
varying vec2 vUv;

void main() {
  vUv = uv;
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

  vec3 pos = position;
  if (hasDisplacement > 0.5) {
    float height = texture2D(displacementMap, uv).r;
    pos += normal * height * displacementScale;
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const MOON_FRAG = `
uniform sampler2D map;
uniform sampler2D displacementMap;
uniform vec3 sunDir;
uniform vec3 moonWorldPos;
uniform float showNight;
uniform float bumpStrength;
uniform float aoEnabled;
uniform float hasDisplacement;

varying vec3 vWorldNormal;
varying vec2 vUv;

const float TEX_STEP = 1.0 / 4096.0;
const float AO_STRENGTH = 14.0;
const float EARTH_R = 6371.0;
const float SUN_R = 696000.0;
const float SUN_DIST = 149597870.7;
const float UMBRA_TAN = (SUN_R - EARTH_R) / SUN_DIST;
const float PENUMBRA_TAN = (SUN_R + EARTH_R) / SUN_DIST;

void main() {
  vec3 tex = texture2D(map, vUv).rgb;
  vec3 N = normalize(vWorldNormal);
  float ao = 1.0;

  if (hasDisplacement > 0.5) {
    float hC = texture2D(displacementMap, vUv).r;
    float hL = texture2D(displacementMap, vUv + vec2(-TEX_STEP, 0.0)).r;
    float hR = texture2D(displacementMap, vUv + vec2( TEX_STEP, 0.0)).r;
    float hD = texture2D(displacementMap, vUv + vec2(0.0, -TEX_STEP)).r;
    float hU = texture2D(displacementMap, vUv + vec2(0.0,  TEX_STEP)).r;

    // Bump normal
    if (bumpStrength > 0.01) {
      float len = length(N.xz);
      vec3 T = len > 0.001 ? vec3(-N.z, 0.0, N.x) / len : vec3(1.0, 0.0, 0.0);
      vec3 B = cross(N, T);
      N = normalize(N + bumpStrength * ((hR - hL) * T + (hU - hD) * B));
    }

    // Curvature AO: concave areas (crater floors) darken
    if (aoEnabled > 0.5) {
      float laplacian = (hL + hR + hD + hU) * 0.25 - hC;
      ao = clamp(1.0 - laplacian * AO_STRENGTH, 0.5, 1.0);
    }
  }

  // Diffuse sun lighting (only when night mode is on)
  float NdotL = dot(N, sunDir);
  float diffuse = smoothstep(-0.20, 0.10, NdotL);
  diffuse = mix(1.0, diffuse, showNight);

  // Lunar eclipse: check if Moon is in Earth's shadow cone
  // moonWorldPos is the Moon center in km-space (Earth at origin)
  float eclipseFactor = 1.0;
  float d = -dot(moonWorldPos, sunDir); // distance along shadow axis
  if (d > 0.0) {
    // Perpendicular distance from the Earth-Sun axis
    vec3 proj = moonWorldPos + d * sunDir;
    float perpDist = length(proj);
    float umbraR = EARTH_R - d * UMBRA_TAN;
    float penumbraR = EARTH_R + d * PENUMBRA_TAN;
    if (umbraR > 0.0 && perpDist < umbraR) {
      eclipseFactor = 0.0;
    } else if (perpDist < penumbraR) {
      float innerR = max(umbraR, 0.0);
      eclipseFactor = (perpDist - innerR) / (penumbraR - innerR);
    }
  }

  vec3 color = tex * diffuse * ao;

  // Lunar eclipse tint: copper-red in umbra/penumbra
  vec3 eclipseColor = vec3(0.5, 0.08, 0.03);
  float eclipseBlend = (1.0 - eclipseFactor) * showNight;
  color = mix(color, eclipseColor * tex, eclipseBlend);

  // Earthshine: faint blue fill on the dark side (suppress during eclipse)
  float earthshine = max(0.0, -NdotL) * 0.015 * showNight * eclipseFactor;
  color += vec3(0.4, 0.5, 0.7) * earthshine;

  gl_FragColor = vec4(color, 1.0);
}
`;

export class MoonScene {
  mesh: THREE.Mesh;
  drawPos = new THREE.Vector3();
  private material: THREE.ShaderMaterial;

  constructor(moonTex: THREE.Texture, displacementTex: THREE.Texture | null) {
    const radius = MOON_RADIUS_KM / DRAW_SCALE;
    const geometry = new THREE.SphereGeometry(radius, 256, 256);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: moonTex },
        displacementMap: { value: displacementTex },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
        moonWorldPos: { value: new THREE.Vector3(0, 0, 0) },
        showNight: { value: 1.0 },
        bumpStrength: { value: 1.5 },
        aoEnabled: { value: 1.0 },
        displacementScale: { value: 0.006 },
        hasDisplacement: { value: displacementTex ? 1.0 : 0.0 },
      },
      vertexShader: MOON_VERT,
      fragmentShader: MOON_FRAG,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
  }

  updateSunDir(sunDir: THREE.Vector3) {
    this.material.uniforms.sunDir.value.copy(sunDir);
  }

  setShowNight(show: boolean) {
    this.material.uniforms.showNight.value = show ? 1.0 : 0.0;
  }

  setDisplacementScale(value: number) {
    this.material.uniforms.displacementScale.value = value;
  }

  setBumpEnabled(on: boolean) {
    this.material.uniforms.bumpStrength.value = on ? 2.5 : 0.0;
  }

  setAOEnabled(on: boolean) {
    this.material.uniforms.aoEnabled.value = on ? 1.0 : 0.0;
  }

  setSphereDetail(segments: number) {
    const radius = MOON_RADIUS_KM / DRAW_SCALE;
    const oldGeo = this.mesh.geometry;
    this.mesh.geometry = new THREE.SphereGeometry(radius, segments, segments);
    oldGeo.dispose();
  }

  update(currentEpoch: number) {
    const moonPosKm = calculateMoonPosition(currentEpoch);
    // Pass km-space position to shader for lunar eclipse shadow computation
    this.material.uniforms.moonWorldPos.value.copy(moonPosKm);
    this.drawPos.copy(moonPosKm).divideScalar(DRAW_SCALE);
    this.mesh.position.copy(this.drawPos);

    // Tidal lock: moon always faces Earth (origin)
    const dirToEarth = this.drawPos.clone().negate().normalize();
    const yaw = Math.atan2(-dirToEarth.z, dirToEarth.x);
    const pitch = Math.asin(dirToEarth.y);

    const mZ = new THREE.Matrix4().makeRotationZ(pitch);
    const mY = new THREE.Matrix4().makeRotationY(yaw);
    this.mesh.matrix.copy(mZ.premultiply(mY));
    this.mesh.matrix.setPosition(this.drawPos);
    this.mesh.matrixAutoUpdate = false;
  }
}
