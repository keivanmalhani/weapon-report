// Turns a kill distribution into a plain English sentence about how the
// player fights, including the weapon types they never touch.

import type { WeaponRow } from './types';

/** Every weapon type Destiny 2 has, keyed by DestinyItemSubType. */
export const WEAPON_SUBTYPES: Record<number, string> = {
  6: 'Auto Rifle',
  7: 'Shotgun',
  8: 'Machine Gun',
  9: 'Hand Cannon',
  10: 'Rocket Launcher',
  11: 'Fusion Rifle',
  12: 'Sniper Rifle',
  13: 'Pulse Rifle',
  14: 'Scout Rifle',
  17: 'Sidearm',
  18: 'Sword',
  22: 'Linear Fusion Rifle',
  23: 'Grenade Launcher',
  24: 'Submachine Gun',
  25: 'Trace Rifle',
  31: 'Combat Bow',
  33: 'Glaive'
};

const PLURALS: Record<string, string> = {
  'Auto Rifle': 'auto rifles',
  Shotgun: 'shotguns',
  'Machine Gun': 'machine guns',
  'Hand Cannon': 'hand cannons',
  'Rocket Launcher': 'rocket launchers',
  'Fusion Rifle': 'fusion rifles',
  'Sniper Rifle': 'sniper rifles',
  'Pulse Rifle': 'pulse rifles',
  'Scout Rifle': 'scout rifles',
  Sidearm: 'sidearms',
  Sword: 'swords',
  'Linear Fusion Rifle': 'linear fusion rifles',
  'Grenade Launcher': 'grenade launchers',
  'Submachine Gun': 'submachine guns',
  'Trace Rifle': 'trace rifles',
  'Combat Bow': 'bows',
  Glaive: 'glaives'
};

/**
 * Weapon types in rough order of how ordinary they are. An absence is only
 * interesting in proportion to how normal the thing is, so a player who has
 * never fired an auto rifle is a better line than one who never picked up a
 * glaive, and this order makes that choice deterministic.
 */
export const TYPE_UBIQUITY: string[] = [
  'Auto Rifle',
  'Hand Cannon',
  'Pulse Rifle',
  'Scout Rifle',
  'Submachine Gun',
  'Shotgun',
  'Sniper Rifle',
  'Sidearm',
  'Rocket Launcher',
  'Grenade Launcher',
  'Fusion Rifle',
  'Machine Gun',
  'Sword',
  'Combat Bow',
  'Trace Rifle',
  'Linear Fusion Rifle',
  'Glaive'
];

const UBIQUITY_RANK = new Map(TYPE_UBIQUITY.map((t, i) => [t, i]));

/** Sort key that puts the most ordinary weapon type first. */
export function byUbiquity(a: string, b: string): number {
  const ra = UBIQUITY_RANK.has(a) ? (UBIQUITY_RANK.get(a) as number) : 999;
  const rb = UBIQUITY_RANK.has(b) ? (UBIQUITY_RANK.get(b) as number) : 999;
  return ra - rb || a.localeCompare(b);
}

/** "a" or "an", decided on the first letter of the label. */
export function article(label: string): string {
  return /^[aeiou]/i.test(label) ? 'an' : 'a';
}

export const SLOT_NAMES: Record<number, string> = {
  1: 'primary',
  2: 'special',
  3: 'heavy'
};

/** Lower case singular form used inside sentences. */
export function typeLabel(type: string): string {
  return type.toLowerCase();
}

/** Lower case form used after "never meaningfully used a". */
export function neverLabel(type: string): string {
  if (type === 'Combat Bow') return 'bow';
  return type.toLowerCase();
}

export function pluralLabel(type: string): string {
  return PLURALS[type] || type.toLowerCase() + 's';
}

export interface TypeShare {
  type: string;
  kills: number;
  share: number;
  weaponCount: number;
}

export interface SlotShare {
  slot: string;
  kills: number;
  share: number;
}

export interface ArchetypeRead {
  byType: TypeShare[];
  bySlot: SlotShare[];
  /** Types present in the catalog with zero recorded kills. */
  neverUsed: string[];
  /** Types with a real but negligible share, under half a percent. */
  barelyUsed: string[];
  sentence: string;
}

const NEGLIGIBLE = 0.005;

function groupByType(rows: WeaponRow[]): TypeShare[] {
  const total = rows.reduce((a, r) => a + r.kills, 0);
  const map = new Map<string, TypeShare>();
  for (const row of rows) {
    const type = row.type || WEAPON_SUBTYPES[row.subType] || 'Unknown';
    const bucket = map.get(type) || { type, kills: 0, share: 0, weaponCount: 0 };
    bucket.kills += row.kills;
    bucket.weaponCount += 1;
    map.set(type, bucket);
  }
  const list = [...map.values()];
  for (const bucket of list) bucket.share = total > 0 ? bucket.kills / total : 0;
  return list.sort((a, b) => b.kills - a.kills || a.type.localeCompare(b.type));
}

