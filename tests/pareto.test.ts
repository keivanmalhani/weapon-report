import { describe, expect, it } from 'vitest';
import {
  gini,
  lorenzPoints,
  mergeWeaponHistories,
  mostPreciseWeapon,
  mostUsedWeapon,
  oneHitWonders,
  paretoMinimumSet,
  precisionGap,
  shareOfTop
} from '../src/pareto';
import type { WeaponRow, WeaponUsage } from '../src/types';

function row(partial: Partial<WeaponRow> & { referenceId: number; kills: number }): WeaponRow {
  const kills = partial.kills;
  const precisionKills = partial.precisionKills ?? 0;
  return {
    referenceId: partial.referenceId,
    kills,
    precisionKills,
    precisionRatio: partial.precisionRatio ?? (kills > 0 ? precisionKills / kills : 0),
    name: partial.name ?? 'Weapon ' + partial.referenceId,
    icon: partial.icon ?? '',
    type: partial.type ?? 'Hand Cannon',
    subType: partial.subType ?? 9,
    damageType: partial.damageType ?? 1,
    tierType: partial.tierType ?? 5,
    ammoType: partial.ammoType ?? 1,
    share: partial.share ?? 0
  };
}

describe('paretoMinimumSet', () => {
  it('returns zero for an empty account', () => {
    expect(paretoMinimumSet([])).toBe(0);
  });

  it('returns zero when every weapon has zero kills', () => {
    expect(paretoMinimumSet([0, 0, 0])).toBe(0);
  });

  it('returns one for a single weapon account', () => {
    expect(paretoMinimumSet([412])).toBe(1);
  });

  it('ignores zero kill weapons when counting', () => {
    expect(paretoMinimumSet([100, 0, 0, 0, 0])).toBe(1);
  });

  it('takes the fewest weapons that clear the threshold', () => {
    // 90 of 100 is already past eighty percent.
    expect(paretoMinimumSet([90, 5, 3, 2])).toBe(1);
  });

  it('counts up when the leader is not enough on its own', () => {
    // 50 then 80 of 100. Two weapons, exactly at the boundary.
    expect(paretoMinimumSet([50, 30, 10, 10])).toBe(2);
  });

  it('treats an exact eighty percent boundary as covered', () => {
    expect(paretoMinimumSet([8, 2])).toBe(1);
  });

  it('handles ties without double counting', () => {
    // Five equal weapons: four of five is exactly eighty percent.
    expect(paretoMinimumSet([1, 1, 1, 1, 1])).toBe(4);
  });

  it('gives the same answer whatever order the ties arrive in', () => {
    const a = paretoMinimumSet([7, 7, 7, 1, 1, 1]);
    const b = paretoMinimumSet([1, 7, 1, 7, 1, 7]);
    expect(a).toBe(b);
  });

  it('honours a different threshold', () => {
    expect(paretoMinimumSet([50, 30, 10, 10], 0.5)).toBe(1);
    expect(paretoMinimumSet([50, 30, 10, 10], 0.95)).toBe(4);
  });

  it('never exceeds the number of weapons with kills', () => {
    expect(paretoMinimumSet([1, 1, 1], 1)).toBe(3);
  });

  it('survives floating point sums', () => {
    // Ten tenths do not add to exactly one in binary, so the eighth partial
    // sum lands a hair under the target. An exact comparison would say nine.
    expect(paretoMinimumSet(new Array(10).fill(0.1), 0.8)).toBe(8);
    expect(paretoMinimumSet([0.1, 0.2, 0.3, 0.4], 0.8)).toBe(3);
  });
});

describe('shareOfTop', () => {
  it('is zero for an empty account', () => {
    expect(shareOfTop([], 6)).toBe(0);
  });

  it('is zero when asked for zero weapons', () => {
    expect(shareOfTop([10, 5], 0)).toBe(0);
  });

  it('adds the largest values first', () => {
    expect(shareOfTop([1, 9, 5, 5], 2)).toBeCloseTo(14 / 20, 10);
  });

  it('caps at the whole account', () => {
    expect(shareOfTop([3, 4], 99)).toBe(1);
  });
});

