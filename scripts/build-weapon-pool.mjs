// Rebuilds fixtures/weapon-pool.json from the live Destiny manifest.
//
// Run with no arguments to download the item table from bungie.net, or pass
// a path to an already downloaded copy:
//   node scripts/build-weapon-pool.mjs [path-to-DestinyInventoryItemDefinition.json]
//
// The pool is real weapon names, types and icon paths. It exists so the demo
// account looks like a real vault instead of invented nonsense. No API key is
// needed for any of this.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(here, '..', 'fixtures', 'weapon-pool.json');
const ICON_PREFIX = '/common/destiny2_content/icons/';
const TARGET_PER_TYPE = 26;

const EXOTIC_WISHLIST = [
  'Gjallarhorn', 'Ace of Spades', 'The Last Word', 'Thorn', 'Riskrunner',
  'Sunshot', 'Graviton Lance', 'Witherhoard', "Izanagi's Burden",
  'Whisper of the Worm', 'Vex Mythoclast', 'Outbreak Perfected',
  'Trinity Ghoul', 'Le Monarque', 'Hawkmoon', "Dead Man's Tale", 'Xenophage',
  'Divinity', 'Osteo Striga', 'Forerunner', 'Cerberus+1', 'Sweet Business',
  'Coldheart', 'Prometheus Lens', "Skyburner's Oath", 'Bad Juju',
  'Monte Carlo', 'Rat King', 'Lord of Wolves', 'Truth', 'Two-Tailed Fox',
  'Anarchy', 'Eyes of Tomorrow', 'Heir Apparent', 'Deathbringer',
  "Leviathan's Breath", "Ticuu's Divination", 'Cryosthesia 77K', 'Duality',
  'Grand Overture', 'Vexcalibur', 'Ergo Sum', 'Quicksilver Storm',
  'Final Warning', 'Wish-Ender', 'Malfeasance', 'Thunderlord',
  'One Thousand Voices', "Tommy's Matchbook", 'No Time to Explain',
  "Traveler's Chosen", 'Symmetry', "Salvation's Grip", 'Heartshadow',
  'Collective Obligation', 'Delicate Tomb', 'Verglas Curve', 'Winterbite',
  'Centrifuse', 'Conditional Finality', 'Buried Bloodline',
  "Dragon's Breath", 'Still Hunt', 'Khvostov 7G-0X', 'Red Death Reformed',
  'Microcosm', 'Barrow-Dyad', 'Choir of One', "Slayer's Fang"
];

// The repository is ASCII only, and a handful of Destiny weapon names are not,
// for example "Fang of Ir Yut". Accents are folded, the usual smart punctuation
// is flattened, and anything still outside ASCII drops the weapon rather than
// smuggling a byte in.
function toAscii(name) {
  const folded = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00a0/g, ' ');
  return /^[\x20-\x7e]*$/.test(folded) ? folded : null;
}

function scanEntries(text, onEntry) {
  let started = false;
  let state = 'seekkey';
  let key = '';
  let entry = '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!started) { if (c === '{') started = true; continue; }
    if (state === 'seekkey') { if (c === '"') { state = 'readkey'; key = ''; } continue; }
    if (state === 'readkey') { if (c === '"') state = 'seekval'; else key += c; continue; }
    if (state === 'seekval') {
      if (c === '{') { state = 'readval'; entry = '{'; depth = 1; inString = false; escaped = false; }
      continue;
    }
    entry += c;
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '{') { depth++; continue; }
    if (c === '}') {
      depth--;
      if (depth === 0) { onEntry(key, entry); entry = ''; state = 'seekkey'; }
    }
  }
}

async function readTable(localPath) {
  if (localPath) return fs.readFileSync(localPath, 'utf8');
  const head = await fetch('https://www.bungie.net/Platform/Destiny2/Manifest/');
  const body = await head.json();
  const itemPath = body.Response.jsonWorldComponentContentPaths.en.DestinyInventoryItemDefinition;
  process.stderr.write('downloading ' + itemPath + '\n');
  const table = await fetch('https://www.bungie.net' + itemPath);
  return await table.text();
}

const text = await readTable(process.argv[2]);
const weapons = [];
scanEntries(text, (hash, raw) => {
  if (raw.indexOf('"itemType":3') === -1) return;
  let item;
  try { item = JSON.parse(raw); } catch { return; }
  if (item.itemType !== 3) return;
  const rawName = item.displayProperties && item.displayProperties.name;
  if (!rawName) return;
  const name = toAscii(rawName);
  if (!name) return;
  const tier = (item.inventory && item.inventory.tierType) || 0;
  if (tier < 5) return;
  const icon = (item.displayProperties && item.displayProperties.icon) || '';
  weapons.push({
    hash: Number(hash),
    name,
    icon: icon.startsWith(ICON_PREFIX) ? icon.slice(ICON_PREFIX.length) : icon,
    type: item.itemTypeDisplayName || '',
    subType: item.itemSubType || 0,
    damageType: item.defaultDamageType || 0,
    tierType: tier,
    ammoType: (item.equippingBlock && item.equippingBlock.ammoType) || 0
  });
});

process.stderr.write('weapons found: ' + weapons.length + '\n');

const byName = new Map();
for (const w of weapons) if (!byName.has(w.name)) byName.set(w.name, w);

const chosen = new Map();
for (const wanted of EXOTIC_WISHLIST) {
  const hit = byName.get(wanted);
  if (hit && hit.tierType === 6) chosen.set(hit.hash, hit);
}

// A spread of legendaries per weapon type, taken in stable hash order so the
// pool does not churn between runs of this script.
const legendary = weapons
  .filter((w) => w.tierType === 5 && w.name && w.type)
  .sort((a, b) => a.hash - b.hash);
const perType = new Map();
for (const w of legendary) {
  if (chosen.has(w.hash)) continue;
  const seen = perType.get(w.type) || [];
  if (seen.some((s) => s.name === w.name)) continue;
  if (seen.length >= TARGET_PER_TYPE) continue;
  seen.push(w);
  perType.set(w.type, seen);
  chosen.set(w.hash, w);
}

const pool = [...chosen.values()].sort((a, b) => a.hash - b.hash);
fs.writeFileSync(outPath, JSON.stringify(pool, null, 0) + '\n');
process.stderr.write('pool written: ' + pool.length + ' weapons -> ' + outPath + '\n');
const counts = {};
for (const w of pool) counts[w.type] = (counts[w.type] || 0) + 1;
process.stderr.write(JSON.stringify(counts) + '\n');
