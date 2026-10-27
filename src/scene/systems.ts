import * as THREE from 'three';
import { MOONS, ORBITS, PLANETS, SUN } from '../data/solarSystem';
import type { Exoplanet, World } from '../data/types';
import { exoplanetToWorld, systemOf } from '../lib/exoplanets';
import { habitableZone, meanAnomalyAt, starColor } from '../lib/physics';
import {
  type Body,
  createOrbitLine,
  createPlanetBody,
  createStarBody,
  previewWidthFor,
  textureWidthFor,
  upgradeTextures,
} from './bodies';
import type { PixelSet } from './painters';
import { texturePool } from './texturePool';

export interface OrbitState {
  body: Body;
  distance: number;
  periodDays: number;
  phase: number;
  pivot: THREE.Object3D;
  rotationHours: number;
}

export interface SystemView {
  group: THREE.Group;
  bodies: Body[];
  star: Body;
  orbits: OrbitState[];
  /** Overview camera position (target is always the origin). */
  overview: THREE.Vector3;
  /** Called with elapsed simulated days for orbits and real seconds for effects. */
  update(simDays: number, dtDays: number, realTime: number): void;
  dispose(): void;
}

export const planetRadius = (rEarth: number) => 0.45 + 0.55 * Math.sqrt(rEarth);
export const planetDistance = (au: number) => 10 + 18 * Math.pow(au, 0.55);
const moonRadius = (rEarth: number) => Math.max(0.07, 0.5 * Math.sqrt(rEarth));

/** Moons orbit at compressed periods so fast inner moons stay readable. */
const visualMoonPeriod = (days: number) => 8 * Math.sqrt(days);

const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));

/** Paint preview textures for all worlds in parallel, reporting progress as each lands. */
async function paintPreviews(worlds: World[], onEach: (w: World) => void): Promise<Map<string, PixelSet>> {
  const out = new Map<string, PixelSet>();
  await Promise.all(
    worlds.map((w) =>
      texturePool.paint(w, previewWidthFor(w)).then((px) => {
        out.set(w.id, px);
        onEach(w);
      }),
    ),
  );
  return out;
}

/** Queue full-resolution textures in the background and swap them in as they finish. */
function upgradeLater(bodies: Body[], isAlive: () => boolean) {
  for (const b of bodies) {
    if (b.world.kind === 'star') continue;
    void texturePool.paint(b.world, textureWidthFor(b.world)).then((px) => {
      if (isAlive()) upgradeTextures(b, px);
    });
  }
}

function spinBody(o: OrbitState, dtDays: number) {
  if (!o.rotationHours) return;
  const rate = (24 / o.rotationHours) * Math.PI * 2 * 0.02;
  const capped = Math.sign(rate) * Math.min(Math.abs(rate), 0.5);
  o.body.spin.rotation.y += capped * dtDays;
  if (o.body.clouds) o.body.clouds.rotation.y += capped * dtDays * 1.15;
}

