import raw from '../data/exoplanets.json';
import type { DiscoveryMethod, Exoplanet, SurfaceStyle, World } from '../data/types';
import {
  equilibriumTemperature,
  estimateRadiusFromMass,
  inHabitableZone,
  sizeClass,
  surfaceGravity,
  type SizeClass,
} from './physics';

export const EXOPLANETS: Exoplanet[] = raw as Exoplanet[];

export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const exoId = (p: Pick<Exoplanet, 'name'>) => `exo-${slug(p.name)}`;

export function exoTemperature(p: Exoplanet): number | null {
  if (p.temperatureK != null) return p.temperatureK;
  return equilibriumTemperature(p.star.teffK, p.star.radiusSun, p.semiMajorAxisAU);
}

export function isPotentiallyHabitable(p: Exoplanet): boolean {
  const cls = sizeClass(p.radiusEarth, p.massEarth);
  return (
    inHabitableZone(p.semiMajorAxisAU, p.star.teffK, p.star.radiusSun) &&
    (cls === 'Rocky' || cls === 'Super-Earth')
  );
}

function surfaceStyleFor(p: Exoplanet, tempK: number | null): SurfaceStyle {
  const cls = sizeClass(p.radiusEarth, p.massEarth);
  const t = tempK ?? 250;
  if (cls === 'Gas giant' || cls === 'Neptune-like') return t < 150 ? 'ice-giant' : 'gas';
  if (t > 700) return 'lava';
  if (t > 330) return 'venus';
  if (t < 200) return 'ice';
  if (cls === 'Super-Earth' && isPotentiallyHabitable(p)) return 'ocean';
  return isPotentiallyHabitable(p) ? 'earth' : 'rocky';
}

function accentFor(style: SurfaceStyle): string {
  const map: Partial<Record<SurfaceStyle, string>> = {
    lava: '#ff6a3d',
    venus: '#e9c27a',
    ice: '#bfe3ff',
    ocean: '#38bdf8',
    earth: '#4ade80',
    rocky: '#c4a484',
    gas: '#f5b971',
    'ice-giant': '#7dd3fc',
  };
  return map[style] ?? '#a5b4fc';
}

/** Normalise an exoplanet record into the shared World shape. */
export function exoplanetToWorld(p: Exoplanet): World {
  const temp = exoTemperature(p);
  const estimatedRadius = p.radiusEarth == null ? estimateRadiusFromMass(p.massEarth) : null;
  const radius = p.radiusEarth ?? estimatedRadius;
  const style = surfaceStyleFor(p, temp);
  return {
    id: exoId(p),
    name: p.name,
    kind: 'exoplanet',
    parent: p.host,
    radiusEarth: radius,
    radiusEstimated: p.radiusEarth == null && radius != null,
    massEarth: p.massEarth,
    massIsMinimum: p.massIsMinimum,
    gravity: surfaceGravity(p.massEarth, radius),
    dayHours: null,
    yearDays: p.periodDays,
    temperatureK: temp,
    temperatureNote:
      p.temperatureNote ?? (temp != null ? 'Estimated equilibrium temperature (albedo 0.3)' : 'Unknown — no stellar data'),
    moons: null,
    distance: p.semiMajorAxisAU,
    distanceUnit: 'AU',
    distanceFromEarthLy: p.distanceLy,
    discovery: { year: p.discoveryYear, by: p.facility, method: p.method, facility: p.facility },
    summary: p.note,
    sources: [
      {
        label: 'NASA Exoplanet Archive — system overview',
        url: `https://exoplanetarchive.ipac.caltech.edu/overview/${encodeURIComponent(p.host)}`,
      },
      { label: 'NASA Exoplanet Catalog', url: 'https://science.nasa.gov/exoplanets/exoplanet-catalog/' },
      { label: 'NASA Eyes on Exoplanets', url: 'https://eyes.nasa.gov/apps/exo/' },
    ],
    style,
    color: accentFor(style),
  };
}

export type SortKey = 'distance' | 'year' | 'radius' | 'temperature' | 'name';

export interface ExoFilter {
  query: string;
  methods: DiscoveryMethod[];
  sizes: SizeClass[];
  maxDistanceLy: number | null;
  habitableOnly: boolean;
  sort: SortKey;
}

export const DEFAULT_FILTER: ExoFilter = {
  query: '',
  methods: [],
  sizes: [],
  maxDistanceLy: null,
  habitableOnly: false,
  sort: 'distance',
};

export function filterExoplanets(list: Exoplanet[], f: ExoFilter): Exoplanet[] {
  const q = f.query.trim().toLowerCase();
  const out = list.filter((p) => {
    if (q && !`${p.name} ${p.host} ${p.facility}`.toLowerCase().includes(q)) return false;
    if (f.methods.length && !f.methods.includes(p.method)) return false;
    if (f.sizes.length) {
      const cls = sizeClass(p.radiusEarth, p.massEarth);
      if (!cls || !f.sizes.includes(cls)) return false;
    }
    if (f.maxDistanceLy != null && p.distanceLy > f.maxDistanceLy) return false;
    if (f.habitableOnly && !isPotentiallyHabitable(p)) return false;
    return true;
  });
  const val = (p: Exoplanet): number | string => {
    switch (f.sort) {
      case 'distance':
        return p.distanceLy;
      case 'year':
        return -p.discoveryYear;
      case 'radius':
        return -(p.radiusEarth ?? estimateRadiusFromMass(p.massEarth) ?? 0);
      case 'temperature':
        return -(exoTemperature(p) ?? -Infinity);
      case 'name':
        return p.name.toLowerCase();
    }
  };
  return out.sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va < vb) return -1;
    if (va > vb) return 1;
    return a.name.localeCompare(b.name);
  });
}

/** All dataset planets that share a host star, inner to outer. */
export function systemOf(host: string, list: Exoplanet[] = EXOPLANETS): Exoplanet[] {
  return list
    .filter((p) => p.host === host)
    .sort((a, b) => (a.semiMajorAxisAU ?? 0) - (b.semiMajorAxisAU ?? 0));
}

export const ALL_METHODS: DiscoveryMethod[] = [
  'Transit',
  'Radial Velocity',
  'Direct Imaging',
  'Microlensing',
  'Pulsar Timing',
];
