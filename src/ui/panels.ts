// The page sections. Each takes a Report and returns a detached element.

import { pluralLabel } from '../archetype';
import { DAMAGE_TYPES, expandIcon, TIER_TYPES } from '../manifest';
import type { Report } from '../report';
import type { WeaponRow } from '../types';
import { clear, el, num, pct } from './dom';
import { renderLorenz } from './lorenz';

export function headlinePanel(report: Report): HTMLElement {
  const section = el('section', 'panel headline');
  const eyebrow = el('p', 'eyebrow', 'The number');
  const figure = el('p', 'figure');
  figure.textContent = pct(report.headlineShare, 0);
  const sentence = el('p', 'headline-line', report.headline);
  const pareto = el('p', 'pareto-line', report.paretoHeadline);

  const meta = el('ul', 'meta');
  const total = report.account.totalKills;
  const items: [string, string][] = [
    ['kills counted', num(total)],
    ['guns with kills', num(report.account.rows.length)],
    ['characters', num(report.account.characterCount)],
    [
      'guns for eighty percent',
      num(report.paretoCount) + ' of ' + num(report.account.rows.length)
    ]
  ];
  for (const [label, value] of items) {
    const li = el('li');
    li.appendChild(el('span', 'meta-value', value));
    li.appendChild(el('span', 'meta-label', label));
    meta.appendChild(li);
  }

  section.append(eyebrow, figure, sentence, pareto, meta);
  return section;
}

export function curvePanel(report: Report): HTMLElement {
  const section = el('section', 'panel curve');
  section.appendChild(el('h2', null, 'How your kills are spread'));
  const chartWrap = el('div', 'chart');
  chartWrap.appendChild(
    renderLorenz({
      curves: [{ points: report.lorenz, className: 'lz-primary', label: 'you' }],
      areaLabel: 'the gap'
    })
  );
  section.appendChild(chartWrap);

  const legend = el('div', 'legend');
  legend.appendChild(legendItem('lz-key-equality', 'every gun used equally'));
  legend.appendChild(legendItem('lz-key-primary', 'you'));
  legend.appendChild(legendItem('lz-key-area', 'the gap between the two'));
  section.appendChild(legend);

  const gi = el('p', 'gini');
  gi.appendChild(el('span', 'gini-value', report.gini.toFixed(2)));
  gi.appendChild(
    el(
      'span',
      'gini-label',
      'concentration, where 0 means every gun did the same work and 1 means one gun did all of it'
    )
  );
  section.appendChild(gi);
  section.appendChild(el('p', 'prose', report.lorenzExplanation));
  return section;
}

function legendItem(swatch: string, text: string): HTMLElement {
  const item = el('span', 'legend-item');
  item.appendChild(el('i', 'swatch ' + swatch));
  item.appendChild(el('span', null, text));
  return item;
}

export function topPanel(report: Report): HTMLElement {
  const section = el('section', 'panel top');
  section.appendChild(el('h2', null, 'The ten you actually use'));
  section.appendChild(weaponTable(report.top, report.account.totalKills));
  return section;
}

export function weaponTable(rows: WeaponRow[], _total: number): HTMLElement {
  const table = el('table', 'weapons');
  const head = el('thead');
  const headRow = el('tr');
  for (const [label, cls] of [
    ['', 'col-rank'],
    ['weapon', 'col-name'],
    ['type', 'col-type'],
    ['element', 'col-element'],
    ['kills', 'col-num'],
    ['share', 'col-num'],
    ['precision', 'col-num']
  ] as [string, string][]) {
    headRow.appendChild(el('th', cls, label));
  }
  head.appendChild(headRow);
  table.appendChild(head);

  const body = el('tbody');
  rows.forEach((row, i) => {
    const tr = el('tr');
    tr.appendChild(el('td', 'col-rank', String(i + 1)));

    const nameCell = el('td', 'col-name');
    const nameRow = el('div', 'name-row');
    const icon = el('img', 'icon');
    icon.src = expandIcon(row.icon);
    icon.alt = '';
    icon.loading = 'lazy';
    icon.width = 32;
    icon.height = 32;
    nameRow.appendChild(icon);
    const nameWrap = el('span', 'name-wrap');
    const name = el('span', 'name', row.name);
    if (row.tierType === 6) name.classList.add('exotic');
    nameWrap.appendChild(name);
    nameWrap.appendChild(
      el('span', 'tier', TIER_TYPES[row.tierType] || '')
    );
    nameRow.appendChild(nameWrap);
    nameCell.appendChild(nameRow);
    tr.appendChild(nameCell);

    tr.appendChild(el('td', 'col-type', row.type));
    tr.appendChild(el('td', 'col-element', DAMAGE_TYPES[row.damageType] || ''));
    tr.appendChild(el('td', 'col-num', num(row.kills)));
    tr.appendChild(el('td', 'col-num', pct(row.share, 1)));
    tr.appendChild(el('td', 'col-num', pct(row.precisionRatio, 0)));
    body.appendChild(tr);
  });
  table.appendChild(body);
  return table;
}

