// Concentration maths. Everything here is pure and unit tested.

import type { WeaponRow, WeaponUsage } from './types';

const EPS = 1e-9;

/**
 * The smallest number of weapons whose kills add up to at least `threshold`
 * of the account total. Ties do not change the answer because only the count
 * is returned: any two weapons with equal kills are interchangeable.
 *
 * Returns 0 for an empty account and for an account with no kills at all.
 */
export function paretoMinimumSet(kills: number[], threshold = 0.8): number {
  const positive = kills.filter((k) => k > 0);
  const total = positive.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  const target = threshold * total;
  const sorted = positive.slice().sort((a, b) => b - a);
  let cumulative = 0;
  for (let i = 0; i < sorted.length; i++) {
    cumulative += sorted[i];
    if (cumulative >= target - EPS) return i + 1;
  }
  return sorted.length;
}

/**
 * Share of total kills held by the top `n` weapons, 0 to 1.
 */
export function shareOfTop(kills: number[], n: number): number {
  const total = kills.reduce((a, b) => a + (b > 0 ? b : 0), 0);
  if (total <= 0 || n <= 0) return 0;
  const sorted = kills.filter((k) => k > 0).sort((a, b) => b - a);
  let cumulative = 0;
  for (let i = 0; i < Math.min(n, sorted.length); i++) cumulative += sorted[i];
  return cumulative / total;
}

/**
 * Gini coefficient of a set of non negative values, using the standard
 * sample estimator. 0 means every weapon has the same number of kills.
 * The maximum for n weapons is (n - 1) / n, reached when one weapon has
 * every kill, so it approaches 1 as the vault grows.
 */
export function gini(values: number[]): number {
  const v = values.filter((x) => x >= 0).slice().sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return 0;
  const total = v.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let weighted = 0;
  for (let i = 0; i < n; i++) weighted += (i + 1) * v[i];
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

export interface LorenzPoint {
  /** Share of weapons, 0 to 1, poorest first. */
  x: number;
  /** Share of kills, 0 to 1. */
  y: number;
}

/**
 * Points of the Lorenz curve, sorted from the least used weapon to the most
 * used. Always starts at (0, 0) and ends at (1, 1). An empty or all zero
 * account returns the equality diagonal so the chart still draws.
 */
export function lorenzPoints(values: number[]): LorenzPoint[] {
  const v = values.filter((x) => x >= 0).slice().sort((a, b) => a - b);
  const n = v.length;
  const total = v.reduce((a, b) => a + b, 0);
  if (n === 0 || total <= 0) {
    return [
      { x: 0, y: 0 },
      { x: 1, y: 1 }
    ];
  }
  const points: LorenzPoint[] = [{ x: 0, y: 0 }];
  let cumulative = 0;
  for (let i = 0; i < n; i++) {
    cumulative += v[i];
    points.push({ x: (i + 1) / n, y: cumulative / total });
  }
  return points;
}

/**
 * Weapons the player tried and dropped: at least one kill and no more than
 * `maxKills`. Sorted by kills ascending then by name so output is stable.
 */
export function oneHitWonders<T extends { kills: number; name?: string }>(
  rows: T[],
  maxKills = 5
): T[] {
  return rows
    .filter((r) => r.kills >= 1 && r.kills <= maxKills)
    .slice()
    .sort((a, b) => a.kills - b.kills || (a.name || '').localeCompare(b.name || ''));
}

/** The gun with the most kills, or null for an empty account. */
export function mostUsedWeapon(rows: WeaponRow[]): WeaponRow | null {
  if (rows.length === 0) return null;
  const best = rows.reduce((b, r) => (r.kills > b.kills ? r : b), rows[0]);
  return best.kills > 0 ? best : null;
}

/**
 * The gun with the highest precision ratio among those with enough kills to
 * mean anything. A gun with four kills and four headshots is not evidence.
 */
export function mostPreciseWeapon(
  rows: WeaponRow[],
  minKills = 25
): WeaponRow | null {
  const eligible = rows.filter((r) => r.kills >= minKills);
  if (eligible.length === 0) return null;
  return eligible.reduce(
    (b, r) => (r.precisionRatio > b.precisionRatio ? r : b),
    eligible[0]
  );
}

export interface PrecisionGap {
  mostUsed: WeaponRow;
  mostPrecise: WeaponRow;
  /** Difference in precision ratio, always positive. */
  delta: number;
}

/**
 * The gap between the gun used most and the gun the player is actually most
 * accurate with. Returns null when there is nothing honest to claim: too few
 * weapons clear the sample floor, or the most used gun is also the most
 * precise one.
 */
export function precisionGap(rows: WeaponRow[], minKills = 25): PrecisionGap | null {
  const mostUsed = mostUsedWeapon(rows);
  if (!mostUsed) return null;
  const mostPrecise = mostPreciseWeapon(rows, minKills);
  if (!mostPrecise) return null;
  if (mostPrecise.referenceId === mostUsed.referenceId) return null;
  if (mostPrecise.precisionRatio <= mostUsed.precisionRatio) return null;
  return {
    mostUsed,
    mostPrecise,
    delta: mostPrecise.precisionRatio - mostUsed.precisionRatio
  };
}

/**
 * Merge the per character weapon histories of one account. The same weapon
 * carried on two characters becomes one row with the kills added together and
 * the precision ratio recomputed from the totals rather than averaged.
 */
export function mergeWeaponHistories(histories: WeaponUsage[][]): WeaponUsage[] {
  const byId = new Map<number, WeaponUsage>();
  for (const history of histories) {
    for (const entry of history) {
      const existing = byId.get(entry.referenceId);
      if (existing) {
        existing.kills += entry.kills;
        existing.precisionKills += entry.precisionKills;
      } else {
        byId.set(entry.referenceId, {
          referenceId: entry.referenceId,
          kills: entry.kills,
          precisionKills: entry.precisionKills,
          precisionRatio: 0
        });
      }
    }
  }
  const merged = [...byId.values()];
  for (const row of merged) {
    row.precisionRatio = row.kills > 0 ? row.precisionKills / row.kills : 0;
  }
  return merged.sort((a, b) => b.kills - a.kills || a.referenceId - b.referenceId);
}
