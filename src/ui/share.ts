// The share card: build the data, draw it, offer it as a PNG.

import { formatBungieName } from '../bungie';
import { CARD_HEIGHT, CARD_WIDTH, drawCard, layoutCard, type CardData } from '../card';
import type { Report } from '../report';
import { el, num, pct } from './dom';

export const CARD_FOOTER = 'keivanmalhani.github.io/weapon-report';

/** Turn a report into the handful of strings the card shows. */
export function cardDataFromReport(report: Report): CardData {
  const owned = report.account.rows.length;
  const caption =
    owned > 0
      ? 'of ' +
        num(report.account.totalKills) +
        ' kills come from ' +
        report.headlineCount +
        ' of the ' +
        num(owned) +
        ' guns this account has ever used.'
      : 'No recorded kills on this account.';
  return {
    eyebrow: 'WEAPON REPORT',
    headlineNumber: pct(report.headlineShare, 0),
    caption,
    giniLabel: 'concentration ' + report.gini.toFixed(2),
    areaNote:
      'Dotted line: every gun doing equal work. Shaded gap: how far off that you are.',
    subject: formatBungieName(report.account.player),
    lorenz: report.lorenz,
    top: report.top.slice(0, 3).map((row) => ({
      name: row.name,
      value: num(row.kills)
    })),
    footer: CARD_FOOTER
  };
}

export function renderCardCanvas(report: Report): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  drawCard(ctx, cardDataFromReport(report), layoutCard(CARD_WIDTH, CARD_HEIGHT));
  return canvas;
}

function fileName(report: Report): string {
  const name = report.account.player.displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return 'weapon-report-' + (name || 'guardian') + '.png';
}

export function sharePanel(report: Report): HTMLElement {
  const section = el('section', 'panel share');
  section.appendChild(el('h2', null, 'Take it with you'));
  section.appendChild(
    el(
      'p',
      'prose',
      'A 1200 by 630 image with the number, the curve and your top three.'
    )
  );

  const canvas = renderCardCanvas(report);
  canvas.className = 'card-preview';
  const frame = el('div', 'card-frame');
  frame.appendChild(canvas);
  section.appendChild(frame);

  const actions = el('div', 'actions');
  const download = el('button', 'button primary', 'Download PNG');
  download.type = 'button';
  download.addEventListener('click', () => {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = el('a');
      link.href = url;
      link.download = fileName(report);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  });

  const copy = el('button', 'button', 'Copy to clipboard');
  copy.type = 'button';
  const note = el('span', 'action-note');
  copy.addEventListener('click', async () => {
    note.textContent = '';
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );
      if (!blob) throw new Error('no blob');
      const anyWindow = window as unknown as {
        ClipboardItem?: new (items: Record<string, Blob>) => ClipboardItem;
      };
      if (!anyWindow.ClipboardItem || !navigator.clipboard?.write) {
        throw new Error('unsupported');
      }
      await navigator.clipboard.write([
        new anyWindow.ClipboardItem({ 'image/png': blob })
      ]);
      note.textContent = 'Copied.';
    } catch {
      note.textContent = 'This browser will not take an image from the clipboard API. Use the download.';
    }
  });

  actions.append(download, copy, note);
  section.appendChild(actions);
  return section;
}
