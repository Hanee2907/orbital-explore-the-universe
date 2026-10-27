import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { World } from '../data/types';
import { atmosphereMaterial, starMaterial } from './shaders';
import type { PixelSet } from './painters';
import { type PlanetTextures, glowTexture, paintRings, pixelsToTextures } from './textures';

/** A selectable body in the scene. `anchor` sits at the body's centre. */
export interface Body {
  world: World;
  anchor: THREE.Object3D;
  spin: THREE.Object3D;
  radius: number;
  hit: THREE.Mesh;
  label: CSS2DObject;
  labelEl: HTMLButtonElement;
  orbit?: THREE.LineLoop;
  clouds?: THREE.Mesh;
  atmosphere?: THREE.Mesh;
  starMat?: THREE.ShaderMaterial;
  parentBody?: Body;
  /** Width of the texture currently applied (0 for stars). */
  texWidth: number;
}

const ATMOSPHERES: Record<string, [string, number, number]> = {
  // colour, shell scale, strength
  earth: ['#5fb0ff', 1.07, 1.6],
  venus: ['#ffd9a0', 1.07, 1.3],
  mars: ['#ff9a6a', 1.04, 0.8],
  jupiter: ['#ffe2bc', 1.04, 0.7],
  saturn: ['#ffe8b8', 1.04, 0.7],
  uranus: ['#bff6ff', 1.05, 1.1],
  neptune: ['#7aa4ff', 1.05, 1.2],
  titan: ['#ffb45e', 1.09, 1.4],
};

const EXO_ATMOSPHERE: Partial<Record<World['style'], string>> = {
  earth: '#6fb6ff',
  ocean: '#6fb6ff',
  venus: '#ffd9a0',
  gas: '#ffd6a8',
  'ice-giant': '#a5e4ff',
  lava: '#ff7a3d',
  ice: '#cfe8ff',
};

const sphere = new THREE.SphereGeometry(1, 96, 64);
const lowSphere = new THREE.SphereGeometry(1, 48, 32);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });

function makeLabel(world: World, onPick: (id: string) => void): [CSS2DObject, HTMLButtonElement] {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `scene-label kind-${world.kind}`;
  el.dataset.worldId = world.id;
  el.style.setProperty('--accent', world.color);
  el.innerHTML = `<span class="dot"></span><span class="txt">${world.name}</span>`;
  el.setAttribute('aria-label', `Select ${world.name}`);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onPick(world.id);
  });
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  const obj = new CSS2DObject(el);
  obj.center.set(-0.08, 0.5);
  return [obj, el];
}

/** Quick first-pass texture width, painted before the loader closes. */
export const previewWidthFor = (world: World) => (world.kind === 'moon' ? 128 : 256);

export function textureWidthFor(world: World): number {
  if (world.kind === 'moon') return world.id === 'moon' ? 512 : 256;
  if (world.kind === 'exoplanet') return 512;
  return ['earth', 'mars', 'jupiter', 'saturn'].includes(world.id) ? 1024 : 512;
}

