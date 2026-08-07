// Renders the share card to a PNG outside the browser so the layout can be
// looked at without opening a page. Uses the same drawCard as the site.
//
//   npm run card:preview          writes scripts/out/card-demo.png
//
// Node strips the TypeScript types on the fly, so there is no build step.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';

import { CARD_HEIGHT, CARD_WIDTH, drawCard, layoutCard } from '../src/card.ts';
import { mergeWeaponHistories } from '../src/pareto.ts';
import { buildAccount, buildReport, joinWithManifest } from '../src/report.ts';
import { cardDataFromReport } from './card-data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'out');
fs.mkdirSync(outDir, { recursive: true });

if (GlobalFonts.loadSystemFonts) GlobalFonts.loadSystemFonts();

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(here, '..', 'fixtures', name), 'utf8'));
}

function reportFor(account) {
  const merged = mergeWeaponHistories(account.histories);
  const rows = joinWithManifest(merged, account.weapons);
  return buildReport(buildAccount(account.player, account.histories.length, rows));
}

const targets = [
  ['card-demo.png', load('demo-account.json')],
  ['card-rival.png', load('demo-account-b.json')]
];

for (const [file, account] of targets) {
  const report = reportFor(account);
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext('2d');
  drawCard(ctx, cardDataFromReport(report), layoutCard(CARD_WIDTH, CARD_HEIGHT));
  fs.writeFileSync(path.join(outDir, file), canvas.toBuffer('image/png'));
  process.stderr.write(
    file + '  ' + report.headline + '  |  ' + report.archetype.sentence + '\n'
  );
}
