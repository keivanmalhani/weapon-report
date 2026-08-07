import { describe, expect, it } from 'vitest';
import {
  archetypeSentence,
  article,
  byUbiquity,
  neverLabel,
  pluralLabel,
  readArchetype,
  slotSentence,
  WEAPON_SUBTYPES,
  type TypeShare
} from '../src/archetype';
import type { WeaponRow } from '../src/types';

const ALL_TYPES = Object.values(WEAPON_SUBTYPES);

function weapon(
  type: string,
  kills: number,
  extra: Partial<WeaponRow> = {}
): WeaponRow {
  return {
    referenceId: extra.referenceId ?? Math.round(Math.random() * 1e9),
    kills,
    precisionKills: extra.precisionKills ?? 0,
    precisionRatio: extra.precisionRatio ?? 0,
    name: extra.name ?? type + ' ' + kills,
    icon: '',
    type,
    subType: extra.subType ?? 0,
    damageType: 1,
    tierType: 5,
    ammoType: extra.ammoType ?? 1,
    share: 0
  };
}

function shares(pairs: [string, number][]): TypeShare[] {
  const total = pairs.reduce((a, p) => a + p[1], 0);
  return pairs
    .map(([type, kills]) => ({ type, kills, share: total > 0 ? kills / total : 0, weaponCount: 1 }))
    .sort((a, b) => b.kills - a.kills);
}

describe('archetypeSentence', () => {
  it('says there is nothing to read when there are no kills', () => {
    expect(archetypeSentence([], [])).toContain('no recorded kills');
  });

  it('names one type when it dominates', () => {
    const sentence = archetypeSentence(shares([['Hand Cannon', 80], ['Shotgun', 20]]), []);
    expect(sentence).toContain('You are a hand cannon player and not much else');
  });

  it('names two types when the pair carries the account', () => {
    const sentence = archetypeSentence(
      shares([['Hand Cannon', 40], ['Rocket Launcher', 30], ['Shotgun', 30]]),
      ['Combat Bow']
    );
    expect(sentence).toBe(
      'You are a hand cannon and rocket launcher player who has never used a bow at all.'
    );
  });

  it('falls back to a spread sentence when nothing leads', () => {
    const sentence = archetypeSentence(
      shares([
        ['Auto Rifle', 20],
        ['Scout Rifle', 19],
        ['Pulse Rifle', 18],
        ['Sidearm', 17],
        ['Shotgun', 16],
        ['Sword', 10]
      ]),
      []
    );
    expect(sentence).toContain('You spread your kills across');
    expect(sentence).toContain('auto rifles');
  });

  it('joins the spread sentence to the absence clause with and, not who', () => {
    const sentence = archetypeSentence(
      shares([
        ['Auto Rifle', 20],
        ['Scout Rifle', 19],
        ['Pulse Rifle', 18],
        ['Sidearm', 17],
        ['Shotgun', 16],
        ['Sword', 10]
      ]),
      ['Glaive']
    );
    expect(sentence).toContain(', and you have never used a glaive at all.');
    expect(sentence).not.toContain('who has');
  });

  it('handles the single type account', () => {
    const sentence = archetypeSentence(shares([['Sword', 400]]), []);
    expect(sentence).toContain('You are a sword player and not much else');
  });

  it('says so when every type has been used', () => {
    const sentence = archetypeSentence(shares([['Hand Cannon', 90], ['Sword', 10]]), []);
    expect(sentence).toContain('every weapon type in the game');
  });

  it('prefers a never used type over a barely used one', () => {
    const sentence = archetypeSentence(
      shares([['Hand Cannon', 90], ['Sword', 10]]),
      ['Glaive'],
      ['Trace Rifle']
    );
    expect(sentence).toContain('never used a glaive at all');
  });

  it('uses the barely used branch when nothing is untouched', () => {
    const sentence = archetypeSentence(
      shares([['Hand Cannon', 90], ['Sword', 10]]),
      [],
      ['Trace Rifle']
    );
    expect(sentence).toContain('never meaningfully used a trace rifle.');
  });

  it('names the most ordinary absence rather than the most obscure one', () => {
    const sentence = archetypeSentence(shares([['Hand Cannon', 100]]), [
      'Auto Rifle',
      'Glaive'
    ]);
    expect(sentence).toContain('never used an auto rifle at all');
  });

  it('is stable for the same input', () => {
    const a = archetypeSentence(shares([['Hand Cannon', 100]]), ['Glaive', 'Sword']);
    const b = archetypeSentence(shares([['Hand Cannon', 100]]), ['Glaive', 'Sword']);
    expect(a).toBe(b);
    expect(a).toContain('sword');
  });
});