export async function buildSolarSystem(
  onPick: (id: string) => void,
  onProgress: (fraction: number, label: string) => void,
): Promise<SystemView> {
  const group = new THREE.Group();
  group.name = 'solar-system';
  const sun = createStarBody(SUN, 6, new THREE.Color('#ffb04a'), onPick, 1.8);
  group.add(sun.anchor);
  const bodies: Body[] = [sun];
  const orbits: OrbitState[] = [];
  const total = PLANETS.length + MOONS.length;
  let done = 0;
  const previews = await paintPreviews([...PLANETS, ...MOONS], (w) => onProgress(++done / total, `Mapping ${w.name}`));

  const planetBodies = new Map<string, Body>();
  for (const p of PLANETS) {
    const spec = ORBITS[p.id];
    const r = planetRadius(p.radiusEarth!);
    const d = planetDistance(p.distance!);
    const pivot = new THREE.Object3D();
    pivot.rotation.x = THREE.MathUtils.degToRad(spec.inclinationDeg);
    group.add(pivot);
    const body = createPlanetBody(p, r, onPick, previews.get(p.id)!, p.axialTiltDeg ?? 0);
    body.orbit = createOrbitLine(d, p.color);
    pivot.add(body.orbit);
    pivot.add(body.anchor);
    bodies.push(body);
    planetBodies.set(p.id, body);
    orbits.push({
      body,
      distance: d,
      periodDays: p.yearDays!,
      phase: THREE.MathUtils.degToRad(spec.meanLongitudeJ2000 ?? 0),
      pivot,
      rotationHours: spec.rotationHours,
    });
  }

  const rankByParent = new Map<string, number>();
  for (const m of [...MOONS].sort((a, b) => a.distance! - b.distance!)) {
    const parent = planetBodies.get(m.parent)!;
    const rank = rankByParent.get(m.parent) ?? 0;
    rankByParent.set(m.parent, rank + 1);
    const pivot = new THREE.Object3D();
    pivot.rotation.x = THREE.MathUtils.degToRad(ORBITS[m.id].inclinationDeg);
    parent.anchor.add(pivot);
    const r = moonRadius(m.radiusEarth!);
    const d = parent.radius * 1.6 + 0.6 + rank * (0.55 + parent.radius * 0.38);
    const body = createPlanetBody(m, r, onPick, previews.get(m.id)!);
    body.parentBody = parent;
    body.orbit = createOrbitLine(d, m.color, 0.18);
    pivot.add(body.orbit, body.anchor);
    bodies.push(body);
    orbits.push({
      body,
      distance: d,
      periodDays: visualMoonPeriod(m.yearDays!),
      phase: (rank * 2.1 + m.name.length) % (Math.PI * 2),
      pivot,
      rotationHours: ORBITS[m.id].rotationHours,
    });
  }
  onProgress(1, 'Systems nominal');
  await yieldFrame();
  upgradeLater(bodies, () => true);

  const view: SystemView = {
    group,
    bodies,
    star: sun,
    orbits,
    overview: new THREE.Vector3(0, 95, 175),
    update(simDays, dtDays, realTime) {
      for (const o of orbits) {
        const isPlanet = o.body.world.kind === 'planet';
        const a = isPlanet
          ? meanAnomalyAt(THREE.MathUtils.radToDeg(o.phase), o.periodDays, simDays)
          : o.phase + (simDays / o.periodDays) * Math.PI * 2;
        o.body.anchor.position.set(Math.cos(a) * o.distance, 0, -Math.sin(a) * o.distance);
        spinBody(o, dtDays);
      }
      sun.spin.rotation.y += dtDays * 0.01;
      sun.starMat!.uniforms.uTime.value = realTime;
    },
    dispose() {
      disposeGroup(group);
    },
  };
  view.update(0, 0, 0);
  return view;
}

export interface ExoSystemView extends SystemView {
  host: string;
  worlds: World[];
}

