import { describe, expect, it } from 'vitest';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  curveToCanvas,
  layoutCard,
  truncateToWidth,
  wrapText
} from '../src/card';

// A stand in for canvas text measurement: every character is six units wide.
const measure = (text: string) => text.length * 6;

describe('layoutCard', () => {
  const L = layoutCard();

  it('uses the reference size by default', () => {
    expect(L.width).toBe(CARD_WIDTH);
    expect(L.height).toBe(CARD_HEIGHT);
    expect(L.scale).toBe(1);
  });

  it('keeps both columns inside the card', () => {
    expect(L.left.x).toBeGreaterThanOrEqual(0);
    expect(L.left.x + L.left.w).toBeLessThanOrEqual(L.width);
    expect(L.right.x + L.right.w).toBeLessThanOrEqual(L.width);
    expect(L.right.y + L.right.h).toBeLessThanOrEqual(L.height);
  });

  it('leaves a gutter between the columns', () => {
    expect(L.left.x + L.left.w).toBeLessThan(L.right.x);
  });

  it('gives the plot a square box', () => {
    expect(L.plot.w).toBe(L.plot.h);
  });

  it('keeps the plot inside the right column', () => {
    expect(L.plot.x).toBeGreaterThanOrEqual(L.right.x);
    expect(L.plot.x + L.plot.w).toBeLessThanOrEqual(L.right.x + L.right.w);
    expect(L.plot.y + L.plot.h).toBeLessThanOrEqual(L.height);
  });

  it('stacks the left column downward without overlap', () => {
    expect(L.eyebrow.y).toBeLessThan(L.numeral.y);
    expect(L.numeral.y).toBeLessThan(L.caption.y);
    expect(L.caption.y).toBeLessThan(L.rule.y);
    expect(L.rule.y).toBeLessThan(L.listTop);
  });

  it('fits three list rows above the footer', () => {
    const lastRow = L.listTop + 2 * L.rowHeight;
    expect(lastRow).toBeLessThan(L.footer.y);
  });

  it('keeps the plot caption clear of the footer', () => {
    const secondCaptionLine = L.plotCaption.y + L.plotCaption.size * 1.35;
    expect(secondCaptionLine).toBeLessThan(L.footerRight.y);
  });

  it('keeps the plot caption clear of the axis label', () => {
    expect(L.plotLabelX.y).toBeLessThan(L.plotCaption.y);
  });

  it('puts the gini badge above the plot', () => {
    expect(L.giniBadge.y).toBeLessThan(L.plot.y);
  });

  it('right aligns list values to the left column edge', () => {
    expect(L.rowValueX).toBe(L.left.x + L.left.w);
    expect(L.rowNameX).toBeGreaterThan(L.left.x);
    expect(L.rowNameX).toBeLessThan(L.rowValueX);
  });

  it('scales every box when the card is halved', () => {
    const half = layoutCard(CARD_WIDTH / 2, CARD_HEIGHT / 2);
    expect(half.scale).toBeCloseTo(0.5, 10);
    expect(half.pad).toBe(32);
    expect(half.plot.w).toBeCloseTo(L.plot.w / 2, 0);
    expect(half.right.x + half.right.w).toBeLessThanOrEqual(half.width);
  });

  it('scales up without leaving the canvas', () => {
    const big = layoutCard(CARD_WIDTH * 2, CARD_HEIGHT * 2);
    expect(big.scale).toBeCloseTo(2, 10);
    expect(big.plot.x + big.plot.w).toBeLessThanOrEqual(big.width);
    expect(big.footer.y).toBeLessThan(big.height);
  });

  it('keeps the caption width inside the left column', () => {
    expect(L.caption.maxWidth).toBeLessThanOrEqual(L.left.w);
  });
});

describe('curveToCanvas', () => {
  const plot = { x: 100, y: 50, w: 200, h: 200 };

  it('puts the origin at the bottom left', () => {
    expect(curveToCanvas([{ x: 0, y: 0 }], plot)[0]).toEqual({ x: 100, y: 250 });
  });

  it('puts one, one at the top right', () => {
    expect(curveToCanvas([{ x: 1, y: 1 }], plot)[0]).toEqual({ x: 300, y: 50 });
  });

  it('flips the vertical axis', () => {
    const [point] = curveToCanvas([{ x: 0.5, y: 0.25 }], plot);
    expect(point).toEqual({ x: 200, y: 200 });
  });

  it('clamps values outside the unit square', () => {
    const [low] = curveToCanvas([{ x: -1, y: -1 }], plot);
    const [high] = curveToCanvas([{ x: 4, y: 4 }], plot);
    expect(low).toEqual({ x: 100, y: 250 });
    expect(high).toEqual({ x: 300, y: 50 });
  });

  it('treats a non finite value as zero', () => {
    const [point] = curveToCanvas([{ x: NaN, y: Infinity }], plot);
    expect(point).toEqual({ x: 100, y: 250 });
  });

  it('keeps every point inside the plot box', () => {
    const points = curveToCanvas(
      [
        { x: 0, y: 0 },
        { x: 0.3, y: 0.02 },
        { x: 0.9, y: 0.4 },
        { x: 1, y: 1 }
      ],
      plot
    );
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(plot.x);
      expect(p.x).toBeLessThanOrEqual(plot.x + plot.w);
      expect(p.y).toBeGreaterThanOrEqual(plot.y);
      expect(p.y).toBeLessThanOrEqual(plot.y + plot.h);
    }
  });

  it('returns nothing for no points', () => {
    expect(curveToCanvas([], plot)).toEqual([]);
  });
});

describe('truncateToWidth', () => {
  it('leaves text that already fits', () => {
    expect(truncateToWidth('Hawkmoon', 200, measure)).toBe('Hawkmoon');
  });

  it('shortens text that does not fit', () => {
    const result = truncateToWidth('The Fourth Horseman of Something', 60, measure);
    expect(measure(result)).toBeLessThanOrEqual(60);
    expect(result.endsWith('...')).toBe(true);
  });

  it('returns nothing when even the ellipsis will not fit', () => {
    expect(truncateToWidth('Hawkmoon', 4, measure)).toBe('');
  });

  it('returns nothing for a zero or negative width', () => {
    expect(truncateToWidth('Hawkmoon', 0, measure)).toBe('');
    expect(truncateToWidth('Hawkmoon', -10, measure)).toBe('');
  });

  it('does not leave a dangling space before the ellipsis', () => {
    const result = truncateToWidth('Ace of Spades', 54, measure);
    expect(result).not.toContain(' ...');
  });
});

describe('wrapText', () => {
  it('keeps a short line on one line', () => {
    expect(wrapText('short line', 200, measure)).toEqual(['short line']);
  });

  it('breaks on words', () => {
    const lines = wrapText('one two three four five six', 60, measure);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(60);
  });

  it('never returns more lines than allowed', () => {
    const lines = wrapText('a b c d e f g h i j k l m n o p', 24, measure, 2);
    expect(lines).toHaveLength(2);
  });

  it('truncates the last line when it runs out of room', () => {
    const lines = wrapText('alpha bravo charlie delta echo foxtrot', 48, measure, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('...')).toBe(true);
  });

  it('keeps an unbreakable word on its own line rather than losing it', () => {
    const lines = wrapText('supercalifragilistic ok', 30, measure, 3);
    expect(lines[0]).toBe('supercalifragilistic');
  });

  it('returns nothing for an empty string', () => {
    expect(wrapText('', 100, measure)).toEqual([]);
  });
});
