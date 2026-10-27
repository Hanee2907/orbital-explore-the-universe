// Small, dependency-free astrophysics helpers. Everything here is pure so it
// can be unit-tested without a browser.

export const EARTH_GRAVITY = 9.81; // m/s²
export const SUN_TEFF = 5772; // K
export const SUN_RADIUS_AU = 0.00465047;
export const DEFAULT_ALBEDO = 0.3;

/** Surface gravity (m/s²) from mass and radius in Earth units. */
export function surfaceGravity(massEarth: number | null, radiusEarth: number | null): number | null {
  if (massEarth == null || radiusEarth == null || radiusEarth <= 0) return null;
  return (EARTH_GRAVITY * massEarth) / (radiusEarth * radiusEarth);
}

/**
 * Planetary equilibrium temperature (K), assuming full heat redistribution:
 * T_eq = T_star · sqrt(R_star / 2a) · (1 − A)^¼
 */
export function equilibriumTemperature(
  teffK: number | null,
  starRadiusSun: number | null,
  semiMajorAxisAU: number | null,
  albedo = DEFAULT_ALBEDO,
): number | null {
  if (teffK == null || starRadiusSun == null || semiMajorAxisAU == null || semiMajorAxisAU <= 0) return null;
  const rStarAU = starRadiusSun * SUN_RADIUS_AU;
  return teffK * Math.sqrt(rStarAU / (2 * semiMajorAxisAU)) * Math.pow(1 - albedo, 0.25);
}

/** Stellar luminosity in solar units from Stefan–Boltzmann scaling. */
export function stellarLuminosity(teffK: number | null, radiusSun: number | null): number | null {
  if (teffK == null || radiusSun == null) return null;
  return radiusSun * radiusSun * Math.pow(teffK / SUN_TEFF, 4);
}

/**
 * Optimistic habitable zone (AU) from simple stellar-flux limits:
 * "recent Venus" ≈ 1.78 S⊕ inner edge and ≈ 0.25 S⊕ outer edge, roughly
 * Kopparapu et al. (2013) early-Mars limit for cool stars.
 */
export function habitableZone(teffK: number | null, radiusSun: number | null): { inner: number; outer: number } | null {
  const L = stellarLuminosity(teffK, radiusSun);
  if (L == null || L <= 0) return null;
  return { inner: Math.sqrt(L / 1.78), outer: Math.sqrt(L / 0.25) };
}

export function inHabitableZone(
  semiMajorAxisAU: number | null,
  teffK: number | null,
  radiusSun: number | null,
): boolean {
  const hz = habitableZone(teffK, radiusSun);
  if (!hz || semiMajorAxisAU == null) return false;
  return semiMajorAxisAU >= hz.inner && semiMajorAxisAU <= hz.outer;
}

/**
 * Radius (Earth radii) estimated from mass using the piecewise power laws of
 * Chen & Kipping (2017, "Forecaster"): rocky, Neptunian and Jovian regimes.
 */
export function estimateRadiusFromMass(massEarth: number | null): number | null {
  if (massEarth == null || massEarth <= 0) return null;
  if (massEarth < 2.04) return Math.pow(massEarth, 0.279);
  const neptunian = (m: number) => 0.808 * Math.pow(m, 0.589);
  if (massEarth < 132) return neptunian(massEarth);
  return neptunian(132) * Math.pow(massEarth / 132, -0.044);
}

export type SizeClass = 'Rocky' | 'Super-Earth' | 'Neptune-like' | 'Gas giant';

export const SIZE_CLASSES: SizeClass[] = ['Rocky', 'Super-Earth', 'Neptune-like', 'Gas giant'];

/** Coarse classification by radius (Earth radii), falling back to mass. */
export function sizeClass(radiusEarth: number | null, massEarth: number | null): SizeClass | null {
  const r = radiusEarth ?? estimateRadiusFromMass(massEarth);
  if (r == null) return null;
  if (r < 1.25) return 'Rocky';
  if (r < 2.5) return 'Super-Earth';
  if (r < 7) return 'Neptune-like';
  return 'Gas giant';
}

/** Approximate blackbody colour of a star as a hex string. */
export function starColor(teffK: number | null): string {
  const t = teffK ?? 5772;
  const stops: [number, [number, number, number]][] = [
    [2500, [255, 140, 70]],
    [3500, [255, 178, 110]],
    [5000, [255, 222, 170]],
    [5800, [255, 244, 225]],
    [7500, [222, 232, 255]],
    [10000, [180, 205, 255]],
    [30000, [155, 176, 255]],
  ];
  if (t <= stops[0][0]) return toHex(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i];
    const [t0, c0] = stops[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return toHex([0, 1, 2].map((j) => c0[j] + (c1[j] - c0[j]) * k) as [number, number, number]);
    }
  }
  return toHex(stops[stops.length - 1][1]);
}

function toHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** Days since the J2000.0 epoch (2000-01-01 12:00 TT ≈ UTC). */
export function daysSinceJ2000(date: Date): number {
  return (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
}

/** Mean orbital angle (radians) for a circular orbit at a given date. */
export function meanAnomalyAt(meanLongitudeJ2000Deg: number, periodDays: number, days: number): number {
  const deg = meanLongitudeJ2000Deg + (360 * days) / periodDays;
  return (((deg % 360) + 360) % 360) * (Math.PI / 180);
}