export function createPlanetBody(
  world: World,
  radius: number,
  onPick: (id: string) => void,
  pixels: PixelSet,
  tiltDeg = 0,
): Body {
  const anchor = new THREE.Object3D();
  anchor.name = world.id;
  const tilt = new THREE.Object3D();
  tilt.rotation.z = THREE.MathUtils.degToRad(tiltDeg);
  anchor.add(tilt);

  const tex = pixelsToTextures(pixels);
  const mat = new THREE.MeshStandardMaterial({
    map: tex.map,
    bumpMap: tex.bump,
    bumpScale: world.kind === 'moon' || world.style === 'cratered' ? 2.2 : 1.2,
    roughness: world.style === 'ocean' || world.id === 'earth' ? 0.72 : 0.92,
    metalness: 0,
  });
  if (tex.emissive) {
    mat.emissiveMap = tex.emissive;
    mat.emissive = new THREE.Color(1, 1, 1);
    mat.emissiveIntensity = world.style === 'lava' ? 1.6 : 0.8;
  }
  const spin = new THREE.Mesh(world.kind === 'moon' ? lowSphere : sphere, mat);
  spin.scale.setScalar(radius);
  spin.name = `${world.id}-surface`;
  tilt.add(spin);

  const [label, labelEl] = makeLabel(world, onPick);
  const body: Body = { world, anchor, spin, radius, hit: new THREE.Mesh(lowSphere, hitMat), label, labelEl, texWidth: pixels.width };

  if (tex.clouds) {
    const clouds = new THREE.Mesh(
      sphere,
      new THREE.MeshStandardMaterial({ map: tex.clouds, transparent: true, depthWrite: false, roughness: 1 }),
    );
    clouds.scale.setScalar(radius * 1.012);
    tilt.add(clouds);
    body.clouds = clouds;
  }

  const exoAtmo = world.kind === 'exoplanet' ? EXO_ATMOSPHERE[world.style] : undefined;
  const atmo: [string, number, number] | null = ATMOSPHERES[world.id] ?? (exoAtmo ? [exoAtmo, 1.06, 1.1] : null);
  if (atmo) {
    const m = new THREE.Mesh(sphere, atmosphereMaterial(new THREE.Color(atmo[0]), atmo[2], atmo[1]));
    m.scale.setScalar(radius * atmo[1]);
    anchor.add(m);
    body.atmosphere = m;
  }

  if (world.id === 'saturn' || world.id === 'uranus') {
    const inner = radius * (world.id === 'saturn' ? 1.24 : 1.6);
    const outer = radius * (world.id === 'saturn' ? 2.3 : 2.05);
    const geo = new THREE.RingGeometry(inner, outer, 180, 1);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
    }
    const ring = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        map: paintRings(world.id),
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        roughness: 1,
        emissive: new THREE.Color('#2a241a'),
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.receiveShadow = true;
    tilt.add(ring);
  }

  body.hit.scale.setScalar(Math.max(radius * 1.25, 0.45));
  body.hit.userData.worldId = world.id;
  anchor.add(body.hit);
  body.label.position.set(radius * 1.05, radius * 0.55, 0);
  anchor.add(body.label);
  return body;
}

export function createStarBody(
  world: World,
  radius: number,
  color: THREE.Color,
  onPick: (id: string) => void,
  intensity = 1.6,
): Body {
  const anchor = new THREE.Object3D();
  anchor.name = world.id;
  const starMat = starMaterial(color, intensity);
  const spin = new THREE.Mesh(sphere, starMat);
  spin.scale.setScalar(radius);
  anchor.add(spin);

  const glowMat = new THREE.SpriteMaterial({
    map: glowTexture(`rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},1)`),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.75,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(radius * 5.5);
  anchor.add(glow);
  const corona = new THREE.Sprite(glowMat.clone());
  corona.material.opacity = 0.16;
  corona.scale.setScalar(radius * 13);
  anchor.add(corona);

  const [label, labelEl] = makeLabel(world, onPick);
  label.position.set(radius * 0.9, radius * 0.9, 0);
  anchor.add(label);
  const hit = new THREE.Mesh(lowSphere, hitMat);
  hit.scale.setScalar(radius * 1.1);
  hit.userData.worldId = world.id;
  anchor.add(hit);
  return { world, anchor, spin, radius, hit, label, labelEl, starMat, texWidth: 0 };
}

export function createOrbitLine(radius: number, color: string, opacity = 0.32): THREE.LineLoop {
  const pts: THREE.Vector3[] = [];
  const n = 256;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, -Math.sin(a) * radius));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const line = new THREE.LineLoop(geo, mat);
  line.userData.baseOpacity = opacity;
  return line;
}

/** Swap in a higher-resolution texture set, disposing the previous one. */
export function upgradeTextures(body: Body, pixels: PixelSet) {
  if (pixels.width <= body.texWidth) return;
  const tex: PlanetTextures = pixelsToTextures(pixels);
  const mat = (body.spin as THREE.Mesh).material as THREE.MeshStandardMaterial;
  const swap = (key: 'map' | 'bumpMap' | 'emissiveMap', t: THREE.Texture | undefined, m = mat) => {
    if (!t) return;
    m[key]?.dispose();
    m[key] = t;
  };
  swap('map', tex.map);
  swap('bumpMap', tex.bump);
  swap('emissiveMap', tex.emissive);
  if (body.clouds && tex.clouds) swap('map', tex.clouds, body.clouds.material as THREE.MeshStandardMaterial);
  mat.needsUpdate = true;
  body.texWidth = pixels.width;
}