function groupBySlot(rows: WeaponRow[]): SlotShare[] {
  const total = rows.reduce((a, r) => a + r.kills, 0);
  const map = new Map<string, SlotShare>();
  for (const row of rows) {
    const slot = SLOT_NAMES[row.ammoType] || 'unknown';
    const bucket = map.get(slot) || { slot, kills: 0, share: 0 };
    bucket.kills += row.kills;
    map.set(slot, bucket);
  }
  const list = [...map.values()];
  for (const bucket of list) bucket.share = total > 0 ? bucket.kills / total : 0;
  return list.sort((a, b) => b.kills - a.kills || a.slot.localeCompare(b.slot));
}

/**
 * Read the archetype of an account. `catalogTypes` is the full list of weapon
 * types the game has, so absence can be named rather than merely missing.
 */
export function readArchetype(
  rows: WeaponRow[],
  catalogTypes: string[] = Object.values(WEAPON_SUBTYPES)
): ArchetypeRead {
  const byType = groupByType(rows);
  const bySlot = groupBySlot(rows);
  const seen = new Map(byType.map((t) => [t.type, t]));
  const neverUsed = catalogTypes
    .filter((t) => {
      const found = seen.get(t);
      return !found || found.kills === 0;
    })
    .sort(byUbiquity);
  const barelyUsed = byType
    .filter((t) => t.kills > 0 && t.share < NEGLIGIBLE)
    .map((t) => t.type)
    .sort(byUbiquity);
  return {
    byType,
    bySlot,
    neverUsed,
    barelyUsed,
    sentence: archetypeSentence(byType, neverUsed, barelyUsed)
  };
}

/**
 * The playstyle sentence. Shape depends on how lopsided the distribution is:
 * one dominant type, two leading types, or a genuinely broad spread. The
 * clause about what they never touch is appended when there is one.
 */
export function archetypeSentence(
  byType: TypeShare[],
  neverUsed: string[],
  barelyUsed: string[] = []
): string {
  const used = byType.filter((t) => t.kills > 0);
  if (used.length === 0) {
    return 'There are no recorded kills on this account, so there is no playstyle to read.';
  }

  const first = used[0];
  const second = used[1];
  // The two shapes take different connectors: "You are a ... player" reads on
  // into a "who" clause, "You spread your kills across ..." does not.
  let lead: string;
  let spread = false;
  if (first.share >= 0.55 || !second) {
    lead = 'You are a ' + typeLabel(first.type) + ' player and not much else';
  } else if (first.share + second.share >= 0.5) {
    lead =
      'You are a ' + typeLabel(first.type) + ' and ' + typeLabel(second.type) + ' player';
  } else {
    const third = used[2];
    spread = true;
    lead = third
      ? 'You spread your kills across ' +
        pluralLabel(first.type) +
        ', ' +
        pluralLabel(second.type) +
        ' and ' +
        pluralLabel(third.type)
      : 'You spread your kills across ' +
        pluralLabel(first.type) +
        ' and ' +
        pluralLabel(second.type);
  }

  const absent = pickAbsence(neverUsed, barelyUsed);
  if (!absent) {
    return lead + ', and you have put real kills on every weapon type in the game.';
  }
  const label = neverLabel(absent.type);
  const the = article(label);
  const tailNever = 'never used ' + the + ' ' + label + ' at all.';
  const tailBarely = 'never meaningfully used ' + the + ' ' + label + '.';
  const tail = absent.kind === 'never' ? tailNever : tailBarely;
  return spread ? lead + ', and you have ' + tail : lead + ' who has ' + tail;
}

/**
 * Which absence to name. Sorting happens here as well as in readArchetype so
 * the sentence is the same whatever order the caller hands the lists in.
 */
function pickAbsence(
  neverUsed: string[],
  barelyUsed: string[]
): { type: string; kind: 'never' | 'barely' } | null {
  if (neverUsed.length > 0) {
    return { type: neverUsed.slice().sort(byUbiquity)[0], kind: 'never' };
  }
  if (barelyUsed.length > 0) {
    return { type: barelyUsed.slice().sort(byUbiquity)[0], kind: 'barely' };
  }
  return null;
}

/** One line about the slot split, used under the archetype sentence. */
export function slotSentence(bySlot: SlotShare[]): string {
  const known = bySlot.filter((s) => s.slot !== 'unknown' && s.kills > 0);
  if (known.length === 0) return '';
  const top = known[0];
  const pct = Math.round(top.share * 100);
  return (
    'Your ' + top.slot + ' weapons carry ' + pct + ' percent of the load.'
  );
}
