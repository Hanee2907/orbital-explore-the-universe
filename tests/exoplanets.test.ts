import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTER,
  EXOPLANETS,
  exoId,
  exoTemperature,
  exoplanetToWorld,
  filterExoplanets,
  isPotentiallyHabitable,
  systemOf,
} from '../src/lib/exoplanets';
import { ALL_WORLDS, fmt, getWorld } from '../src/lib/worlds';

describe('exoplanet dataset', () => {
  it('has between 30 and 60 planets with unique ids', () => {
    expect(EXOPLANETS.length).toBeGreaterThanOrEqual(30);
    expect(EXOPLANETS.length).toBeLessThanOrEqual(60);
    const ids = new Set(EXOPLANETS.map(exoId));
    expect(ids.size).toBe(EXOPLANETS.length);
  });

  it('includes the headline worlds', () => {
    const names = EXOPLANETS.map((p) => p.name);
    for (const n of ['Proxima Centauri b', 'Kepler-452 b', '51 Pegasi b', 'HD 209458 b', 'TRAPPIST-1 e']) {
      expect(names).toContain(n);
    }
  });

  it('has plausible values for every record', () => {
    for (const p of EXOPLANETS) {
      expect(p.distanceLy).toBeGreaterThan(0);
      expect(p.discoveryYear).toBeGreaterThanOrEqual(1992);
      expect(p.discoveryYear).toBeLessThanOrEqual(2026);
      expect(p.radiusEarth ?? p.massEarth).not.toBeNull();
    }
  });

  it('all world ids are unique across solar system and exoplanets', () => {
    expect(new Set(ALL_WORLDS.map((w) => w.id)).size).toBe(ALL_WORLDS.length);
  });
});

describe('filterExoplanets', () => {
  it('returns everything with the default filter, sorted by distance', () => {
    const out = filterExoplanets(EXOPLANETS, DEFAULT_FILTER);
    expect(out).toHaveLength(EXOPLANETS.length);
    expect(out[0].host).toBe('Proxima Centauri');
    for (let i = 1; i < out.length; i++) expect(out[i].distanceLy).toBeGreaterThanOrEqual(out[i - 1].distanceLy);
  });

  it('searches name and host, case-insensitively', () => {
    const out = filterExoplanets(EXOPLANETS, { ...DEFAULT_FILTER, query: 'trappist' });
    expect(out).toHaveLength(7);
  });

  it('filters by method and distance', () => {
    const out = filterExoplanets(EXOPLANETS, {
      ...DEFAULT_FILTER,
      methods: ['Radial Velocity'],
      maxDistanceLy: 20,
    });
    expect(out.length).toBeGreaterThan(0);
    for (const p of out) {
      expect(p.method).toBe('Radial Velocity');
      expect(p.distanceLy).toBeLessThanOrEqual(20);
    }
  });

  it('habitable-only keeps temperate small worlds', () => {
    const out = filterExoplanets(EXOPLANETS, { ...DEFAULT_FILTER, habitableOnly: true });
    expect(out.map((p) => p.name)).toContain('TRAPPIST-1 e');
    expect(out.map((p) => p.name)).not.toContain('51 Pegasi b');
    expect(out.every(isPotentiallyHabitable)).toBe(true);
  });

  it('sorts by discovery year, newest first', () => {
    const out = filterExoplanets(EXOPLANETS, { ...DEFAULT_FILTER, sort: 'year' });
    expect(out[0].discoveryYear).toBe(Math.max(...EXOPLANETS.map((p) => p.discoveryYear)));
  });
});

describe('exoplanetToWorld', () => {
  it('estimates radius and gravity when only mass is known', () => {
    const p = EXOPLANETS.find((x) => x.name === 'Proxima Centauri b')!;
    const w = exoplanetToWorld(p);
    expect(w.radiusEstimated).toBe(true);
    expect(w.radiusEarth).toBeCloseTo(1.02, 1);
    expect(w.gravity).toBeGreaterThan(8);
    expect(w.sources[0].url).toContain('exoplanetarchive.ipac.caltech.edu');
  });

  it('prefers literature temperature over the estimate', () => {
    const kelt = EXOPLANETS.find((x) => x.name === 'KELT-9 b')!;
    expect(exoTemperature(kelt)).toBe(4600);
  });

  it('groups systems inner to outer', () => {
    const sys = systemOf('TRAPPIST-1');
    expect(sys.map((p) => p.name.slice(-1)).join('')).toBe('bcdefgh');
  });

  it('is registered in the world index', () => {
    expect(getWorld('exo-kepler-452-b')?.name).toBe('Kepler-452 b');
    expect(getWorld('mars')?.moons).toBe(2);
  });
});

describe('fmt', () => {
  it('formats by magnitude', () => {
    expect(fmt(null)).toBe('—');
    expect(fmt(0.5)).toBe('0.5');
    expect(fmt(12.345)).toBe('12.35');
    expect(fmt(333000)).toBe('333,000');
    expect(fmt(1.8e-9)).toBe('1.80e-9');
  });
});
