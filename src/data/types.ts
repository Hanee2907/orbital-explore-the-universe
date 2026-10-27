export type WorldKind = 'star' | 'planet' | 'dwarf' | 'moon' | 'exoplanet';

export type DiscoveryMethod =
  | 'Transit'
  | 'Radial Velocity'
  | 'Direct Imaging'
  | 'Microlensing'
  | 'Pulsar Timing'
  | 'Ancient observation'
  | 'Telescope';

/** Visual recipe used by the procedural texture generator. */
export type SurfaceStyle =
  | 'sun'
  | 'rocky'
  | 'cratered'
  | 'earth'
  | 'venus'
  | 'mars'
  | 'gas'
  | 'ice-giant'
  | 'lava'
  | 'ice'
  | 'ocean'
  | 'hazy';

export interface SourceLink {
  label: string;
  url: string;
}

/**
 * A single world, normalised so the command panel, charts and compare view can
 * treat Solar System bodies and exoplanets the same way. Unknown values are null.
 */
export interface World {
  id: string;
  name: string;
  kind: WorldKind;
  /** Planet the moon orbits, or host star name for exoplanets. */
  parent: string;
  /** Mean radius in Earth radii. */
  radiusEarth: number | null;
  /** True when radius is estimated from a mass–radius relation, not measured. */
  radiusEstimated?: boolean;
  /** Mass in Earth masses (minimum mass for radial-velocity planets). */
  massEarth: number | null;
  massIsMinimum?: boolean;
  /** Surface (or 1-bar) gravity in m/s². */
  gravity: number | null;
  /** Length of a solar day / rotation period in hours (negative = retrograde). */
  dayHours: number | null;
  /** Orbital period around the parent, in Earth days. */
  yearDays: number | null;
  /** Mean surface / equilibrium temperature in kelvin. */
  temperatureK: number | null;
  temperatureNote?: string;
  moons: number | null;
  /** Mean distance from the parent body. AU for planets, km for moons. */
  distance: number | null;
  distanceUnit: 'AU' | 'km';
  /** Distance from Earth in light years (exoplanets and stars). */
  distanceFromEarthLy?: number | null;
  axialTiltDeg?: number;
  discovery: {
    year: number | null;
    by: string;
    method: DiscoveryMethod;
    facility?: string;
  };
  summary: string;
  sources: SourceLink[];
  style: SurfaceStyle;
  /** Base colour used for UI accents and orbit lines. */
  color: string;
}

export interface Exoplanet {
  name: string;
  host: string;
  /** Distance from the Sun in light years. */
  distanceLy: number;
  radiusEarth: number | null;
  massEarth: number | null;
  /** True when mass is a minimum (m sin i) from radial velocity. */
  massIsMinimum?: boolean;
  periodDays: number | null;
  semiMajorAxisAU: number | null;
  discoveryYear: number;
  method: DiscoveryMethod;
  facility: string;
  star: {
    spectralType: string;
    teffK: number | null;
    radiusSun: number | null;
  };
  /** Measured / literature temperature that overrides the equilibrium estimate. */
  temperatureK?: number;
  temperatureNote?: string;
  note: string;
}
