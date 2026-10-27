import { describe, expect, it, vi } from 'vitest';
import {
  MAX_COMPARE,
  MemoryStorage,
  MissionStore,
  STORAGE_KEY,
  addToCollection,
  addToCompare,
  createCollection,
  deleteCollection,
  emptyState,
  parseState,
  removeFromCollection,
  renameCollection,
  toggleCompare,
  toggleFavourite,
  toggleInCollection,
} from '../src/lib/missions';

describe('favourites', () => {
  it('toggles on and off without duplicates', () => {
    let s = toggleFavourite(emptyState(), 'mars');
    expect(s.favourites).toEqual(['mars']);
    s = toggleFavourite(s, 'earth');
    s = toggleFavourite(s, 'mars');
    expect(s.favourites).toEqual(['earth']);
  });
  it('does not mutate the previous state', () => {
    const a = emptyState();
    toggleFavourite(a, 'mars');
    expect(a.favourites).toEqual([]);
  });
});

describe('compare tray', () => {
  it(`caps at ${MAX_COMPARE} worlds and rejects duplicates`, () => {
    let s = emptyState();
    for (const id of ['mercury', 'venus', 'earth', 'mars']) s = addToCompare(s, id).state;
    expect(s.compare).toHaveLength(4);
    const full = addToCompare(s, 'jupiter');
    expect(full.ok).toBe(false);
    expect(full.reason).toBe('full');
    const dup = addToCompare(emptyState(), 'x');
    expect(addToCompare(dup.state, 'x').reason).toBe('duplicate');
  });
  it('toggle removes an existing entry', () => {
    const s = toggleCompare(addToCompare(emptyState(), 'mars').state, 'mars');
    expect(s.state.compare).toEqual([]);
  });
});

describe('collections', () => {
  it('creates, renames, adds, removes and deletes', () => {
    let { state: s, collection } = createCollection(emptyState(), '  Habitable   candidates ', { id: 'c1', now: 1 });
    expect(collection?.name).toBe('Habitable candidates');
    s = addToCollection(s, 'c1', 'earth');
    s = addToCollection(s, 'c1', 'earth');
    s = addToCollection(s, 'c1', 'exo-trappist-1-e');
    expect(s.collections[0].worldIds).toEqual(['earth', 'exo-trappist-1-e']);
    s = removeFromCollection(s, 'c1', 'earth');
    s = toggleInCollection(s, 'c1', 'mars');
    expect(s.collections[0].worldIds).toEqual(['exo-trappist-1-e', 'mars']);
    s = renameCollection(s, 'c1', 'Shortlist');
    expect(s.collections[0].name).toBe('Shortlist');
    expect(renameCollection(s, 'c1', '   ').collections[0].name).toBe('Shortlist');
    s = deleteCollection(s, 'c1');
    expect(s.collections).toEqual([]);
  });
  it('rejects blank names and truncates long ones', () => {
    expect(createCollection(emptyState(), '   ').collection).toBeNull();
    expect(createCollection(emptyState(), 'x'.repeat(200)).collection!.name).toHaveLength(48);
  });
});

describe('parseState', () => {
  it('falls back to defaults on bad JSON', () => {
    expect(parseState('{not json')).toEqual(emptyState());
    expect(parseState(null)).toEqual(emptyState());
    expect(parseState('42')).toEqual(emptyState());
  });
  it('sanitises unexpected shapes', () => {
    const s = parseState(
      JSON.stringify({
        favourites: ['mars', 'mars', 3, null],
        compare: ['a', 'b', 'c', 'd', 'e'],
        collections: [{ id: 'k', name: 'Ok', worldIds: ['earth', 7] }, { name: 'missing id' }, null],
      }),
    );
    expect(s.favourites).toEqual(['mars']);
    expect(s.compare).toHaveLength(MAX_COMPARE);
    expect(s.collections).toEqual([{ id: 'k', name: 'Ok', worldIds: ['earth'], createdAt: 0 }]);
  });
});

describe('MissionStore persistence', () => {
  it('survives a "reload" through the same storage', () => {
    const storage = new MemoryStorage();
    const a = new MissionStore(storage);
    a.update((s) => toggleFavourite(s, 'mars'));
    a.update((s) => createCollection(s, 'Gas giants', { id: 'gg' }).state);
    a.update((s) => addToCollection(s, 'gg', 'jupiter'));

    const b = new MissionStore(storage);
    expect(b.get().favourites).toEqual(['mars']);
    expect(b.get().collections[0]).toMatchObject({ id: 'gg', name: 'Gas giants', worldIds: ['jupiter'] });
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).version).toBe(1);
  });

  it('notifies subscribers and supports unsubscribe', () => {
    const store = new MissionStore(new MemoryStorage());
    const fn = vi.fn();
    const off = store.subscribe(fn);
    store.update((s) => toggleFavourite(s, 'earth'));
    off();
    store.update((s) => toggleFavourite(s, 'earth'));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('keeps working when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    const store = new MissionStore(broken);
    store.update((s) => toggleFavourite(s, 'venus'));
    expect(store.get().favourites).toEqual(['venus']);
  });
});
