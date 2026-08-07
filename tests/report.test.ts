import { describe, expect, it } from 'vitest';
import { DEMO_MAIN, loadDemoRival } from '../fixtures/demo';
import { mergeWeaponHistories } from '../src/pareto';
import {
  buildAccount,
  buildReport,
  compareVerdict,
  explainCurve,
  headlineSentence,
  joinWithManifest,
  numberWord,
  oneHitSentence,
  paretoSentence,
  PRECISION_NO_GAP,
  precisionSentence,
  precisionVerdict,
  type Report
} from '../src/report';
import type { PlayerRef, WeaponRow } from '../src/types';

const PLAYER: PlayerRef = {
  displayName: 'Guardian',
  displayNameCode: 1234,
  membershipType: 3,
  membershipId: '1'
};

function reportFor(demo: typeof DEMO_MAIN): Report {
  const merged = mergeWeaponHistories(demo.histories);
  const rows = joinWithManifest(merged, demo.weapons);
  return buildReport(buildAccount(demo.player, demo.histories.length, rows));
}

describe('joinWithManifest', () => {
  it('attaches names and computes each weapon share', () => {
    const rows = joinWithManifest(
      [
        { referenceId: 1, kills: 75, precisionKills: 30, precisionRatio: 0.4 },
        { referenceId: 2, kills: 25, precisionKills: 5, precisionRatio: 0.2 }
      ],
      {
        '1': {
          name: 'Fatebringer',
          icon: 'a.jpg',
          type: 'Hand Cannon',
          subType: 9,
          damageType: 1,
          tierType: 5,
          ammoType: 1
        }
      }
    );
    expect(rows[0].name).toBe('Fatebringer');
    expect(rows[0].share).toBeCloseTo(0.75, 12);
    expect(rows[1].name).toBe('Unknown weapon');
  });

  it('sorts by kills descending', () => {
    const rows = joinWithManifest(
      [
        { referenceId: 1, kills: 10, precisionKills: 0, precisionRatio: 0 },
        { referenceId: 2, kills: 90, precisionKills: 0, precisionRatio: 0 }
      ],
      {}
    );
    expect(rows[0].referenceId).toBe(2);
  });

  it('gives a zero share to an account with no kills', () => {
    const rows = joinWithManifest(
      [{ referenceId: 1, kills: 0, precisionKills: 0, precisionRatio: 0 }],
      {}
    );
    expect(rows[0].share).toBe(0);
  });
});

describe('headlineSentence', () => {
  it('leads with the count and the share', () => {
    expect(headlineSentence(312, 6, 0.712)).toBe(
      'You have put kills on 312 guns. Six of them are 71 percent of your kills.'
    );
  });

  it('groups thousands', () => {
    expect(headlineSentence(1240, 6, 0.5)).toContain('1,240 guns');
  });

  it('has a line for the single weapon account', () => {
    expect(headlineSentence(1, 1, 1)).toBe(
      'You have used exactly one gun. It is 100 percent of your kills.'
    );
  });

  it('has a line for the empty account', () => {
    expect(headlineSentence(0, 0, 0)).toContain('nothing on this account');
  });

  it('spells small numbers as words', () => {
    expect(numberWord(6)).toBe('Six');
    expect(numberWord(11)).toBe('Eleven');
    expect(numberWord(40)).toBe('40');
  });
});

describe('paretoSentence', () => {
  it('leads with the minimum set', () => {
    expect(paretoSentence(15, 337)).toBe(
      'Eighty percent of everything you have ever killed came from 15 guns. The other 322 split the rest.'
    );
  });

  it('uses the singular for one gun', () => {
    expect(paretoSentence(1, 40)).toContain('came from 1 gun.');
  });

  it('calls out the account that needs everything', () => {
    expect(paretoSentence(9, 9)).toContain('all 9 of your guns');
  });

  it('has a line for the empty account', () => {
    expect(paretoSentence(0, 0)).toContain('Nothing has been killed');
  });
});

describe('explainCurve', () => {
  it('names the shaded area in plain words', () => {
    const text = explainCurve(0.88, 15, 337);
    expect(text).toContain('shaded area');
    expect(text).toContain('15 of your 337 guns');
    expect(text).toContain('eighty percent');
  });

  it('escalates the verdict as concentration rises', () => {
    expect(explainCurve(0.3, 100, 300)).toContain('spread your kills around');
    expect(explainCurve(0.6, 40, 300)).toContain('favourites');
    expect(explainCurve(0.8, 20, 300)).toContain('creature of habit');
    expect(explainCurve(0.95, 4, 300)).toContain('as concentrated as this gets');
  });

  it('handles a one gun account', () => {
    expect(explainCurve(0, 1, 1)).toContain('straight line');
  });

  it('handles an empty account', () => {
    expect(explainCurve(0, 0, 0)).toContain('no curve');
  });
});

