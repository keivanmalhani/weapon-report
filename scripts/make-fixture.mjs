// Generates the demo accounts from fixtures/weapon-pool.json.
//
// Deterministic: a fixed seed means the committed fixtures can be rebuilt
// byte for byte. No network, no API key.
//
//   node scripts/make-fixture.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, '..', 'fixtures');
const pool = JSON.parse(fs.readFileSync(path.join(fixtures, 'weapon-pool.json'), 'utf8'));

// mulberry32. Small, fast, and identical on every platform.
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Precision ratio bands by DestinyItemSubType. Rockets and swords never land
// a precision hit, snipers nearly always do.
const PRECISION = {
  6: [0.24, 0.38],
  7: [0.04, 0.16],
  8: [0.2, 0.34],
  9: [0.44, 0.62],
  10: [0, 0.01],
  11: [0.03, 0.11],
  12: [0.68, 0.84],
  13: [0.46, 0.62],
  14: [0.54, 0.7],
  17: [0.26, 0.42],
  18: [0, 0],
  22: [0.55, 0.76],
  23: [0, 0.04],
  24: [0.18, 0.31],
  25: [0.14, 0.3],
  31: [0.52, 0.72],
  33: [0.09, 0.24]
};

function buildAccount(config) {
  const rand = rng(config.seed);
  const usable = pool.filter((w) => !config.excludeTypes.includes(w.type));

  // Weight the draw so the account leans the way the player does, then shuffle
  // the rest in so the vault still looks like a vault.
  const weighted = usable
    .map((w) => ({
      w,
      key: rand() / (config.typeBias[w.type] || 1) - (w.tierType === 6 ? 0.06 : 0)
    }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.w);

  const picked = weighted.slice(0, config.weaponCount);

  // A power law over the picked weapons, roughed up with noise so it does not
  // look like it came out of a formula.
  const rows = picked.map((w, i) => {
    const rank = i + 1;
    const noise = 0.62 + rand() * 0.85;
    // Head: the guns the player actually mains, falling off as a power law.
    // Dabble: the flat handful of kills any gun collects on the way to the
    // shredder. Without it the tail is a wall of ones, which real accounts
    // are not.
    const head = (config.peak / Math.pow(rank, config.slope)) * noise;
    const dabble = 1 + Math.pow(rand(), 3) * config.dabble;
    const kills = Math.max(1, Math.round(head + dabble));
    const band = PRECISION[w.subType] || [0.1, 0.3];
    const ratio = band[0] + rand() * (band[1] - band[0]);
    return { w, kills, ratio };
  });
  rows.sort((a, b) => b.kills - a.kills);

  // Split each weapon across characters. Most kills land on the main, and
  // enough weapons show up on two characters to exercise the merge.
  const characters = config.characterIds.map(() => []);
  const weights = config.characterWeights;
  for (const row of rows) {
    const shares = weights.map((weight) => weight * (0.55 + rand() * 0.9));
    const totalShare = shares.reduce((a, b) => a + b, 0);
    let remaining = row.kills;
    for (let c = 0; c < characters.length; c++) {
      const last = c === characters.length - 1;
      let part = last ? remaining : Math.round((row.kills * shares[c]) / totalShare);
      if (part > remaining) part = remaining;
      // A gun with a handful of kills belongs to exactly one character.
      if (row.kills <= 6 && !last && c > 0) part = 0;
      if (part <= 0) continue;
      remaining -= part;
      const precision = Math.min(part, Math.round(part * row.ratio));
      characters[c].push({
        referenceId: row.w.hash,
        kills: part,
        precisionKills: precision,
        precisionRatio: part > 0 ? precision / part : 0
      });
    }
  }

  for (const list of characters) list.sort((a, b) => b.kills - a.kills);

  const weapons = {};
  for (const row of rows) {
    weapons[String(row.w.hash)] = {
      name: row.w.name,
      icon: row.w.icon,
      type: row.w.type,
      subType: row.w.subType,
      damageType: row.w.damageType,
      tierType: row.w.tierType,
      ammoType: row.w.ammoType
    };
  }

  return {
    player: config.player,
    characters: config.characterIds,
    histories: characters,
    weapons
  };
}

const MAIN = {
  seed: 20260214,
  weaponCount: 337,
  peak: 24000,
  slope: 1.62,
  dabble: 30,
  excludeTypes: ['Combat Bow'],
  typeBias: {
    'Hand Cannon': 5.2,
    'Rocket Launcher': 1.55,
    'Submachine Gun': 2.1,
    'Pulse Rifle': 1.5,
    'Sniper Rifle': 1.25,
    Shotgun: 1.15,
    'Auto Rifle': 1.1,
    'Scout Rifle': 1.0,
    'Grenade Launcher': 0.95,
    Sidearm: 0.8,
    Sword: 0.8,
    'Machine Gun': 0.8,
    'Fusion Rifle': 0.7,
    'Linear Fusion Rifle': 0.6,
    Glaive: 0.5,
    'Trace Rifle': 0.45
  },
  characterIds: ['2305843009301040974', '2305843009407751284', '2305843009550118862'],
  characterWeights: [1, 0.42, 0.19],
  player: {
    displayName: 'Vaultkeeper',
    displayNameCode: 7781,
    membershipType: 3,
    membershipId: '4611686018467284386'
  }
};

const RIVAL = {
  seed: 991103,
  weaponCount: 291,
  peak: 5200,
  slope: 1.26,
  dabble: 16,
  excludeTypes: ['Sword', 'Glaive'],
  typeBias: {
    'Pulse Rifle': 1.7,
    'Scout Rifle': 1.6,
    'Combat Bow': 1.5,
    'Auto Rifle': 1.35,
    Sidearm: 1.2,
    'Sniper Rifle': 1.15,
    'Hand Cannon': 1.1,
    Shotgun: 1.05,
    'Machine Gun': 1.0,
    'Fusion Rifle': 0.95,
    'Grenade Launcher': 0.9,
    'Submachine Gun': 0.85,
    'Rocket Launcher': 0.8,
    'Trace Rifle': 0.7,
    'Linear Fusion Rifle': 0.6
  },
  characterIds: ['2305843009222371330', '2305843009611800455'],
  characterWeights: [1, 0.66],
  player: {
    displayName: 'Sampleplatter',
    displayNameCode: 4102,
    membershipType: 3,
    membershipId: '4611686018501234567'
  }
};

function summarize(account) {
  const merged = new Map();
  for (const list of account.histories) {
    for (const e of list) {
      const cur = merged.get(e.referenceId) || { kills: 0, precisionKills: 0 };
      cur.kills += e.kills;
      cur.precisionKills += e.precisionKills;
      merged.set(e.referenceId, cur);
    }
  }
  const kills = [...merged.values()].map((v) => v.kills).sort((a, b) => b - a);
  const total = kills.reduce((a, b) => a + b, 0);
  let cum = 0;
  let pareto = 0;
  for (const k of kills) {
    cum += k;
    pareto++;
    if (cum >= 0.8 * total) break;
  }
  const top6 = kills.slice(0, 6).reduce((a, b) => a + b, 0);
  const asc = kills.slice().sort((a, b) => a - b);
  let weighted = 0;
  asc.forEach((v, i) => (weighted += (i + 1) * v));
  const g = (2 * weighted) / (asc.length * total) - (asc.length + 1) / asc.length;
  const tail = kills.filter((k) => k <= 5).length;
  return {
    weapons: kills.length,
    total,
    top1: kills[0],
    top6share: (top6 / total).toFixed(3),
    pareto80: pareto,
    gini: g.toFixed(3),
    oneHitWonders: tail
  };
}

for (const [name, config] of [
  ['demo-account.json', MAIN],
  ['demo-account-b.json', RIVAL]
]) {
  const account = buildAccount(config);
  fs.writeFileSync(path.join(fixtures, name), JSON.stringify(account) + '\n');
  process.stderr.write(name + ' ' + JSON.stringify(summarize(account)) + '\n');
}