describe('readArchetype', () => {
  it('groups kills by weapon type', () => {
    const rows = [weapon('Hand Cannon', 100), weapon('Hand Cannon', 50), weapon('Sword', 30)];
    const read = readArchetype(rows, ALL_TYPES);
    expect(read.byType[0]).toMatchObject({ type: 'Hand Cannon', kills: 150, weaponCount: 2 });
    expect(read.byType[0].share).toBeCloseTo(150 / 180, 10);
  });

  it('lists every catalogue type with no kills', () => {
    const read = readArchetype([weapon('Hand Cannon', 10)], ALL_TYPES);
    expect(read.neverUsed).toContain('Combat Bow');
    expect(read.neverUsed).toContain('Glaive');
    expect(read.neverUsed).not.toContain('Hand Cannon');
    expect(read.neverUsed).toHaveLength(ALL_TYPES.length - 1);
  });

  it('reports nothing as never used when the catalogue is exhausted', () => {
    const rows = ALL_TYPES.map((type) => weapon(type, 10));
    expect(readArchetype(rows, ALL_TYPES).neverUsed).toEqual([]);
  });

  it('flags a type with real but negligible use as barely used', () => {
    const rows = [weapon('Hand Cannon', 10000), weapon('Glaive', 3)];
    const read = readArchetype(rows, ['Hand Cannon', 'Glaive']);
    expect(read.barelyUsed).toEqual(['Glaive']);
    expect(read.neverUsed).toEqual([]);
  });

  it('groups by ammunition slot', () => {
    const rows = [
      weapon('Hand Cannon', 100, { ammoType: 1 }),
      weapon('Sniper Rifle', 60, { ammoType: 2 }),
      weapon('Rocket Launcher', 40, { ammoType: 3 })
    ];
    const read = readArchetype(rows, ALL_TYPES);
    expect(read.bySlot.map((s) => s.slot)).toEqual(['primary', 'special', 'heavy']);
    expect(read.bySlot[0].share).toBeCloseTo(0.5, 10);
  });

  it('produces the never used branch end to end', () => {
    // Everything except a bow has been used, so the bow is the only absence.
    const rows = ALL_TYPES.filter((t) => t !== 'Combat Bow').map((type) =>
      weapon(type, type === 'Hand Cannon' ? 400 : type === 'Rocket Launcher' ? 300 : 8)
    );
    const read = readArchetype(rows, ALL_TYPES);
    expect(read.neverUsed).toEqual(['Combat Bow']);
    expect(read.sentence).toBe(
      'You are a hand cannon and rocket launcher player who has never used a bow at all.'
    );
  });

  it('reads an empty account without throwing', () => {
    const read = readArchetype([], ALL_TYPES);
    expect(read.byType).toEqual([]);
    expect(read.sentence).toContain('no recorded kills');
  });
});

describe('labels', () => {
  it('turns Combat Bow into bow for the never used clause', () => {
    expect(neverLabel('Combat Bow')).toBe('bow');
  });

  it('pluralises weapon types for lists', () => {
    expect(pluralLabel('Hand Cannon')).toBe('hand cannons');
    expect(pluralLabel('Combat Bow')).toBe('bows');
    expect(pluralLabel('Machine Gun')).toBe('machine guns');
  });

  it('falls back to adding an s for an unknown type', () => {
    expect(pluralLabel('Ray Gun')).toBe('ray guns');
  });
});

describe('absence ordering', () => {
  it('ranks common types before niche ones', () => {
    expect(['Glaive', 'Auto Rifle', 'Sword'].sort(byUbiquity)).toEqual([
      'Auto Rifle',
      'Sword',
      'Glaive'
    ]);
  });

  it('puts unknown types last and sorts them by name', () => {
    expect(['Zap Gun', 'Alien Rifle', 'Sword'].sort(byUbiquity)).toEqual([
      'Sword',
      'Alien Rifle',
      'Zap Gun'
    ]);
  });

  it('chooses the article from the first letter', () => {
    expect(article('auto rifle')).toBe('an');
    expect(article('bow')).toBe('a');
  });
});

describe('slotSentence', () => {
  it('names the busiest slot', () => {
    const line = slotSentence([
      { slot: 'primary', kills: 700, share: 0.7 },
      { slot: 'heavy', kills: 300, share: 0.3 }
    ]);
    expect(line).toBe('Your primary weapons carry 70 percent of the load.');
  });

  it('is empty when there is nothing to say', () => {
    expect(slotSentence([])).toBe('');
    expect(slotSentence([{ slot: 'unknown', kills: 10, share: 1 }])).toBe('');
  });
});
