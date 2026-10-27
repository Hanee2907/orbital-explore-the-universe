// Mission state: favourites, compare tray and named collections.
// Pure reducers + a tiny store persisted to any Web Storage-like object.

export const STORAGE_KEY = 'orbital:missions:v1';
export const MAX_COMPARE = 4;
export const MAX_NAME_LENGTH = 48;

export interface Collection {
  id: string;
  name: string;
  worldIds: string[];
  createdAt: number;
}

export interface MissionState {
  version: 1;
  favourites: string[];
  compare: string[];
  collections: Collection[];
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const emptyState = (): MissionState => ({ version: 1, favourites: [], compare: [], collections: [] });

const uniqStrings = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : [];

/** Parse and validate persisted JSON; anything malformed falls back to defaults. */
export function parseState(json: string | null): MissionState {
  if (!json) return emptyState();
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return emptyState();
  }
  if (!data || typeof data !== 'object') return emptyState();
  const d = data as Record<string, unknown>;
  const collections = Array.isArray(d.collections)
    ? d.collections
        .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
        .filter((c) => typeof c.id === 'string' && typeof c.name === 'string')
        .map((c) => ({
          id: c.id as string,
          name: cleanName(c.name as string) || 'Untitled mission',
          worldIds: uniqStrings(c.worldIds),
          createdAt: typeof c.createdAt === 'number' ? c.createdAt : 0,
        }))
    : [];
  return {
    version: 1,
    favourites: uniqStrings(d.favourites),
    compare: uniqStrings(d.compare).slice(0, MAX_COMPARE),
    collections,
  };
}

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

export function toggleFavourite(s: MissionState, id: string): MissionState {
  const favourites = s.favourites.includes(id) ? s.favourites.filter((f) => f !== id) : [...s.favourites, id];
  return { ...s, favourites };
}

export type CompareResult = { state: MissionState; ok: boolean; reason?: 'full' | 'duplicate' };

export function addToCompare(s: MissionState, id: string): CompareResult {
  if (s.compare.includes(id)) return { state: s, ok: false, reason: 'duplicate' };
  if (s.compare.length >= MAX_COMPARE) return { state: s, ok: false, reason: 'full' };
  return { state: { ...s, compare: [...s.compare, id] }, ok: true };
}

export function removeFromCompare(s: MissionState, id: string): MissionState {
  return { ...s, compare: s.compare.filter((c) => c !== id) };
}

export function toggleCompare(s: MissionState, id: string): CompareResult {
  if (s.compare.includes(id)) return { state: removeFromCompare(s, id), ok: true };
  return addToCompare(s, id);
}

export function clearCompare(s: MissionState): MissionState {
  return { ...s, compare: [] };
}

export function createCollection(
  s: MissionState,
  name: string,
  opts: { id?: string; now?: number; worldIds?: string[] } = {},
): { state: MissionState; collection: Collection | null } {
  const clean = cleanName(name);
  if (!clean) return { state: s, collection: null };
  const collection: Collection = {
    id: opts.id ?? `col-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: clean,
    worldIds: [...new Set(opts.worldIds ?? [])],
    createdAt: opts.now ?? Date.now(),
  };
  return { state: { ...s, collections: [...s.collections, collection] }, collection };
}

const mapCollection = (s: MissionState, id: string, fn: (c: Collection) => Collection): MissionState => ({
  ...s,
  collections: s.collections.map((c) => (c.id === id ? fn(c) : c)),
});

export function renameCollection(s: MissionState, id: string, name: string): MissionState {
  const clean = cleanName(name);
  if (!clean) return s;
  return mapCollection(s, id, (c) => ({ ...c, name: clean }));
}

export function deleteCollection(s: MissionState, id: string): MissionState {
  return { ...s, collections: s.collections.filter((c) => c.id !== id) };
}

export function addToCollection(s: MissionState, id: string, worldId: string): MissionState {
  return mapCollection(s, id, (c) => (c.worldIds.includes(worldId) ? c : { ...c, worldIds: [...c.worldIds, worldId] }));
}

export function removeFromCollection(s: MissionState, id: string, worldId: string): MissionState {
  return mapCollection(s, id, (c) => ({ ...c, worldIds: c.worldIds.filter((w) => w !== worldId) }));
}

export function toggleInCollection(s: MissionState, id: string, worldId: string): MissionState {
  const col = s.collections.find((c) => c.id === id);
  if (!col) return s;
  return col.worldIds.includes(worldId) ? removeFromCollection(s, id, worldId) : addToCollection(s, id, worldId);
}

type Listener = (s: MissionState) => void;

/** Observable store that writes through to storage on every change. */
export class MissionStore {
  private state: MissionState;
  private listeners = new Set<Listener>();

  constructor(private storage: KeyValueStorage | null, private key = STORAGE_KEY) {
    let json: string | null = null;
    try {
      json = storage?.getItem(key) ?? null;
    } catch {
      json = null;
    }
    this.state = parseState(json);
  }

  get(): MissionState {
    return this.state;
  }

  set(next: MissionState): void {
    if (next === this.state) return;
    this.state = next;
    try {
      this.storage?.setItem(this.key, JSON.stringify(next));
    } catch {
      // Storage may be full or blocked (private mode); state still works in memory.
    }
    this.listeners.forEach((l) => l(next));
  }

  update(fn: (s: MissionState) => MissionState): void {
    this.set(fn(this.state));
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export class MemoryStorage implements KeyValueStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}
