import { describe, expect, it } from 'vitest';
import {
  dropOtherVersions,
  expandIcon,
  extractWeapon,
  extractWeaponsFromChunks,
  getManifestInfo,
  packIndex,
  readCachedIndex,
  shortenIcon,
  TableScanner,
  unpackIndex,
  writeCachedIndex,
  type WeaponIndex
} from '../src/manifest';

/** A localStorage stand in, since these tests run under node. */
function fakeStore(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear()
  } as Storage;
}

async function* chunks(text: string, size: number): AsyncIterable<string> {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

const WEAPON = {
  itemType: 3,
  itemSubType: 9,
  defaultDamageType: 1,
  itemTypeDisplayName: 'Hand Cannon',
  displayProperties: {
    name: 'Fatebringer',
    icon: '/common/destiny2_content/icons/abc.jpg'
  },
  inventory: { tierType: 5 },
  equippingBlock: { ammoType: 1 }
};

const ARMOUR = {
  itemType: 2,
  itemSubType: 26,
  itemTypeDisplayName: 'Helmet',
  displayProperties: { name: 'Helm of Saint-14', icon: '/common/x.jpg' },
  inventory: { tierType: 6 }
};

describe('TableScanner', () => {
  it('splits top level entries', () => {
    const seen: [string, string][] = [];
    const scanner = new TableScanner();
    scanner.push('{"1":{"a":1},"2":{"b":2}}', (k, t) => seen.push([k, t]));
    expect(seen).toEqual([
      ['1', '{"a":1}'],
      ['2', '{"b":2}']
    ]);
  });

  it('handles nested objects', () => {
    const seen: string[] = [];
    const scanner = new TableScanner();
    scanner.push('{"1":{"a":{"b":{"c":1}}}}', (_k, t) => seen.push(t));
    expect(seen).toEqual(['{"a":{"b":{"c":1}}}']);
  });

  it('ignores braces inside strings', () => {
    const seen: string[] = [];
    const scanner = new TableScanner();
    scanner.push('{"1":{"n":"a{b}c"}}', (_k, t) => seen.push(t));
    expect(seen).toEqual(['{"n":"a{b}c"}']);
  });

  it('ignores escaped quotes inside strings', () => {
    const seen: string[] = [];
    const scanner = new TableScanner();
    scanner.push('{"1":{"n":"say \\"hi\\" {"}}', (_k, t) => seen.push(t));
    expect(seen).toEqual(['{"n":"say \\"hi\\" {"}']);
  });

  it('survives a split across chunk boundaries', () => {
    const text = '{"1":{"n":"Fatebringer"},"2":{"n":"Gjallarhorn"}}';
    for (const size of [1, 2, 3, 7, 13]) {
      const seen: string[] = [];
      const scanner = new TableScanner();
      for (let i = 0; i < text.length; i += size) {
        scanner.push(text.slice(i, i + size), (k) => seen.push(k));
      }
      expect(seen).toEqual(['1', '2']);
    }
  });
});

describe('extractWeapon', () => {
  it('keeps the fields a weapon row needs', () => {
    expect(extractWeapon(WEAPON)).toEqual({
      name: 'Fatebringer',
      icon: 'abc.jpg',
      type: 'Hand Cannon',
      subType: 9,
      damageType: 1,
      tierType: 5,
      ammoType: 1
    });
  });

  it('drops anything that is not a weapon', () => {
    expect(extractWeapon(ARMOUR)).toBeNull();
  });

  it('drops a weapon with no name', () => {
    expect(extractWeapon({ ...WEAPON, displayProperties: { name: '' } })).toBeNull();
  });

  it('defaults missing optional fields to zero', () => {
    const weapon = extractWeapon({
      itemType: 3,
      displayProperties: { name: 'Mystery' }
    });
    expect(weapon).toMatchObject({ subType: 0, damageType: 0, tierType: 0, ammoType: 0 });
  });
});

describe('extractWeaponsFromChunks', () => {
  const table = JSON.stringify({ '1': WEAPON, '2': ARMOUR, '3': { ...WEAPON, displayProperties: { name: 'Thorn', icon: '' } } });

  it('keeps only weapons out of a mixed table', async () => {
    const index = await extractWeaponsFromChunks(chunks(table, 5));
    expect(Object.keys(index).sort()).toEqual(['1', '3']);
    expect(index['1'].name).toBe('Fatebringer');
  });

  it('gives the same answer at any chunk size', async () => {
    const a = await extractWeaponsFromChunks(chunks(table, 1));
    const b = await extractWeaponsFromChunks(chunks(table, 10000));
    expect(a).toEqual(b);
  });

  it('reports progress as bytes go by', async () => {
    const seen: number[] = [];
    await extractWeaponsFromChunks(chunks(table, 20), (bytes) => seen.push(bytes));
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[seen.length - 1]).toBe(table.length);
  });

  it('skips an entry that will not parse rather than giving up', async () => {
    const broken = '{"1":{"itemType":3,"displayProperties":{"name":}},"2":' +
      JSON.stringify(WEAPON) + '}';
    const index = await extractWeaponsFromChunks(chunks(broken, 9));
    expect(Object.keys(index)).toEqual(['2']);
  });

  it('returns nothing for an empty table', async () => {
    expect(await extractWeaponsFromChunks(chunks('{}', 4))).toEqual({});
  });
});

