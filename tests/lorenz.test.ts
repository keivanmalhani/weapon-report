// The chart module reads document, so these tests only exercise the pure
// path maths it exposes. The DOM half is left to the browser.

import { describe, expect, it } from 'vitest';
import { curvePath, gapPath, PLOT } from '../src/ui/lorenz';

const box = {
  x: PLOT.padLeft,
  y: PLOT.padTop,
  w: PLOT.size - PLOT.padLeft - PLOT.padRight,
  h: PLOT.size - PLOT.padTop - PLOT.padBottom
};

function coords(path: string): [number, number][] {
  return path
    .split(/(?=[ML])/)
    .map((part) => part.trim())
    .filter((part) => /^[ML]/.test(part))
    .map((part) => {
      const [x, y] = part.slice(1).trim().split(/\s+/).map(Number);
      return [x, y] as [number, number];
    });
}

describe('curvePath', () => {
  it('is empty for no points', () => {
    expect(curvePath([])).toBe('');
  });

  it('starts with a move and continues with lines', () => {
    const path = curvePath([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.2 },
      { x: 1, y: 1 }
    ]);
    expect(path.startsWith('M')).toBe(true);
    expect(path.split('L')).toHaveLength(3);
  });

  it('anchors the origin at the bottom left of the plot', () => {
    const [first] = coords(curvePath([{ x: 0, y: 0 }]));
    expect(first[0]).toBeCloseTo(box.x, 6);
    expect(first[1]).toBeCloseTo(box.y + box.h, 6);
  });

  it('anchors one, one at the top right of the plot', () => {
    const [first] = coords(curvePath([{ x: 1, y: 1 }]));
    expect(first[0]).toBeCloseTo(box.x + box.w, 6);
    expect(first[1]).toBeCloseTo(box.y, 6);
  });

  it('clamps points outside the unit square', () => {
    const [low] = coords(curvePath([{ x: -3, y: 9 }]));
    expect(low[0]).toBeCloseTo(box.x, 6);
    expect(low[1]).toBeCloseTo(box.y, 6);
  });

  it('keeps every point inside the plot box', () => {
    const points = coords(
      curvePath([
        { x: 0, y: 0 },
        { x: 0.4, y: 0.02 },
        { x: 0.95, y: 0.5 },
        { x: 1, y: 1 }
      ])
    );
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(box.x - 1e-6);
      expect(x).toBeLessThanOrEqual(box.x + box.w + 1e-6);
      expect(y).toBeGreaterThanOrEqual(box.y - 1e-6);
      expect(y).toBeLessThanOrEqual(box.y + box.h + 1e-6);
    }
  });
});

describe('gapPath', () => {
  it('is empty for no points', () => {
    expect(gapPath([])).toBe('');
  });

  it('closes the shape back along the equality diagonal', () => {
    const path = gapPath([
      { x: 0, y: 0 },
      { x: 1, y: 1 }
    ]);
    expect(path.endsWith('Z')).toBe(true);
  });

  it('finishes at the top right corner before closing', () => {
    const path = gapPath([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.1 },
      { x: 1, y: 1 }
    ]);
    const points = coords(path);
    const last = points[points.length - 1];
    expect(last[0]).toBeCloseTo(box.x + box.w, 6);
    expect(last[1]).toBeCloseTo(box.y, 6);
  });

  it('contains the curve it was built from', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.1 },
      { x: 1, y: 1 }
    ];
    expect(gapPath(points).startsWith(curvePath(points))).toBe(true);
  });
});
