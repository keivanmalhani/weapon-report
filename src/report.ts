// Joins raw usage against the manifest and produces every number the page
// puts on screen.

import { readArchetype, slotSentence, type ArchetypeRead } from './archetype';
import type { WeaponIndex } from './manifest';
import {
  gini,
  lorenzPoints,
  mostPreciseWeapon,
  mostUsedWeapon,
  oneHitWonders,
  paretoMinimumSet,
  precisionGap,
  shareOfTop,
  type LorenzPoint,
  type PrecisionGap
} from './pareto';
import type { AccountReport, PlayerRef, WeaponRow, WeaponUsage } from './types';

export interface Report {
  account: AccountReport;
  /** Minimum weapons covering eighty percent of kills. */
  paretoCount: number;
  paretoShare: number;
  /** Same idea at the more quotable top six. */
  headlineCount: number;
  headlineShare: number;
  gini: number;
  lorenz: LorenzPoint[];
  top: WeaponRow[];
  precision: PrecisionGap | null;
  precisionLine: string;
  archetype: ArchetypeRead;
  slotLine: string;
  oneHitWonders: WeaponRow[];
  headline: string;
  /** The eighty percent minimum set, stated as a sentence. */
  paretoHeadline: string;
  lorenzExplanation: string;
}

const UNKNOWN_WEAPON = 'Unknown weapon';

/** Attach manifest fields to raw usage and compute each weapon's share. */
export function joinWithManifest(
  usage: WeaponUsage[],
  index: WeaponIndex
): WeaponRow[] {
  const total = usage.reduce((a, u) => a + u.kills, 0);
  return usage
    .map((u) => {
      const def = index[String(u.referenceId)];
      return {
        ...u,
        name: def?.name || UNKNOWN_WEAPON,
        icon: def?.icon || '',
        type: def?.type || 'Unknown',
        subType: def?.subType ?? 0,
        damageType: def?.damageType ?? 0,
        tierType: def?.tierType ?? 0,
        ammoType: def?.ammoType ?? 0,
        share: total > 0 ? u.kills / total : 0
      };
    })
    .sort((a, b) => b.kills - a.kills || a.name.localeCompare(b.name));
}

export function buildAccount(
  player: PlayerRef,
  characterCount: number,
  rows: WeaponRow[]
): AccountReport {
  return {
    player,
    characterCount,
    rows,
    totalKills: rows.reduce((a, r) => a + r.kills, 0),
    totalPrecisionKills: rows.reduce((a, r) => a + r.precisionKills, 0)
  };
}

/** Everything the page needs, from one list of joined rows. */
export function buildReport(account: AccountReport): Report {
  const rows = account.rows;
  const kills = rows.map((r) => r.kills);
  const paretoCount = paretoMinimumSet(kills, 0.8);
  const paretoShare = shareOfTop(kills, paretoCount);
  const headlineCount = Math.min(6, rows.filter((r) => r.kills > 0).length);
  const headlineShare = shareOfTop(kills, headlineCount);
  const g = gini(kills);
  const archetype = readArchetype(rows);
  const gap = precisionGap(rows, PRECISION_SAMPLE_FLOOR);
  return {
    account,
    paretoCount,
    paretoShare,
    headlineCount,
    headlineShare,
    gini: g,
    lorenz: lorenzPoints(kills),
    top: rows.slice(0, 10),
    precision: gap,
    precisionLine: precisionVerdict(rows, gap),
    archetype,
    slotLine: slotSentence(archetype.bySlot),
    oneHitWonders: oneHitWonders(rows, 5),
    headline: headlineSentence(rows.length, headlineCount, headlineShare),
    paretoHeadline: paretoSentence(paretoCount, rows.length),
    lorenzExplanation: explainCurve(g, paretoCount, rows.length)
  };
}

/** "You own 312 guns. Six of them are 71 percent of your kills." */
export function headlineSentence(
  ownedCount: number,
  topCount: number,
  topShare: number
): string {
  if (ownedCount === 0 || topCount === 0) {
    return 'There is nothing on this account to count yet.';
  }
  const pct = Math.round(topShare * 100);
  if (ownedCount === 1) {
    return 'You have used exactly one gun. It is 100 percent of your kills.';
  }
  const word = numberWord(topCount);
  const owned = ownedCount.toLocaleString('en-US');
  return (
    'You have put kills on ' +
    owned +
    ' guns. ' +
    word +
    ' of them are ' +
    pct +
    ' percent of your kills.'
  );
}

/**
 * The real answer to the question the site asks: the fewest guns that cover
 * eighty percent of an account's kills.
 */