describe('icon paths', () => {
  it('strips and restores the common prefix', () => {
    expect(shortenIcon('/common/destiny2_content/icons/a.jpg')).toBe('a.jpg');
    expect(expandIcon('a.jpg')).toBe(
      'https://www.bungie.net/common/destiny2_content/icons/a.jpg'
    );
  });

  it('leaves an unusual path alone', () => {
    expect(shortenIcon('/other/b.jpg')).toBe('/other/b.jpg');
    expect(expandIcon('/other/b.jpg')).toBe('https://www.bungie.net/other/b.jpg');
  });

  it('returns nothing for an empty icon', () => {
    expect(expandIcon('')).toBe('');
  });
});

describe('cache', () => {
  const index: WeaponIndex = {
    '1': {
      name: 'Fatebringer',
      icon: 'abc.jpg',
      type: 'Hand Cannon',
      subType: 9,
      damageType: 1,
      tierType: 5,
      ammoType: 1
    }
  };

  it('round trips through the packed form', () => {
    expect(unpackIndex(packIndex(index))).toEqual(index);
  });

  it('packs smaller than the object form', () => {
    expect(packIndex(index).length).toBeLessThan(JSON.stringify(index).length);
  });

  it('writes and reads back by version', () => {
    const store = fakeStore();
    writeCachedIndex('v1', index, store);
    expect(readCachedIndex('v1', store)).toEqual(index);
  });

  it('misses on a different version', () => {
    const store = fakeStore();
    writeCachedIndex('v1', index, store);
    expect(readCachedIndex('v2', store)).toBeNull();
  });

  it('drops stale versions when a new one is written', () => {
    const store = fakeStore();
    writeCachedIndex('v1', index, store);
    writeCachedIndex('v2', index, store);
    expect(readCachedIndex('v1', store)).toBeNull();
    expect(readCachedIndex('v2', store)).toEqual(index);
  });

  it('leaves unrelated storage keys alone', () => {
    const store = fakeStore();
    store.setItem('d2.session', 'somebody is signed in');
    writeCachedIndex('v1', index, store);
    dropOtherVersions('v1', store);
    expect(store.getItem('d2.session')).toBe('somebody is signed in');
  });

  it('returns null for a corrupt cache entry rather than throwing', () => {
    const store = fakeStore();
    store.setItem('weapon-report.manifest.v1', 'not json');
    expect(readCachedIndex('v1', store)).toBeNull();
  });

  it('survives a storage that throws on write', () => {
    const angry = {
      length: 0,
      key: () => null,
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
      clear: () => undefined
    } as unknown as Storage;
    expect(() => writeCachedIndex('v1', index, angry)).not.toThrow();
  });
});

describe('getManifestInfo', () => {
  it('reads the version and the English item table path', async () => {
    const ok = (async () =>
      new Response(
        JSON.stringify({
          ErrorCode: 1,
          Response: {
            version: '1.2.3',
            jsonWorldComponentContentPaths: {
              en: { DestinyInventoryItemDefinition: '/items.json' }
            }
          }
        })
      )) as unknown as typeof fetch;
    await expect(getManifestInfo('en', ok, 0)).resolves.toEqual({
      version: '1.2.3',
      itemPath: '/items.json'
    });
  });

  it('falls back to English for an unknown locale', async () => {
    const ok = (async () =>
      new Response(
        JSON.stringify({
          ErrorCode: 1,
          Response: {
            version: '9',
            jsonWorldComponentContentPaths: {
              en: { DestinyInventoryItemDefinition: '/items.json' }
            }
          }
        })
      )) as unknown as typeof fetch;
    await expect(getManifestInfo('kl', ok, 0)).resolves.toMatchObject({
      itemPath: '/items.json'
    });
  });

  it('retries the five hundreds the manifest endpoint hands out', async () => {
    let calls = 0;
    const flaky = (async () => {
      calls++;
      if (calls < 3) return new Response('{"ErrorCode":5}', { status: 500 });
      return new Response(
        JSON.stringify({
          ErrorCode: 1,
          Response: {
            version: 'v',
            jsonWorldComponentContentPaths: {
              en: { DestinyInventoryItemDefinition: '/i.json' }
            }
          }
        })
      );
    }) as unknown as typeof fetch;
    await expect(getManifestInfo('en', flaky, 3)).resolves.toMatchObject({ version: 'v' });
    expect(calls).toBe(3);
  });

  it('gives up with a clear error when the manifest never comes back', async () => {
    const dead = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(getManifestInfo('en', dead, 1)).rejects.toThrow();
  });
});
