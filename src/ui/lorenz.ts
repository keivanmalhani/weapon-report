// The Lorenz curve, drawn as inline SVG.
//
// The axes are labelled in words rather than in statistics vocabulary: how
// much of your collection, against how much of your killing. The shaded area
// between the diagonal and the curve is the whole point, so it is shaded and
// then named in the caption underneath rather than left as a mystery.

import type { LorenzPoint } from '../pareto';
import { prefersReducedMotion, svgEl } from './dom';

export const PLOT = {
  size: 420,
  padLeft: 46,
  padBottom: 42,
  padTop: 16,
  padRight: 16
};

export interface CurveSpec {
  points: LorenzPoint[];
  className: string;
  label: string;
}

function inner(): { x: number; y: number; w: number; h: number } {
  return {
    x: PLOT.padLeft,
    y: PLOT.padTop,
    w: PLOT.size - PLOT.padLeft - PLOT.padRight,
    h: PLOT.size - PLOT.padTop - PLOT.padBottom
  };
}

/** SVG path data for a Lorenz curve inside the plot box. */
export function curvePath(points: LorenzPoint[]): string {
  const box = inner();
  if (points.length === 0) return '';
  return points
    .map((p, i) => {
      const x = box.x + clamp01(p.x) * box.w;
      const y = box.y + box.h - clamp01(p.y) * box.h;
      return (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2);
    })
    .join(' ');
}

/** Closed path covering the gap between perfect equality and reality. */
export function gapPath(points: LorenzPoint[]): string {
  const box = inner();
  if (points.length === 0) return '';
  const forward = curvePath(points);
  const topRight = 'L' + (box.x + box.w).toFixed(2) + ' ' + box.y.toFixed(2);
  return forward + ' ' + topRight + ' Z';
}

function clamp01(v: number): number {
  if (!isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export interface LorenzOptions {
  curves: CurveSpec[];
  /** Text put in the middle of the shaded area. */
  areaLabel?: string;
  animate?: boolean;
}

/** Build the whole chart. Returns the svg element ready to insert. */
export function renderLorenz(options: LorenzOptions): SVGSVGElement {
  const box = inner();
  const svg = svgEl('svg', {
    viewBox: '0 0 ' + PLOT.size + ' ' + PLOT.size,
    class: 'lorenz',
    role: 'img',
    'aria-label':
      'Curve of how your kills are spread across your guns. A straight diagonal would mean every gun did the same amount of work.'
  });

  // Quarter grid.
  for (const frac of [0.25, 0.5, 0.75]) {
    svg.appendChild(
      svgEl('line', {
        class: 'lz-grid',
        x1: box.x,
        x2: box.x + box.w,
        y1: box.y + box.h - frac * box.h,
        y2: box.y + box.h - frac * box.h
      })
    );
    svg.appendChild(
      svgEl('line', {
        class: 'lz-grid',
        y1: box.y,
        y2: box.y + box.h,
        x1: box.x + frac * box.w,
        x2: box.x + frac * box.w
      })
    );
  }

  svg.appendChild(
    svgEl('rect', {
      class: 'lz-frame',
      x: box.x,
      y: box.y,
      width: box.w,
      height: box.h
    })
  );

  const primary = options.curves[0];
  if (primary) {
    const area = svgEl('path', { class: 'lz-area', d: gapPath(primary.points) });
    svg.appendChild(area);
  }

  // The line every gun pulling its weight would make.
  svg.appendChild(
    svgEl('line', {
      class: 'lz-equality',
      x1: box.x,
      y1: box.y + box.h,
      x2: box.x + box.w,
      y2: box.y
    })
  );

  const animate = options.animate !== false && !prefersReducedMotion();
  options.curves.forEach((curve, i) => {
    const path = svgEl('path', {
      class: 'lz-curve ' + curve.className,
      d: curvePath(curve.points)
    });
    if (animate) {
      const length = 1400;
      path.style.strokeDasharray = String(length);
      path.style.strokeDashoffset = String(length);
      path.style.animation = 'lz-draw 1100ms ' + (i * 180 + 120) + 'ms ease-out forwards';
    }
    svg.appendChild(path);
  });

  if (options.areaLabel) {
    const label = svgEl('text', {
      class: 'lz-arealabel',
      x: box.x + box.w * 0.38,
      y: box.y + box.h * 0.42
    });
    label.textContent = options.areaLabel;
    svg.appendChild(label);
  }

  const xLabel = svgEl('text', {
    class: 'lz-axis',
    x: box.x + box.w / 2,
    y: PLOT.size - 8,
    'text-anchor': 'middle'
  });
  xLabel.textContent = 'share of your guns';
  svg.appendChild(xLabel);

  const yLabel = svgEl('text', {
    class: 'lz-axis',
    x: 0,
    y: 0,
    'text-anchor': 'middle',
    transform: 'translate(14 ' + (box.y + box.h / 2) + ') rotate(-90)'
  });
  yLabel.textContent = 'share of your kills';
  svg.appendChild(yLabel);

  for (const [frac, text] of [
    [0, 'none'],
    [1, 'all']
  ] as [number, string][]) {
    const tick = svgEl('text', {
      class: 'lz-tick',
      x: box.x + frac * box.w,
      y: box.y + box.h + 16,
      'text-anchor': frac === 0 ? 'start' : 'end'
    });
    tick.textContent = text;
    svg.appendChild(tick);
  }

  return svg;
}
