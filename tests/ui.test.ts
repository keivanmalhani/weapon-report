// @vitest-environment jsdom
//
// A smoke test over the rendering half. jsdom has no canvas, so the share
// panel is exercised only as far as the element tree.

import { describe, expect, it } from 'vitest';
import { DEMO_MAIN } from '../fixtures/demo';
import { mergeWeaponHistories } from '../src/pareto';
import { buildAccount, buildReport, joinWithManifest, oneHitSentence } from '../src/report';
import { renderLorenz } from '../src/ui/lorenz';
import {
  archetypePanel,
  curvePanel,
  headlinePanel,
  precisionPanel,
  statusPanel,
  tailPanel,
  topPanel,
  weaponTable
} from '../src/ui/panels';

const merged = mergeWeaponHistories(DEMO_MAIN.histories);
const rows = joinWithManifest(merged, DEMO_MAIN.weapons);
const report = buildReport(buildAccount(DEMO_MAIN.player, 3, rows));

describe('headlinePanel', () => {
  const panel = headlinePanel(report);

  it('leads with a percentage as the display numeral', () => {
    expect(panel.querySelector('.figure')?.textContent).toMatch(/^\d+%$/);
  });

  it('carries the headline sentence', () => {
    expect(panel.querySelector('.headline-line')?.textContent).toBe(report.headline);
  });

  it('states the eighty percent minimum set under the headline', () => {
    expect(panel.querySelector('.pareto-line')?.textContent).toBe(report.paretoHeadline);
  });

  it('lists four meta figures', () => {
    expect(panel.querySelectorAll('.meta li')).toHaveLength(4);
  });
});

describe('curvePanel', () => {
  const panel = curvePanel(report);

  it('draws an svg with a curve, a diagonal and a shaded gap', () => {
    expect(panel.querySelector('svg.lorenz')).not.toBeNull();
    expect(panel.querySelector('.lz-curve')).not.toBeNull();
    expect(panel.querySelector('.lz-equality')).not.toBeNull();
    expect(panel.querySelector('.lz-area')).not.toBeNull();
  });

  it('labels the axes in plain words', () => {
    const text = panel.textContent || '';
    expect(text).toContain('share of your guns');
    expect(text).toContain('share of your kills');
  });

  it('explains the shape in a sentence', () => {
    expect(panel.querySelector('.prose')?.textContent).toBe(report.lorenzExplanation);
  });

  it('shows the concentration number', () => {
    expect(panel.querySelector('.gini-value')?.textContent).toBe(report.gini.toFixed(2));
  });

  it('gives the chart an accessible description', () => {
    const svg = panel.querySelector('svg.lorenz');
    expect(svg?.getAttribute('role')).toBe('img');
    expect((svg?.getAttribute('aria-label') || '').length).toBeGreaterThan(20);
  });
});

describe('weaponTable', () => {
  const table = weaponTable(report.top, report.account.totalKills);

  it('has one row per weapon', () => {
    expect(table.querySelectorAll('tbody tr')).toHaveLength(10);
  });

  it('has seven columns', () => {
    expect(table.querySelectorAll('thead th')).toHaveLength(7);
  });

  it('loads icons from bungie.net', () => {
    const src = table.querySelector('img')?.getAttribute('src') || '';
    expect(src.startsWith('https://www.bungie.net/')).toBe(true);
  });

  it('marks exotics so they read differently', () => {
    const exotic = report.top.find((r) => r.tierType === 6);
    expect(exotic).toBeTruthy();
    expect(table.querySelector('.name.exotic')).not.toBeNull();
  });

  it('renders empty rows without throwing', () => {
    expect(weaponTable([], 0).querySelectorAll('tbody tr')).toHaveLength(0);
  });
});

describe('the remaining panels', () => {
  it('states the precision verdict', () => {
    const panel = precisionPanel(report);
    expect(panel.querySelector('.prose.lead')?.textContent).toBe(report.precisionLine);
    expect(panel.querySelectorAll('.precision-list li').length).toBeGreaterThan(0);
  });

  it('states the archetype and names the absence', () => {
    const panel = archetypePanel(report);
    expect(panel.querySelector('.prose.lead')?.textContent).toBe(
      report.archetype.sentence
    );
    expect(panel.querySelector('.absence')?.textContent).toContain('bows');
  });

  it('lists the one hit wonders as chips', () => {
    const panel = tailPanel(report, oneHitSentence(report.oneHitWonders));
    expect(panel.querySelectorAll('.chips li').length).toBeGreaterThan(0);
  });

  it('renders a status panel for a failure', () => {
    const panel = statusPanel('This account is private', 'Because it is.');
    expect(panel.querySelector('h2')?.textContent).toBe('This account is private');
  });

  it('renders the top panel with a heading', () => {
    expect(topPanel(report).querySelector('h2')?.textContent).toContain('ten');
  });
});

describe('renderLorenz', () => {
  it('overlays two curves for compare mode', () => {
    const svg = renderLorenz({
      curves: [
        { points: report.lorenz, className: 'lz-primary', label: 'a' },
        { points: report.lorenz, className: 'lz-secondary', label: 'b' }
      ]
    });
    expect(svg.querySelectorAll('.lz-curve')).toHaveLength(2);
  });

  it('skips the animation when asked', () => {
    const svg = renderLorenz({
      curves: [{ points: report.lorenz, className: 'lz-primary', label: 'a' }],
      animate: false
    });
    const path = svg.querySelector('.lz-curve') as SVGPathElement;
    expect(path.style.animation).toBe('');
  });

  it('draws the diagonal for an empty account without throwing', () => {
    const svg = renderLorenz({
      curves: [
        {
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 }
          ],
          className: 'lz-primary',
          label: 'nobody'
        }
      ]
    });
    expect(svg.querySelector('.lz-curve')?.getAttribute('d')).toContain('M');
  });
});