export function precisionPanel(report: Report): HTMLElement {
  const section = el('section', 'panel precision');
  section.appendChild(el('h2', null, 'What you use against what you are good with'));
  section.appendChild(el('p', 'prose lead', report.precisionLine));

  const ranked = report.account.rows
    .filter((r) => r.kills >= 100)
    .slice()
    .sort((a, b) => b.precisionRatio - a.precisionRatio)
    .slice(0, 5);
  if (ranked.length > 0) {
    section.appendChild(
      el('p', 'note', 'Cleanest guns you use often, at least 100 kills each.')
    );
    const list = el('ol', 'precision-list');
    for (const row of ranked) {
      const li = el('li');
      li.appendChild(el('span', 'p-name', row.name));
      const bar = el('span', 'p-bar');
      const fill = el('i');
      fill.style.width = (row.precisionRatio * 100).toFixed(1) + '%';
      bar.appendChild(fill);
      li.appendChild(bar);
      li.appendChild(el('span', 'p-value', pct(row.precisionRatio, 0)));
      list.appendChild(li);
    }
    section.appendChild(list);
  }
  return section;
}

export function archetypePanel(report: Report): HTMLElement {
  const section = el('section', 'panel archetype');
  section.appendChild(el('h2', null, 'What that makes you'));
  section.appendChild(el('p', 'prose lead', report.archetype.sentence));
  if (report.slotLine) section.appendChild(el('p', 'prose', report.slotLine));

  const bars = el('ul', 'type-bars');
  const shown = report.archetype.byType.filter((t) => t.kills > 0).slice(0, 8);
  for (const bucket of shown) {
    const li = el('li');
    li.appendChild(el('span', 't-name', bucket.type));
    const bar = el('span', 't-bar');
    const fill = el('i');
    fill.style.width = (bucket.share * 100).toFixed(1) + '%';
    bar.appendChild(fill);
    li.appendChild(bar);
    li.appendChild(el('span', 't-value', pct(bucket.share, 1)));
    bars.appendChild(li);
  }
  section.appendChild(bars);

  const never = report.archetype.neverUsed;
  if (never.length > 0) {
    const list = never.map((t) => pluralLabel(t)).join(', ');
    section.appendChild(
      el(
        'p',
        'prose absence',
        'Never a single recorded kill with: ' + list + '.'
      )
    );
  }
  return section;
}

export function tailPanel(report: Report, sentence: string): HTMLElement {
  const section = el('section', 'panel tail');
  section.appendChild(el('h2', null, 'The ones you tried once'));
  section.appendChild(el('p', 'prose lead', sentence));
  const chips = el('ul', 'chips');
  for (const row of report.oneHitWonders.slice(0, 24)) {
    const li = el('li');
    li.appendChild(el('span', 'chip-name', row.name));
    li.appendChild(el('span', 'chip-kills', String(row.kills)));
    chips.appendChild(li);
  }
  if (report.oneHitWonders.length > 0) section.appendChild(chips);
  return section;
}

export function statusPanel(title: string, body: string): HTMLElement {
  const section = el('section', 'panel status');
  section.appendChild(el('h2', null, title));
  section.appendChild(el('p', 'prose', body));
  return section;
}

export function mount(root: Element, nodes: Element[]): void {
  clear(root);
  for (const node of nodes) root.appendChild(node);
}