export async function buildExoSystem(host: string, onPick: (id: string) => void): Promise<ExoSystemView> {
  const planets: Exoplanet[] = systemOf(host);
  const star = planets[0].star;
  const group = new THREE.Group();
  group.name = `exo-${host}`;
  const isPulsar = star.teffK == null;
  const color = new THREE.Color(isPulsar ? '#bcd7ff' : starColor(star.teffK));
  const starR = isPulsar ? 1.2 : 3 + 2.2 * Math.sqrt(star.radiusSun ?? 1);
  const starWorld: World = {
    id: `star-${host}`,
    name: host,
    kind: 'star',
    parent: 'Milky Way',
    radiusEarth: star.radiusSun != null ? star.radiusSun * 109.1 : null,
    massEarth: null,
    gravity: null,
    dayHours: null,
    yearDays: null,
    temperatureK: star.teffK,
    temperatureNote: 'Stellar effective temperature',
    moons: null,
    distance: null,
    distanceUnit: 'AU',
    distanceFromEarthLy: planets[0].distanceLy,
    discovery: { year: null, by: '—', method: 'Telescope' },
    summary: `${star.spectralType} host star of ${planets.length} catalogued planet${planets.length > 1 ? 's' : ''} in this dataset.`,
    sources: [
      {
        label: 'NASA Exoplanet Archive — system overview',
        url: `https://exoplanetarchive.ipac.caltech.edu/overview/${encodeURIComponent(host)}`,
      },
    ],
    style: 'sun',
    color: `#${color.getHexString()}`,
  };
  const starBody = createStarBody(starWorld, starR, color, onPick, isPulsar ? 2.6 : 1.7);
  group.add(starBody.anchor);

  const maxA = Math.max(...planets.map((p) => p.semiMajorAxisAU ?? 1));
  const scaleA = (a: number) => starR + 8 + 62 * Math.sqrt(a / maxA);
  const worlds = planets.map(exoplanetToWorld);
  const bodies: Body[] = [starBody];
  const orbits: OrbitState[] = [];
  const minPeriod = Math.min(...planets.map((p) => p.periodDays ?? Infinity));

  const previews = await paintPreviews(worlds, () => {});
  let alive = true;
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    const w = worlds[i];
    const d = scaleA(p.semiMajorAxisAU ?? maxA);
    const r = Math.min(planetRadius(w.radiusEarth ?? 1), starR * 0.6);
    const pivot = new THREE.Object3D();
    pivot.rotation.x = THREE.MathUtils.degToRad((i % 3) * 0.8);
    group.add(pivot);
    const body = createPlanetBody(w, r, onPick, previews.get(w.id)!, 12);
    body.orbit = createOrbitLine(d, w.color, 0.4);
    pivot.add(body.orbit, body.anchor);
    bodies.push(body);
    orbits.push({
      body,
      distance: d,
      periodDays: ((p.periodDays ?? 365) / minPeriod) * 6,
      phase: i * 2.4,
      pivot,
      rotationHours: 30,
    });
  }

  const hz = habitableZone(star.teffK, star.radiusSun);
  if (hz && hz.inner < maxA * 2.5) {
    const inner = scaleA(hz.inner);
    const outer = Math.min(scaleA(hz.outer), scaleA(maxA * 2.5));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 160, 1),
      new THREE.MeshBasicMaterial({
        color: '#34d399',
        transparent: true,
        opacity: 0.045,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.name = 'habitable-zone';
    group.add(ring);
    for (const rr of [inner, outer]) {
      const edge = createOrbitLine(rr, '#34d399', 0.25);
      group.add(edge);
    }
  }

  const far = scaleA(maxA) + 10;
  const view: ExoSystemView = {
    host,
    worlds,
    group,
    bodies,
    star: starBody,
    orbits,
    overview: new THREE.Vector3(0, far * 0.75, far * 1.35),
    update(simDays, dtDays, realTime) {
      // Exo systems run on their own clock: the innermost planet orbits every ~3 s at 2 days/s.
      for (const o of orbits) {
        const a = o.phase + (simDays / o.periodDays) * Math.PI * 2;
        o.body.anchor.position.set(Math.cos(a) * o.distance, 0, -Math.sin(a) * o.distance);
        spinBody(o, dtDays);
      }
      starBody.starMat!.uniforms.uTime.value = realTime;
    },
    dispose() {
      alive = false;
      disposeGroup(group);
    },
  };
  view.update(0, 0, 0);
  upgradeLater(bodies, () => alive);
  return view;
}

function disposeGroup(group: THREE.Object3D) {
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && m.geometry.type !== 'SphereGeometry') m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
    if ((o as unknown as { element?: HTMLElement }).element) (o as unknown as { element: HTMLElement }).element.remove();
  });
  group.removeFromParent();
}