describe('gini', () => {
  it('is zero for perfect equality', () => {
    expect(gini([5, 5, 5, 5])).toBeCloseTo(0, 12);
  });

  it('is zero for a single weapon, which cannot be unequal', () => {
    expect(gini([1200])).toBeCloseTo(0, 12);
  });

  it('reaches the finite sample maximum for perfect inequality', () => {
    // One weapon holds everything: the estimator tops out at (n - 1) / n.
    expect(gini([0, 0, 0, 10])).toBeCloseTo(0.75, 12);
    expect(gini([0, 0, 0, 0, 0, 0, 0, 0, 0, 100])).toBeCloseTo(0.9, 12);
  });

  it('matches a hand computed middle case', () => {
    // 1, 2, 3, 4: mean absolute difference 1.25, mean 2.5, so G = 0.25.
    expect(gini([1, 2, 3, 4])).toBeCloseTo(0.25, 12);
  });

  it('matches a second hand computed case', () => {
    // 1, 1, 6: pair differences 0 + 5 + 5, doubled is 20. 2 n^2 mu = 48.
    expect(gini([1, 1, 6])).toBeCloseTo(20 / 48, 12);
  });

  it('is order independent', () => {
    expect(gini([4, 1, 3, 2])).toBeCloseTo(gini([1, 2, 3, 4]), 12);
  });

  it('is scale invariant', () => {
    expect(gini([10, 20, 30, 40])).toBeCloseTo(gini([1, 2, 3, 4]), 12);
  });

  it('returns zero for an empty account and for all zeroes', () => {
    expect(gini([])).toBe(0);
    expect(gini([0, 0, 0])).toBe(0);
  });

  it('rises as the distribution gets more lopsided', () => {
    expect(gini([1, 1, 1, 100])).toBeGreaterThan(gini([1, 2, 3, 4]));
  });
});

describe('lorenzPoints', () => {
  it('gives the diagonal for an empty account', () => {
    expect(lorenzPoints([])).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 }
    ]);
  });

  it('gives the diagonal when nothing has kills', () => {
    expect(lorenzPoints([0, 0])).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 }
    ]);
  });

  it('starts at the origin and ends at one, one', () => {
    const points = lorenzPoints([3, 9, 1, 7]);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    const last = points[points.length - 1];
    expect(last.x).toBeCloseTo(1, 12);
    expect(last.y).toBeCloseTo(1, 12);
  });

  it('emits one point per weapon plus the origin', () => {
    expect(lorenzPoints([1, 2, 3]).length).toBe(4);
  });

  it('is the diagonal for a perfectly equal account', () => {
    const points = lorenzPoints([5, 5, 5, 5]);
    for (const p of points) expect(p.y).toBeCloseTo(p.x, 12);
  });

  it('sorts from least used to most used, so it never rises above the diagonal', () => {
    const points = lorenzPoints([100, 1, 1, 1]);
    for (const p of points) expect(p.y).toBeLessThanOrEqual(p.x + 1e-12);
  });

  it('is monotonic in both axes', () => {
    const points = lorenzPoints([9, 2, 40, 1, 7]);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].x).toBeGreaterThan(points[i - 1].x);
      expect(points[i].y).toBeGreaterThanOrEqual(points[i - 1].y);
    }
  });

  it('places the known midpoint of a two weapon account', () => {
    const points = lorenzPoints([30, 10]);
    expect(points[1]).toEqual({ x: 0.5, y: 0.25 });
  });
});

describe('oneHitWonders', () => {
  it('takes weapons with at least one kill and no more than the threshold', () => {
    const rows = [row({ referenceId: 1, kills: 0 }), row({ referenceId: 2, kills: 5 })];
    expect(oneHitWonders(rows).map((r) => r.referenceId)).toEqual([2]);
  });

  it('excludes the weapon just over the line', () => {
    const rows = [row({ referenceId: 1, kills: 6 })];
    expect(oneHitWonders(rows)).toHaveLength(0);
  });

  it('includes the weapon exactly on the line', () => {
    expect(oneHitWonders([row({ referenceId: 1, kills: 5 })])).toHaveLength(1);
  });

  it('honours a custom threshold', () => {
    const rows = [row({ referenceId: 1, kills: 12 }), row({ referenceId: 2, kills: 30 })];
    expect(oneHitWonders(rows, 20).map((r) => r.referenceId)).toEqual([1]);
  });

  it('sorts by kills then name so output is stable', () => {
    const rows = [
      row({ referenceId: 1, kills: 3, name: 'Zephyr' }),
      row({ referenceId: 2, kills: 1, name: 'Anvil' }),
      row({ referenceId: 3, kills: 3, name: 'Ashen' })
    ];
    expect(oneHitWonders(rows).map((r) => r.name)).toEqual(['Anvil', 'Ashen', 'Zephyr']);
  });

  it('returns nothing for an empty account', () => {
    expect(oneHitWonders([])).toEqual([]);
  });
});

