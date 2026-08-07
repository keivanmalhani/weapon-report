/**
 * Renders the demo account's share card to public/og.png at exactly 1200x630,
 * for the site's Open Graph / Twitter card meta tags.
 *
 * Deliberately not wired into the build. It needs a native canvas, and making
 * that a real devDependency would mean every clone of this repo downloads a
 * platform binary to produce one file that changes about once a year:
 *
 *   npm install --no-save @napi-rs/canvas
 *   node scripts/render-og.mjs
 *
 * (It already happens to be present here as an actual devDependency, because
 * scripts/render-card.mjs uses it for local layout previews via
 * `npm run card:preview`. The install line above is still the right thing to
 * write down: a clone that only wants this script and prunes devDependencies
 * before installing should not be stuck.)
 *
 * This mirrors guardian-timeline/scripts/render-card.mjs, with one
 * substitution. That repo's Vite (5.x) still ships esbuild, so its script
 * bundles the card's TypeScript modules with esbuild directly. This repo is
 * on Vite 8, which is the Rolldown-powered build: there is no esbuild binary
 * anywhere in node_modules, only rolldown, which is what Vite itself bundles
 * with here. Rolldown's CLI takes the same --format / --platform / --file
 * shape esbuild's --bundle does (it always bundles, so there is no separate
 * flag for that), so this is a one-line swap, not a new tool.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const { createCanvas, GlobalFonts } = await import('@napi-rs/canvas').catch(() => {
  console.error('Missing canvas. Run: npm install --no-save @napi-rs/canvas');
  process.exit(1);
});

// The card modules are TypeScript, so bundle them with the bundler Vite
// already brings along rather than adding another tool.
const scratch = mkdtempSync(join(tmpdir(), 'weapon-report-og-'));
const entry = join(scratch, 'entry.ts');
const bundle = join(scratch, 'bundle.mjs');

writeFileSync(
  entry,
  `
import { DEMO_MAIN } from ${JSON.stringify(join(root, 'fixtures/demo.ts'))};
import { mergeWeaponHistories } from ${JSON.stringify(join(root, 'src/pareto.ts'))};
import { buildAccount, buildReport, joinWithManifest } from ${JSON.stringify(join(root, 'src/report.ts'))};
import { drawCard, layoutCard, CARD_WIDTH, CARD_HEIGHT } from ${JSON.stringify(join(root, 'src/card.ts'))};
import { cardDataFromReport } from ${JSON.stringify(join(root, 'scripts/card-data.mjs'))};

export function makeCardData() {
  const merged = mergeWeaponHistories(DEMO_MAIN.histories);
  const rows = joinWithManifest(merged, DEMO_MAIN.weapons);
  const account = buildAccount(DEMO_MAIN.player, DEMO_MAIN.histories.length, rows);
  const report = buildReport(account);
  return { report, cardData: cardDataFromReport(report) };
}
export { drawCard, layoutCard, CARD_WIDTH, CARD_HEIGHT };
`,
);

execFileSync(
  join(root, 'node_modules/.bin/rolldown'),
  [entry, '--format', 'esm', '--platform', 'node', '--file', bundle],
  { stdio: 'inherit' },
);

const { makeCardData, drawCard, layoutCard, CARD_WIDTH, CARD_HEIGHT } = await import(
  `file://${bundle}`
);

// Without this, glyphs like the apostrophe in "Dragon's Breath" can come out
// as tofu on a machine with no fonts preinstalled where napi-rs's own bundled
// fallback does not cover them.
if (GlobalFonts.loadSystemFonts) GlobalFonts.loadSystemFonts();

const { report, cardData } = makeCardData();
const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
drawCard(canvas.getContext('2d'), cardData, layoutCard(CARD_WIDTH, CARD_HEIGHT));

const out = join(root, 'public/og.png');
mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(out, canvas.toBuffer('image/png'));
rmSync(scratch, { recursive: true, force: true });

console.log(`wrote ${out}`);
console.log(`headline: ${report.headline}`);
console.log(`card number: ${cardData.headlineNumber}, ${cardData.giniLabel}`);
