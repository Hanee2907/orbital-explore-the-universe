import { SOLAR_WORLDS } from '../data/solarSystem';
import type { World } from '../data/types';
import { EXOPLANETS, exoplanetToWorld } from './exoplanets';

export const ALL_WORLDS: World[] = [...SOLAR_WORLDS, ...EXOPLANETS.map(exoplanetToWorld)];

const byId = new Map(ALL_WORLDS.map((w) => [w.id, w]));

export const getWorld = (id: string): World | undefined => byId.get(id);

export const EARTH = byId.get('earth')!;

const nf = (max: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: max });

/** Format a number with sensible precision for its magnitude. */
export function fmt(n: number | null | undefined, unit = ''): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  let s: string;
  if (a !== 0 && (a < 0.001 || a >= 1e7)) s = n.toExponential(2).replace('e+', 'e');
  else if (a < 1) s = nf(3).format(n);
  else if (a < 100) s = nf(2).format(n);
  else s = nf(0).format(n);
  return unit ? `${s} ${unit}` : s;
}

export function fmtDuration(hours: number | null): string {
  if (hours == null) return '—';
  const h = Math.abs(hours);
  const retro = hours < 0 ? ' (retrograde)' : '';
  if (h < 48) return `${fmt(h)} h${retro}`;
  return `${fmt(h / 24)} days${retro}`;
}

export function fmtYear(days: number | null): string {
  if (days == null) return '—';
  if (days < 2) return `${fmt(days * 24)} h`;
  if (days < 1000) return `${fmt(days)} days`;
  return `${fmt(days / 365.25)} years`;
}

export function fmtTemp(k: number | null): string {
  if (k == null) return '—';
  return `${Math.round(k).toLocaleString('en-US')} K · ${Math.round(k - 273.15).toLocaleString('en-US')} °C`;
}

export function fmtDistance(w: World): string {
  if (w.distance == null) return '—';
  return w.distanceUnit === 'AU' ? `${fmt(w.distance)} AU` : `${fmt(w.distance)} km`;
}

export function kindLabel(w: World): string {
  switch (w.kind) {
    case 'star':
      return 'Star';
    case 'planet':
      return 'Planet';
    case 'dwarf':
      return 'Dwarf planet';
    case 'moon':
      return `Moon of ${getWorld(w.parent)?.name ?? w.parent}`;
    case 'exoplanet':
      return `Exoplanet · ${w.parent}`;
  }
}
