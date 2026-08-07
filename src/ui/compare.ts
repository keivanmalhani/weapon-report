// Compare mode: two accounts, both curves on one plot, one verdict.

import { compareVerdict, type Report } from '../report';
import { el, num } from './dom';
import { renderLorenz } from './lorenz';

export function comparePanel(a: Report, b: Report): HTMLElement {
  const section = el('section', 'panel compare-result');
  section.appendChild(el('h2', null, 'Side by side'));

  const chartWrap = el('div', 'chart');
  chartWrap.appendChild(
    renderLorenz({
      curves: [
        { points: a.lorenz, className: 'lz-primary', label: a.account.player.displayName },
        { points: b.lorenz, className: 'lz-secondary', label: b.account.player.displayName }
      ],
      areaLabel: ''
    })
  );
  section.appendChild(chartWrap);

  const legend = el('div', 'legend');
  legend.appendChild(swatch('lz-key-primary', a.account.player.displayName));
  legend.appendChild(swatch('lz-key-secondary', b.account.player.displayName));
  legend.appendChild(swatch('lz-key-equality', 'every gun used equally'));
  section.appendChild(legend);

  section.appendChild(el('p', 'prose lead', compareVerdict(a, b)));

  const table = el('table', 'compare-table');
  const head = el('tr');
  head.appendChild(el('th', null, ''));
  head.appendChild(el('th', 'col-num', a.account.player.displayName));
  head.appendChild(el('th', 'col-num', b.account.player.displayName));
  table.appendChild(head);
  const rows: [string, string, string][] = [
    ['concentration', a.gini.toFixed(2), b.gini.toFixed(2)],
    ['guns for eighty percent', num(a.paretoCount), num(b.paretoCount)],
    ['guns with kills', num(a.account.rows.length), num(b.account.rows.length)],
    ['kills counted', num(a.account.totalKills), num(b.account.totalKills)],
    [
      'top gun share',
      (a.account.rows[0] ? Math.round(a.account.rows[0].share * 100) : 0) + '%',
      (b.account.rows[0] ? Math.round(b.account.rows[0].share * 100) : 0) + '%'
    ]
  ];
  for (const [label, left, right] of rows) {
    const tr = el('tr');
    tr.appendChild(el('td', null, label));
    tr.appendChild(el('td', 'col-num', left));
    tr.appendChild(el('td', 'col-num', right));
    table.appendChild(tr);
  }
  section.appendChild(table);
  return section;
}

function swatch(cls: string, label: string): HTMLElement {
  const item = el('span', 'legend-item');
  item.appendChild(el('i', 'swatch ' + cls));
  item.appendChild(el('span', null, label));
  return item;
}
