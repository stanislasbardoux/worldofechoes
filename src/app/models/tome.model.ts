/**
 * Data model for the World of Echoes app.
 *
 * Coordinates are stored as **percentages of the source image** (0–100,
 * top-left origin, x to the right, y down). This makes pin positions
 * resolution-independent — you can swap in a higher-res map without
 * re-authoring any data, as long as the image's *aspect ratio* matches.
 *
 * A {@link FarmLocation} is one farming spot on one map. The logical
 * "Tome of Echo" is identified by `tomeId`; many locations can share
 * the same `tomeId` (that's how we generate the cross-link list).
 */

export type ZoneId =
  | 'eastern-kingdoms'
  | 'kalimdor'
  | 'outland'
  | 'northrend';

export type TomeRarity = 'epic' | 'rare';

/** Canonical WoW item-quality colors used in the UI. */
export const RARITY_COLORS: Record<TomeRarity, string> = {
  epic: 'var(--woe-epic, #a335ee)',
  rare: 'var(--woe-rare, #0070dd)',
};

export type Spec = 'tank' | 'caster-dps' | 'melee-dps' | 'ranged-dps';

export const ALL_SPECS: readonly Spec[] = [
  'tank',
  'caster-dps',
  'melee-dps',
  'ranged-dps',
] as const;

export const SPEC_LABELS: Record<Spec, string> = {
  tank: 'Tank',
  'caster-dps': 'Caster DPS',
  'melee-dps': 'Melee DPS',
  'ranged-dps': 'Ranged DPS',
};

export interface ZoneConfig {
  id: ZoneId;
  name: string;
  /** URL relative to /assets. Native dimensions are detected at runtime. */
  imageUrl: string;
}

export interface FarmLocation {
  /** Unique id (uuid v4). */
  id: string;
  /** Logical tome this location belongs to. */
  tomeId: string;
  /** Display name of the tome (same for every location of the same tome). */
  tomeName: string;
  /** Color/quality (purple = epic, blue = rare). */
  rarity: TomeRarity;
  /** Which map this point lives on. */
  zone: ZoneId;
  /** X position as a percentage (0–100) of the map image width. */
  x: number;
  /** Y position as a percentage (0–100) of the map image height. */
  y: number;
  /** Name of this specific farm spot. */
  placeName: string;
  /** Mobs to kill at this spot. */
  mobs: string[];
  /** Recommended specs. */
  specs: Spec[];
  /** Optional free-form notes. */
  notes?: string;
}

export interface TomeDataFile {
  zones: ZoneConfig[];
  locations: FarmLocation[];
}

export const ZONE_LIST: ZoneConfig[] = [
  {
    id: 'eastern-kingdoms',
    name: 'Eastern Kingdoms',
    imageUrl: 'assets/maps/eastern-kingdoms.webp',
  },
  {
    id: 'kalimdor',
    name: 'Kalimdor',
    imageUrl: 'assets/maps/kalimdor.webp',
  },
  {
    id: 'outland',
    name: 'Outland',
    imageUrl: 'assets/maps/outland.webp',
  },
  {
    id: 'northrend',
    name: 'Northrend',
    imageUrl: 'assets/maps/northrend.webp',
  },
];

/** Round a coordinate to one decimal place for clean JSON / display. */
export function roundCoord(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Clamp a value into [min, max]. */
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
