// Destiny manifest access.
//
// The English DestinyInventoryItemDefinition table is around 190 MB of JSON
// and holds about 39000 items, of which roughly 2200 are weapons. Parsing the
// whole thing into an object would cost hundreds of megabytes for data that is
// thrown away immediately, so the table is scanned as it streams in, each top
// level entry is looked at once, and only weapons survive the pass. What is
// kept is about 400 KB, small enough for localStorage, and it is keyed by the
// manifest version so a Bungie content update invalidates it by itself.

import { BUNGIE_ROOT, BungieError, defaultFetch, PLATFORM } from './bungie';
import type { WeaponDef } from './types';

export type WeaponIndex = Record<string, WeaponDef>;

const ICON_PREFIX = '/common/destiny2_content/icons/';
const CACHE_PREFIX = 'weapon-report.manifest.';
const ITEM_TYPE_WEAPON = 3;

export interface ManifestInfo {
  version: string;
  itemPath: string;
}

interface ManifestResponse {
  version?: string;
  jsonWorldComponentContentPaths?: Record<string, Record<string, string>>;
}

/**
 * Manifest head. No API key is required for this endpoint. It returns HTTP 500
 * often enough to matter, so it is retried, and English is used when the
 * requested locale is missing.
 */
export async function getManifestInfo(
  locale = 'en',
  fetchImpl: typeof fetch = defaultFetch,
  retries = 3
): Promise<ManifestInfo> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 400 * attempt));
    try {
      const response = await fetchImpl(PLATFORM + '/Destiny2/Manifest/', {
        headers: { Accept: 'application/json' }
      });
      const body = (await response.json()) as {
        Response?: ManifestResponse;
        ErrorCode?: number;
      };
      if (body.ErrorCode !== 1 || !body.Response) {
        lastError = new BungieError('bungie-down', 'The manifest endpoint is unhappy.');
        continue;
      }
      const paths = body.Response.jsonWorldComponentContentPaths || {};
      const table = paths[locale] || paths['en'];
      const itemPath = table && table['DestinyInventoryItemDefinition'];
      if (!itemPath) {
        lastError = new BungieError('bungie-down', 'The manifest has no item table.');
        continue;
      }
      return { version: String(body.Response.version || 'unknown'), itemPath };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new BungieError('bungie-down', 'Could not read the Destiny manifest.');
}

/**
 * Scans a stream of JSON text that is one flat object of hash to definition,
 * handing each top level entry to a callback as raw text. Nothing accumulates
 * except the entry currently being read, so peak memory is one item rather
 * than the whole table.
 */
export class TableScanner {
  private started = false;
  private state: 'seekkey' | 'readkey' | 'seekval' | 'readval' = 'seekkey';
  private key = '';
  private entry = '';
  private depth = 0;
  private inString = false;
  private escaped = false;

  push(chunk: string, onEntry: (key: string, text: string) => void): void {
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (!this.started) {
        if (c === '{') this.started = true;
        continue;
      }
      if (this.state === 'seekkey') {
        if (c === '"') {
          this.state = 'readkey';
          this.key = '';
        }
        continue;
      }
      if (this.state === 'readkey') {
        if (c === '"') this.state = 'seekval';
        else this.key += c;
        continue;
      }
      if (this.state === 'seekval') {
        if (c === '{') {
          this.state = 'readval';
          this.entry = '{';
          this.depth = 1;
          this.inString = false;
          this.escaped = false;
        }
        continue;
      }
      this.entry += c;
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (c === '\\') this.escaped = true;
        else if (c === '"') this.inString = false;
        continue;
      }
      if (c === '"') {
        this.inString = true;
        continue;
      }
      if (c === '{') {
        this.depth++;
        continue;
      }
      if (c === '}') {
        this.depth--;
        if (this.depth === 0) {
          onEntry(this.key, this.entry);
          this.entry = '';
          this.state = 'seekkey';
        }
      }
    }
  }
}

interface RawItem {
  itemType?: number;
  itemSubType?: number;
  defaultDamageType?: number;
  itemTypeDisplayName?: string;
  displayProperties?: { name?: string; icon?: string };
  inventory?: { tierType?: number };
  equippingBlock?: { ammoType?: number };
}

/** Keep only what a weapon row needs to render. */
export function extractWeapon(raw: RawItem): WeaponDef | null {
  if (raw.itemType !== ITEM_TYPE_WEAPON) return null;
  const name = raw.displayProperties?.name || '';
  if (!name) return null;
  return {
    name,
    icon: shortenIcon(raw.displayProperties?.icon || ''),
    type: raw.itemTypeDisplayName || '',
    subType: raw.itemSubType ?? 0,
    damageType: raw.defaultDamageType ?? 0,
    tierType: raw.inventory?.tierType ?? 0,
    ammoType: raw.equippingBlock?.ammoType ?? 0
  };
}

export function shortenIcon(icon: string): string {
  return icon.startsWith(ICON_PREFIX) ? icon.slice(ICON_PREFIX.length) : icon;
}