describe('precision copy', () => {
  const row = (id: number, kills: number, precisionKills: number, name: string): WeaponRow => ({
    referenceId: id,
    kills,
    precisionKills,
    precisionRatio: kills > 0 ? precisionKills / kills : 0,
    name,
    icon: '',
    type: 'Hand Cannon',
    subType: 9,
    damageType: 1,
    tierType: 5,
    ammoType: 1,
    share: 0
  });

  it('states the contradiction in both directions', () => {
    const rows = [row(1, 5000, 1000, 'Spray'), row(2, 900, 700, 'Pinpoint')];
    const text = precisionVerdict(rows, {
      mostUsed: rows[0],
      mostPrecise: rows[1],
      delta: 0.58
    });
    expect(text).toContain('Spray');
    expect(text).toContain('Pinpoint');
    expect(text).toContain('20 percent');
    expect(text).toContain('78 percent');
  });

  it('says plainly when the most used gun is also the most precise', () => {
    const rows = [row(1, 5000, 4000, 'Sharp'), row(2, 900, 90, 'Blunt')];
    expect(precisionVerdict(rows, null)).toBe(PRECISION_NO_GAP);
  });

  it('admits when no gun has enough kills to judge', () => {
    const rows = [row(1, 8, 8, 'Fluke'), row(2, 3, 0, 'Dud')];
    expect(precisionVerdict(rows, null)).toContain('enough kills');
  });

  it('returns null rather than a sentence when there is no gap', () => {
    expect(precisionSentence(null)).toBeNull();
  });
});

describe('oneHitSentence', () => {
  const row = (name: string, kills: number): WeaponRow => ({
    referenceId: name.length,
    kills,
    precisionKills: 0,
    precisionRatio: 0,
    name,
    icon: '',
    type: 'Sidearm',
    subType: 17,
    damageType: 1,
    tierType: 5,
    ammoType: 1,
    share: 0
  });

  it('counts them and names three', () => {
    const text = oneHitSentence([row('Ada', 1), row('Bell', 2), row('Cusp', 3), row('Dune', 4)]);
    expect(text).toContain('4 guns got five kills or fewer');
    expect(text).toContain('Ada, Bell, Cusp');
    expect(text).not.toContain('Dune');
  });

  it('uses the singular for one', () => {
    expect(oneHitSentence([row('Ada', 1)])).toContain('1 gun got');
  });

  it('has a line for the tidy account', () => {
    expect(oneHitSentence([])).toContain('tidier than most');
  });
});

describe('buildReport on the demo fixture', () => {
  const report = reportFor(DEMO_MAIN);

  it('has three characters merged into one row set', () => {
    expect(report.account.characterCount).toBe(3);
    expect(report.account.rows.length).toBeGreaterThan(300);
  });

  it('produces the headline number and sentence', () => {
    expect(report.headlineCount).toBe(6);
    expect(report.headlineShare).toBeGreaterThan(0.5);
    expect(report.headline).toContain('guns.');
  });

  it('leads with the real eighty percent minimum set', () => {
    expect(report.paretoHeadline).toContain(String(report.paretoCount) + ' guns');
    expect(report.paretoHeadline).toContain('Eighty percent');
  });

  it('needs far fewer guns than it owns to reach eighty percent', () => {
    expect(report.paretoCount).toBeGreaterThan(0);
    expect(report.paretoCount).toBeLessThan(report.account.rows.length / 5);
    expect(report.paretoShare).toBeGreaterThanOrEqual(0.8);
  });

  it('has a heavily concentrated curve', () => {
    expect(report.gini).toBeGreaterThan(0.8);
    expect(report.gini).toBeLessThan(1);
    expect(report.lorenz[0]).toEqual({ x: 0, y: 0 });
  });

  it('names ten weapons', () => {
    expect(report.top).toHaveLength(10);
    expect(report.top[0].name.length).toBeGreaterThan(0);
    expect(report.top[0].kills).toBeGreaterThanOrEqual(report.top[1].kills);
  });

  it('finds a precision gap worth reporting', () => {
    expect(report.precision).not.toBeNull();
    expect(report.precision?.mostPrecise.referenceId).not.toBe(
      report.precision?.mostUsed.referenceId
    );
  });

  it('reads as a hand cannon player who never touched a bow', () => {
    expect(report.archetype.sentence).toBe(
      'You are a hand cannon and rocket launcher player who has never used a bow at all.'
    );
    expect(report.archetype.neverUsed).toEqual(['Combat Bow']);
  });

  it('has a believable long tail', () => {
    expect(report.oneHitWonders.length).toBeGreaterThan(20);
    for (const row of report.oneHitWonders) expect(row.kills).toBeLessThanOrEqual(5);
  });

  it('has real weapon names from the manifest, not placeholders', () => {
    for (const row of report.top) expect(row.name).not.toBe('Unknown weapon');
  });

  it('adds up: every share sums to one', () => {
    const total = report.account.rows.reduce((a, r) => a + r.share, 0);
    expect(total).toBeCloseTo(1, 8);
  });
});

describe('compareVerdict', async () => {
  const a = reportFor(DEMO_MAIN);
  const b = reportFor(await loadDemoRival());

  it('names the more concentrated account', () => {
    const verdict = compareVerdict(a, b);
    expect(verdict).toContain('Vaultkeeper');
    expect(verdict).toContain('more concentrated');
  });

  it('is symmetric in argument order', () => {
    expect(compareVerdict(a, b)).toBe(compareVerdict(b, a));
  });

  it('calls a tie a tie', () => {
    const verdict = compareVerdict(a, { ...a, account: { ...a.account, player: PLAYER } });
    expect(verdict).toContain('equally set in their ways');
  });
});
