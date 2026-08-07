// The 1200 by 630 share card.
//
// The layout maths is a pure function so it can be unit tested without a
// canvas, and the drawing uses nothing outside the standard 2D context, so
// the same code runs in the browser and under a headless canvas in scripts.

import type { LorenzPoint } from './pareto';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardLayout {
  width: number;
  height: number;
  scale: number;
  pad: number;
  left: Box;
  right: Box;
  eyebrow: { x: number; y: number; size: number };
  numeral: { x: number; y: number; size: number };
  caption: { x: number; y: number; size: number; maxWidth: number };
  rule: { x: number; y: number; w: number };
  listTop: number;
  rowHeight: number;
  rowNameX: number;
  rowValueX: number;
  rowFontSize: number;
  plot: Box;
  plotLabelX: { x: number; y: number; size: number };
  plotLabelY: { x: number; y: number; size: number };
  plotCaption: { x: number; y: number; size: number; maxWidth: number };
  footer: { x: number; y: number; size: number };
  footerRight: { x: number; y: number; size: number };
  giniBadge: { x: number; y: number; size: number };
}

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/**
 * Two columns. The left holds the anchor numeral and the top three guns, the
 * right holds a square plot. Everything scales off the 1200 by 630 reference
 * so the same maths produces a correct half size or double size card.
 */
