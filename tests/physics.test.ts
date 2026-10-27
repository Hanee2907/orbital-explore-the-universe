import { describe, expect, it } from 'vitest';
import {
  daysSinceJ2000,
  equilibriumTemperature,
  estimateRadiusFromMass,
  habitableZone,
  inHabitableZone,
  meanAnomalyAt,
  sizeClass,
  starColor,
  surfaceGravity,
} from '../src/lib/physics';

describe('surfaceGravity', () => {
  it('returns Earth gravity for Earth mass and radius', () => {
    expect(surfaceGravity(1, 1)).toBeCloseTo(9.81, 2);
  });
  it('matches Mars within 5%', () => {
    expect(surfaceGravity(0.107, 0.532)!).toBeCloseTo(3.7, 0);
  });
  it('handles missing data', () => {
    expect(surfaceGravity(null, 1)).toBeNull();
    expect(surfaceGravity(1, 0)).toBeNull();
  });
});

describe('equilibriumTemperature', () => {
  it('gives ~255 K for Earth (albedo 0.3)', () => {
    expect(equilibriumTemperature(5772, 1, 1)!).toBeGreaterThan(250);
    expect(equilibriumTemperature(5772, 1, 1)!).toBeLessThan(258);
  });
  it('scales as a^-1/2', () => {
    const t1 = equilibriumTemperature(5772, 1, 1)!;
    const t4 = equilibriumTemperature(5772, 1, 4)!;
    expect(t1 / t4).toBeCloseTo(2, 5);
  });
  it('is null for pulsars / missing stellar data', () => {
    expect(equilibriumTemperature(null, null, 0.36)).toBeNull();
  });
});

describe('habitableZone', () => {
  it('brackets Earth for the Sun', () => {
    const hz = habitableZone(5772, 1)!;
    expect(hz.inner).toBeLessThan(1);
    expect(hz.outer).toBeGreaterThan(1);
    expect(inHabitableZone(1, 5772, 1)).toBe(true);
    expect(inHabitableZone(0.39, 5772, 1)).toBe(false);
  });
  it('places TRAPPIST-1 e inside and b outside', () => {
    expect(inHabitableZone(0.02925, 2566, 0.119)).toBe(true);
    expect(inHabitableZone(0.01154, 2566, 0.119)).toBe(false);
  });
});

describe('estimateRadiusFromMass', () => {
  it('is ~1 for one Earth mass', () => {
    expect(estimateRadiusFromMass(1)).toBeCloseTo(1, 5);
  });
  it('is continuous at the rocky/Neptunian boundary', () => {
    expect(estimateRadiusFromMass(2.039)!).toBeCloseTo(estimateRadiusFromMass(2.041)!, 1);
  });
  it('gives Jupiter-like radii for giant planets', () => {
    const r = estimateRadiusFromMass(317.8)!;
    expect(r).toBeGreaterThan(10);
    expect(r).toBeLessThan(16);
  });
});

describe('sizeClass', () => {
  it('classifies by radius', () => {
    expect(sizeClass(1, null)).toBe('Rocky');
    expect(sizeClass(1.6, null)).toBe('Super-Earth');
    expect(sizeClass(3.9, null)).toBe('Neptune-like');
    expect(sizeClass(11, null)).toBe('Gas giant');
  });
  it('falls back to mass', () => {
    expect(sizeClass(null, 146)).toBe('Gas giant');
    expect(sizeClass(null, null)).toBeNull();
  });
});

describe('orbits and colours', () => {
  it('J2000 epoch is day 0', () => {
    expect(daysSinceJ2000(new Date(Date.UTC(2000, 0, 1, 12)))).toBe(0);
  });
  it('mean anomaly wraps into [0, 2π)', () => {
    const a = meanAnomalyAt(350, 100, 5);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(Math.PI * 2);
    expect(a).toBeCloseTo((8 * Math.PI) / 180, 6);
  });
  it('cool stars are redder than hot stars', () => {
    const red = parseInt(starColor(3000).slice(5, 7), 16);
    const blue = parseInt(starColor(10000).slice(5, 7), 16);
    expect(blue).toBeGreaterThan(red);
  });
});