export function expandIcon(icon: string): string {
  if (!icon) return '';
  if (icon.startsWith('/') || icon.startsWith('http')) return BUNGIE_ROOT + icon;
  return BUNGIE_ROOT + ICON_PREFIX + icon;
}

/**
 * Run the extraction pass over an async source of text chunks. The prefilter
 * avoids parsing the 94 percent of items that are not weapons.
 */
export async function extractWeaponsFromChunks(
  chunks: AsyncIterable<string>,
  onProgress?: (bytes: number) => void
): Promise<WeaponIndex> {
  const scanner = new TableScanner();
  const index: WeaponIndex = {};
  let bytes = 0;
  const handle = (key: string, text: string): void => {
    if (text.indexOf('"itemType":3') === -1) return;
    let raw: RawItem;
    try {
      raw = JSON.parse(text) as RawItem;
    } catch {
      return;
    }
    const weapon = extractWeapon(raw);
    if (weapon) index[key] = weapon;
  };
  for await (const chunk of chunks) {
    bytes += chunk.length;
    scanner.push(chunk, handle);
    if (onProgress) onProgress(bytes);
  }
  return index;
}

async function* readerChunks(response: Response): AsyncIterable<string> {
  const body = response.body;
  if (!body) {
    yield await response.text();
    return;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value, { stream: true });
  }
  const tail = decoder.decode();
  if (tail) yield tail;
}

/** Fetch and extract the weapon table. No API key needed. */
export async function fetchWeaponIndex(
  info: ManifestInfo,
  fetchImpl: typeof fetch = defaultFetch,
  onProgress?: (bytes: number) => void
): Promise<WeaponIndex> {
  const response = await fetchImpl(BUNGIE_ROOT + info.itemPath, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) {
    throw new BungieError('bungie-down', 'The item table would not download.');
  }
  return extractWeaponsFromChunks(readerChunks(response), onProgress);
}

type PackedWeapon = [string, string, string, number, number, number, number];

/** Compact array form, roughly forty percent smaller than the object form. */
export function packIndex(index: WeaponIndex): string {
  const packed: Record<string, PackedWeapon> = {};
  for (const [hash, w] of Object.entries(index)) {
    packed[hash] = [w.name, w.icon, w.type, w.subType, w.damageType, w.tierType, w.ammoType];
  }
  return JSON.stringify(packed);
}

export function unpackIndex(text: string): WeaponIndex {
  const packed = JSON.parse(text) as Record<string, PackedWeapon>;
  const index: WeaponIndex = {};
  for (const [hash, p] of Object.entries(packed)) {
    index[hash] = {
      name: p[0],
      icon: p[1],
      type: p[2],
      subType: p[3],
      damageType: p[4],
      tierType: p[5],
      ammoType: p[6]
    };
  }
  return index;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readCachedIndex(
  version: string,
  store: Storage | null = storage()
): WeaponIndex | null {
  if (!store) return null;
  try {
    const text = store.getItem(CACHE_PREFIX + version);
    if (!text) return null;
    return unpackIndex(text);
  } catch {
    return null;
  }
}

export function writeCachedIndex(
  version: string,
  index: WeaponIndex,
  store: Storage | null = storage()
): void {
  if (!store) return;
  try {
    dropOtherVersions(version, store);
    store.setItem(CACHE_PREFIX + version, packIndex(index));
  } catch {
    // Over quota or storage disabled. The index still works for this session.
  }
}

/** A new manifest version makes every older cache entry dead weight. */
export function dropOtherVersions(keep: string, store: Storage): void {
  const doomed: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key && key.startsWith(CACHE_PREFIX) && key !== CACHE_PREFIX + keep) {
      doomed.push(key);
    }
  }
  for (const key of doomed) store.removeItem(key);
}

/**
 * The whole manifest path: cache hit, or one streamed extraction pass.
 */
export async function loadWeaponIndex(
  fetchImpl: typeof fetch = defaultFetch,
  onProgress?: (stage: string, bytes: number) => void
): Promise<{ index: WeaponIndex; version: string; fromCache: boolean }> {
  const info = await getManifestInfo('en', fetchImpl);
  const cached = readCachedIndex(info.version);
  if (cached && Object.keys(cached).length > 0) {
    return { index: cached, version: info.version, fromCache: true };
  }
  const index = await fetchWeaponIndex(info, fetchImpl, (bytes) => {
    if (onProgress) onProgress('download', bytes);
  });
  writeCachedIndex(info.version, index);
  return { index, version: info.version, fromCache: false };
}

export const DAMAGE_TYPES: Record<number, string> = {
  0: 'None',
  1: 'Kinetic',
  2: 'Arc',
  3: 'Solar',
  4: 'Void',
  5: 'Raid',
  6: 'Stasis',
  7: 'Strand'
};

export const TIER_TYPES: Record<number, string> = {
  2: 'Basic',
  3: 'Common',
  4: 'Rare',
  5: 'Legendary',
  6: 'Exotic'
};