export function paretoSentence(paretoCount: number, ownedCount: number): string {
  if (ownedCount === 0 || paretoCount === 0) {
    return 'Nothing has been killed with anything yet.';
  }
  if (paretoCount === ownedCount) {
    return (
      'It takes all ' +
      ownedCount +
      ' of your guns to reach eighty percent of your kills, which almost nobody manages.'
    );
  }
  const noun = paretoCount === 1 ? 'gun' : 'guns';
  return (
    'Eighty percent of everything you have ever killed came from ' +
    paretoCount +
    ' ' +
    noun +
    '. The other ' +
    (ownedCount - paretoCount) +
    ' split the rest.'
  );
}

const WORDS = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve'
];

export function numberWord(n: number): string {
  return WORDS[n] || String(n);
}

/** One sentence about what the shape of the curve means about the player. */
export function explainCurve(
  giniValue: number,
  paretoCount: number,
  ownedCount: number
): string {
  if (ownedCount === 0) return 'There is no curve to draw yet.';
  if (ownedCount === 1) {
    return 'With one gun there is no spread to measure, so the curve is a straight line.';
  }
  const pctOfGuns = Math.max(1, Math.round((paretoCount / ownedCount) * 100));
  const base =
    'The shaded area is the distance between how you actually play and a player who used every gun equally. ';
  const detail =
    paretoCount +
    ' of your ' +
    ownedCount +
    ' guns, about ' +
    pctOfGuns +
    ' percent of them, carry eighty percent of your kills. ';
  let verdict: string;
  if (giniValue >= 0.92) verdict = 'That is about as concentrated as this gets.';
  else if (giniValue >= 0.75) verdict = 'You are a creature of habit.';
  else if (giniValue >= 0.55) verdict = 'You have favourites but you do rotate.';
  else verdict = 'You genuinely spread your kills around, which is unusual.';
  return base + detail + verdict;
}

/**
 * How many kills a gun needs before its precision ratio is worth quoting.
 * Below this a lucky afternoon looks like skill.
 */
export const PRECISION_SAMPLE_FLOOR = 100;

/**
 * The line under the precision panel. Three outcomes: a real contradiction,
 * an honest admission that there is none, or not enough evidence yet.
 */
export function precisionVerdict(
  rows: WeaponRow[],
  gap: PrecisionGap | null
): string {
  const sentence = precisionSentence(gap);
  if (sentence) return sentence;
  const used = mostUsedWeapon(rows);
  const precise = mostPreciseWeapon(rows, PRECISION_SAMPLE_FLOOR);
  if (used && precise && used.referenceId === precise.referenceId) {
    return PRECISION_NO_GAP;
  }
  return PRECISION_TOO_THIN;
}

/** The precision contradiction, or null when there is nothing to say. */
export function precisionSentence(gap: PrecisionGap | null): string | null {
  if (!gap) return null;
  const usedPct = Math.round(gap.mostUsed.precisionRatio * 100);
  const bestPct = Math.round(gap.mostPrecise.precisionRatio * 100);
  return (
    'You reach for ' +
    gap.mostUsed.name +
    ' most, and you land ' +
    usedPct +
    ' percent of those kills as precision hits. You are cleaner with ' +
    gap.mostPrecise.name +
    ', at ' +
    bestPct +
    ' percent, and you use it less.'
  );
}

/** The line used when the most used gun is also the most precise one. */
export const PRECISION_NO_GAP =
  'Your most used gun is also your most precise one. There is no contradiction here to point at, which is its own kind of answer.';

/** Shown when no gun has enough kills for its precision ratio to mean much. */
export const PRECISION_TOO_THIN =
  'No gun here has enough kills for its precision ratio to mean anything yet.';

/** "Forty one guns got five kills or fewer." */
export function oneHitSentence(rows: WeaponRow[]): string {
  if (rows.length === 0) {
    return 'Every gun you have touched got more than five kills, which is tidier than most.';
  }
  const names = rows
    .slice()
    .sort((a, b) => a.kills - b.kills || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((r) => r.name);
  const count = rows.length;
  const noun = count === 1 ? 'gun' : 'guns';
  const listed = names.join(', ');
  return (
    count +
    ' ' +
    noun +
    ' got five kills or fewer. You picked up ' +
    listed +
    ', and you never went back.'
  );
}

/** Compare verdict for two reports. */
export function compareVerdict(a: Report, b: Report): string {
  const nameA = a.account.player.displayName;
  const nameB = b.account.player.displayName;
  const diff = Math.abs(a.gini - b.gini);
  if (diff < 0.02) {
    return (
      nameA +
      ' and ' +
      nameB +
      ' are equally set in their ways. Neither of you gets to win this one.'
    );
  }
  const more = a.gini > b.gini ? a : b;
  const less = a.gini > b.gini ? b : a;
  const moreName = more.account.player.displayName;
  const lessName = less.account.player.displayName;
  return (
    moreName +
    ' is the more concentrated player. ' +
    more.paretoCount +
    ' guns cover eighty percent of ' +
    moreName +
    ' kills against ' +
    less.paretoCount +
    ' for ' +
    lessName +
    '.'
  );
}