export function layoutCard(width = CARD_WIDTH, height = CARD_HEIGHT): CardLayout {
  const scale = Math.min(width / CARD_WIDTH, height / CARD_HEIGHT);
  const pad = Math.round(64 * scale);
  const gutter = Math.round(56 * scale);
  const plotSize = Math.round(336 * scale);

  const right: Box = {
    x: width - pad - plotSize,
    y: pad,
    w: plotSize,
    h: height - pad * 2
  };
  const left: Box = {
    x: pad,
    y: pad,
    w: right.x - gutter - pad,
    h: height - pad * 2
  };

  const eyebrowSize = Math.round(18 * scale);
  const numeralSize = Math.round(148 * scale);
  const captionSize = Math.round(27 * scale);
  const rowFontSize = Math.round(24 * scale);

  const eyebrowY = left.y + eyebrowSize;
  const numeralY = eyebrowY + Math.round(24 * scale) + numeralSize;
  const captionY = numeralY + Math.round(46 * scale);
  const ruleY = captionY + Math.round(58 * scale);
  const listTop = ruleY + Math.round(44 * scale);
  const rowHeight = Math.round(46 * scale);

  // The plot hangs below the concentration badge and above its own caption,
  // which puts its optical centre near the middle of the card.
  const plotTop = right.y + Math.round(58 * scale);
  const plot: Box = { x: right.x, y: plotTop, w: plotSize, h: plotSize };

  return {
    width,
    height,
    scale,
    pad,
    left,
    right,
    eyebrow: { x: left.x, y: eyebrowY, size: eyebrowSize },
    numeral: { x: left.x, y: numeralY, size: numeralSize },
    caption: { x: left.x, y: captionY, size: captionSize, maxWidth: left.w },
    rule: { x: left.x, y: ruleY, w: left.w },
    listTop,
    rowHeight,
    rowNameX: left.x + Math.round(46 * scale),
    rowValueX: left.x + left.w,
    rowFontSize,
    plot,
    plotLabelX: {
      x: plot.x + plot.w / 2,
      y: plot.y + plot.h + Math.round(30 * scale),
      size: Math.round(15 * scale)
    },
    plotLabelY: {
      x: plot.x - Math.round(18 * scale),
      y: plot.y + plot.h / 2,
      size: Math.round(15 * scale)
    },
    plotCaption: {
      x: plot.x,
      y: plot.y + plot.h + Math.round(54 * scale),
      size: Math.round(15 * scale),
      maxWidth: plotSize
    },
    footer: {
      x: left.x,
      y: height - pad + Math.round(14 * scale),
      size: Math.round(16 * scale)
    },
    footerRight: {
      x: width - pad,
      y: height - pad + Math.round(14 * scale),
      size: Math.round(16 * scale)
    },
    giniBadge: {
      x: plot.x,
      y: right.y + Math.round(22 * scale),
      size: Math.round(16 * scale)
    }
  };
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Map Lorenz points, which run 0 to 1 in both axes with y measured upward,
 * into canvas coordinates, where y grows downward.
 */
export function curveToCanvas(points: LorenzPoint[], plot: Box): Point[] {
  return points.map((p) => ({
    x: plot.x + clamp01(p.x) * plot.w,
    y: plot.y + plot.h - clamp01(p.y) * plot.h
  }));
}

function clamp01(v: number): number {
  if (!isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export interface MeasureFn {
  (text: string): number;
}

/**
 * Shorten text with a single trailing period run until it fits. Returns the
 * original when it already fits and an empty string when even one character
 * plus the ellipsis will not.
 */
export function truncateToWidth(
  text: string,
  maxWidth: number,
  measure: MeasureFn,
  ellipsis = '...'
): string {
  if (maxWidth <= 0) return '';
  if (measure(text) <= maxWidth) return text;
  for (let n = text.length - 1; n > 0; n--) {
    const candidate = text.slice(0, n).trimEnd() + ellipsis;
    if (measure(candidate) <= maxWidth) return candidate;
  }
  return '';
}

export interface CardData {
  headlineNumber: string;
  caption: string;
  eyebrow: string;
  giniLabel: string;
  /** Words for the shaded area, so the graphic explains itself. */
  areaNote: string;
  lorenz: LorenzPoint[];
  top: { name: string; value: string }[];
  /** Who the card is about. */
  subject: string;
  footer: string;
}

export const CARD_COLORS = {
  background: '#0a0b0e',
  backgroundLow: '#101218',
  ink: '#f2f3f5',
  muted: '#8b8f99',
  faint: '#2a2d36',
  warm: '#f2a154',
  cool: '#66c2d9'
};

type Ctx = CanvasRenderingContext2D;

const SANS =
  '"Helvetica Neue", Helvetica, Arial, "Segoe UI", "DejaVu Sans", sans-serif';

function font(weight: number, size: number): string {
  return weight + ' ' + size + 'px ' + SANS;
}

/** Draw the whole card. Only standard 2D context calls are used. */
export function drawCard(ctx: Ctx, data: CardData, layout: CardLayout): void {
  const L = layout;
  const C = CARD_COLORS;

  const gradient = ctx.createLinearGradient(0, 0, L.width * 0.6, L.height);
  gradient.addColorStop(0, C.backgroundLow);
  gradient.addColorStop(1, C.background);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, L.width, L.height);

  // A hairline frame keeps the card from bleeding into dark timelines.
  ctx.strokeStyle = C.faint;
  ctx.lineWidth = Math.max(1, Math.round(L.scale));
  ctx.strokeRect(0.5, 0.5, L.width - 1, L.height - 1);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // Eyebrow, letterspaced by hand because canvas has no tracking control.
  ctx.fillStyle = C.cool;
  ctx.font = font(600, L.eyebrow.size);
  drawTracked(ctx, data.eyebrow, L.eyebrow.x, L.eyebrow.y, L.eyebrow.size * 0.22);

  // Anchor numeral.
  ctx.fillStyle = C.warm;
  ctx.font = font(700, L.numeral.size);
  ctx.fillText(data.headlineNumber, L.numeral.x, L.numeral.y);

  // Caption, wrapped to at most two lines.
  ctx.fillStyle = C.ink;
  ctx.font = font(400, L.caption.size);
  const measure: MeasureFn = (t) => ctx.measureText(t).width;
  const lines = wrapText(data.caption, L.caption.maxWidth, measure, 2);
  lines.forEach((line, i) => {
    ctx.fillText(line, L.caption.x, L.caption.y + i * L.caption.size * 1.32);
  });

  ctx.strokeStyle = C.faint;
  ctx.lineWidth = Math.max(1, Math.round(L.scale));
  ctx.beginPath();
  ctx.moveTo(L.rule.x, L.rule.y + 0.5);
  ctx.lineTo(L.rule.x + L.rule.w, L.rule.y + 0.5);
  ctx.stroke();

  // Top three.
  data.top.slice(0, 3).forEach((row, i) => {
    const y = L.listTop + i * L.rowHeight;
    ctx.fillStyle = C.muted;
    ctx.font = font(600, L.rowFontSize);
    ctx.textAlign = 'left';
    ctx.fillText(String(i + 1), L.left.x, y);
    ctx.fillStyle = C.ink;
    ctx.font = font(400, L.rowFontSize);
    const room = L.rowValueX - L.rowNameX - L.rowFontSize * 4.4;
    ctx.fillText(truncateToWidth(row.name, room, measure), L.rowNameX, y);
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'right';
    ctx.fillText(row.value, L.rowValueX, y);
    ctx.textAlign = 'left';
  });

  drawPlot(ctx, data, L);

  ctx.fillStyle = C.ink;
  ctx.font = font(500, L.footer.size);
  ctx.textAlign = 'left';
  ctx.fillText(data.subject, L.footer.x, L.footer.y);

  ctx.fillStyle = C.muted;
  ctx.font = font(400, L.footerRight.size);
  ctx.textAlign = 'right';
  ctx.fillText(data.footer, L.footerRight.x, L.footerRight.y);
  ctx.textAlign = 'left';
}

function drawPlot(ctx: Ctx, data: CardData, L: CardLayout): void {
  const C = CARD_COLORS;
  const plot = L.plot;
  const points = curveToCanvas(data.lorenz, plot);

  ctx.save();
  ctx.strokeStyle = C.faint;
  ctx.lineWidth = Math.max(1, Math.round(L.scale));
  ctx.strokeRect(plot.x + 0.5, plot.y + 0.5, plot.w - 1, plot.h - 1);

  // Shaded gap between equality and reality.
  ctx.beginPath();
  ctx.moveTo(plot.x, plot.y + plot.h);
  for (const p of points) ctx.lineTo(p.x, p.y);
  ctx.lineTo(plot.x + plot.w, plot.y);
  ctx.closePath();
  const shade = ctx.createLinearGradient(0, plot.y, 0, plot.y + plot.h);
  shade.addColorStop(0, 'rgba(242, 161, 84, 0.17)');
  shade.addColorStop(1, 'rgba(242, 161, 84, 0.045)');
  ctx.fillStyle = shade;
  ctx.fill();

  // Equality diagonal.
  ctx.beginPath();
  ctx.setLineDash([Math.round(5 * L.scale), Math.round(5 * L.scale)]);
  ctx.moveTo(plot.x, plot.y + plot.h);
  ctx.lineTo(plot.x + plot.w, plot.y);
  ctx.strokeStyle = C.cool;
  ctx.lineWidth = Math.max(1, Math.round(1.5 * L.scale));
  ctx.stroke();
  ctx.setLineDash([]);

  // The curve.
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = C.warm;
  ctx.lineWidth = Math.max(2, Math.round(3 * L.scale));
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.fillStyle = C.muted;
  ctx.font = font(400, L.plotLabelX.size);
  ctx.textAlign = 'center';
  ctx.fillText('share of your guns', L.plotLabelX.x, L.plotLabelX.y);

  ctx.save();
  ctx.translate(L.plotLabelY.x, L.plotLabelY.y);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('share of your kills', 0, 0);
  ctx.restore();

  ctx.fillStyle = C.cool;
  ctx.font = font(600, L.giniBadge.size);
  ctx.textAlign = 'left';
  ctx.fillText(data.giniLabel, L.giniBadge.x, L.giniBadge.y);

  // The shaded area named in words, because an unlabelled shape is a riddle.
  ctx.fillStyle = C.muted;
  ctx.font = font(400, L.plotCaption.size);
  ctx.textAlign = 'left';
  const capMeasure: MeasureFn = (t) => ctx.measureText(t).width;
  wrapText(data.areaNote, L.plotCaption.maxWidth, capMeasure, 2).forEach((line, i) => {
    ctx.fillText(line, L.plotCaption.x, L.plotCaption.y + i * L.plotCaption.size * 1.35);
  });
  ctx.restore();
}

/** Canvas has no letter spacing, so characters are placed one at a time. */
function drawTracked(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  tracking: number
): void {
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + tracking;
  }
}

/** Greedy word wrap, hard capped at `maxLines` with the last line truncated. */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: MeasureFn,
  maxLines = 3
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    if (measure(candidate) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines) {
    const consumed = lines.join(' ').split(/\s+/).length;
    const rest = words.slice(consumed);
    if (rest.length > 0) {
      lines[maxLines - 1] = truncateToWidth(
        lines[maxLines - 1] + ' ' + rest.join(' '),
        maxWidth,
        measure
      );
    }
  }
  return lines;
}