describe('precision', () => {
  const mostUsed = row({
    referenceId: 10,
    kills: 5000,
    precisionKills: 1250,
    name: 'Spray and Pray'
  });
  const sniper = row({
    referenceId: 11,
    kills: 400,
    precisionKills: 320,
    name: 'Long Look'
  });
  const lucky = row({ referenceId: 12, kills: 4, precisionKills: 4, name: 'Fluke' });

  it('finds the gap between the most used and the most precise gun', () => {
    const gap = precisionGap([mostUsed, sniper, lucky]);
    expect(gap).not.toBeNull();
    expect(gap?.mostUsed.name).toBe('Spray and Pray');
    expect(gap?.mostPrecise.name).toBe('Long Look');
    expect(gap?.delta).toBeCloseTo(0.8 - 0.25, 10);
  });

  it('ignores guns below the sample floor', () => {
    const gap = precisionGap([mostUsed, lucky]);
    expect(gap).toBeNull();
  });

  it('claims nothing when the most used gun is also the most precise', () => {
    const sharp = row({ referenceId: 20, kills: 9000, precisionKills: 8000 });
    const blunt = row({ referenceId: 21, kills: 900, precisionKills: 90 });
    expect(precisionGap([sharp, blunt])).toBeNull();
  });

  it('claims nothing when the most precise gun is no better than the most used one', () => {
    const a = row({ referenceId: 30, kills: 900, precisionKills: 450 });
    const b = row({ referenceId: 31, kills: 800, precisionKills: 400 });
    expect(precisionGap([a, b])).toBeNull();
  });

  it('claims nothing for an empty account', () => {
    expect(precisionGap([])).toBeNull();
  });

  it('claims nothing when every gun has zero kills', () => {
    expect(precisionGap([row({ referenceId: 40, kills: 0 })])).toBeNull();
  });

  it('respects a custom sample floor', () => {
    const gap = precisionGap([mostUsed, lucky], 1);
    expect(gap?.mostPrecise.name).toBe('Fluke');
  });

  it('mostUsedWeapon picks the highest kill count', () => {
    expect(mostUsedWeapon([sniper, mostUsed])?.name).toBe('Spray and Pray');
    expect(mostUsedWeapon([])).toBeNull();
  });

  it('mostPreciseWeapon respects the floor', () => {
    expect(mostPreciseWeapon([mostUsed, sniper, lucky], 25)?.name).toBe('Long Look');
    expect(mostPreciseWeapon([lucky], 25)).toBeNull();
  });
});

describe('mergeWeaponHistories', () => {
  const usage = (referenceId: number, kills: number, precisionKills: number): WeaponUsage => ({
    referenceId,
    kills,
    precisionKills,
    precisionRatio: kills > 0 ? precisionKills / kills : 0
  });

  it('returns nothing for no characters', () => {
    expect(mergeWeaponHistories([])).toEqual([]);
  });

  it('returns nothing when every character is empty', () => {
    expect(mergeWeaponHistories([[], [], []])).toEqual([]);
  });

  it('adds kills for the same weapon across three characters', () => {
    const merged = mergeWeaponHistories([
      [usage(1, 100, 40)],
      [usage(1, 50, 10)],
      [usage(1, 25, 5)]
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].kills).toBe(175);
    expect(merged[0].precisionKills).toBe(55);
  });

  it('recomputes the precision ratio from the totals rather than averaging', () => {
    // Averaging the two ratios would give 0.55. The honest answer is 55 of 175.
    const merged = mergeWeaponHistories([[usage(1, 100, 90)], [usage(1, 75, 15)]]);
    expect(merged[0].precisionRatio).toBeCloseTo(105 / 175, 12);
  });

  it('keeps weapons that only one character carried', () => {
    const merged = mergeWeaponHistories([
      [usage(1, 10, 1), usage(2, 20, 2)],
      [usage(3, 30, 3)]
    ]);
    expect(merged.map((m) => m.referenceId).sort()).toEqual([1, 2, 3]);
  });

  it('sorts the result by kills descending', () => {
    const merged = mergeWeaponHistories([[usage(1, 10, 0), usage(2, 90, 0)]]);
    expect(merged.map((m) => m.referenceId)).toEqual([2, 1]);
  });

  it('breaks kill ties on reference id so output is stable', () => {
    const merged = mergeWeaponHistories([[usage(9, 5, 0), usage(2, 5, 0)]]);
    expect(merged.map((m) => m.referenceId)).toEqual([2, 9]);
  });

  it('does not mutate the input histories', () => {
    const first = [usage(1, 10, 5)];
    mergeWeaponHistories([first, [usage(1, 10, 5)]]);
    expect(first[0].kills).toBe(10);
  });

  it('gives a zero ratio to a weapon with no kills', () => {
    const merged = mergeWeaponHistories([[usage(1, 0, 0)]]);
    expect(merged[0].precisionRatio).toBe(0);
  });
});
