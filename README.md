# weapon-report

[![CI](https://github.com/keivanmalhani/weapon-report/actions/workflows/ci.yml/badge.svg)](https://github.com/keivanmalhani/weapon-report/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**[keivanmalhani.github.io/weapon-report](https://keivanmalhani.github.io/weapon-report/)**

light.gg tells you what is good. DIM tells you what you own. This tells you what
you actually use.

An audit of which Destiny 2 guns a player really fires, set against the hundreds
sitting in the vault. It reads the unique weapon history for every character on
an account, adds the kills up, and reports the smallest number of guns that
account for eighty percent of them. For most players that number is small enough
to be a little embarrassing.

Static site. No backend, no analytics, no accounts, no runtime dependencies.
Everything runs in the browser and talks straight to bungie.net.

## What it shows

- The headline: how few guns produce most of your kills.
- A Lorenz curve of weapon usage with a concentration number, drawn as inline
  SVG and labelled in English rather than statistics vocabulary.
- Your top ten by kills, with type, element, share and precision ratio.
- The gap between the gun you reach for most and the gun you are actually most
  accurate with, which is usually not the same gun.
- A playstyle sentence built from the real distribution, including the weapon
  types you have never touched.
- The one hit wonders: the guns that got a handful of kills and were never
  picked up again.
- A 1200 by 630 share card you can download or copy to the clipboard.
- Compare mode: two Bungie Names, both curves on one plot, one verdict on who is
  more set in their ways.

## A Lorenz curve and the Gini coefficient, in two sentences

A Lorenz curve sorts your guns from least used to most used and plots, for each
share of your collection, the share of your kills it produced; if every gun did
the same amount of work the curve would be a straight diagonal, and the further
it sags below that diagonal the more your kills come from a handful of guns. The
Gini coefficient is that sag expressed as one number between 0 and 1, where 0
means every gun pulled equal weight and 1 means a single gun did everything.

## Running your own account

The manifest is public and needs no credentials, so the demo works with nothing
set up at all. Reading a named player's stats needs an API key, which is free
and yours:

1. Go to [bungie.net/en/Application](https://www.bungie.net/en/Application) and
   sign in.
2. Create a new application. Give it any name and website.
3. Set OAuth Client Type to Public. No scopes are needed for public stats.
4. Copy the API Key and paste it into the field on the page.

The key is stored in your browser's local storage and is sent only to
bungie.net. It is never committed, logged or forwarded anywhere. The account you
look up must have its Destiny privacy set so its stats are public, which is the
default; a private account returns nothing at all and the page says so rather
than drawing an empty chart.

## What it will not do

- **It counts kills, not usage time.** A gun you carried for a hundred hours and
  never fired does not appear. Bungie exposes kills per weapon, not time held,
  so this is a report on what killed things, not on what you were holding.
- **Player versus enemy and player versus player are pooled.** The unique weapon
  history endpoint returns one total per weapon with no mode breakdown, so
  raid adds and Trials opponents land in the same number. If Bungie ever splits
  it, this will split it too.
- **It only sees guns with at least one recorded kill.** Everything in the vault
  that never got a kill is invisible, which means your real concentration is
  worse than the number shown, not better.
- **It is not a recommendation engine.** It says nothing about whether a gun is
  good. That is what light.gg is for.
- **Only the current Destiny 2 account is read.** Cross saved memberships
  resolve to the primary, and platforms retired by Bungie return nothing.

## Development

```
npm ci
npm test          # vitest, 258 tests
npm run build     # typecheck then vite build
npm run dev       # local dev server
```

There are no runtime dependencies. The development dependencies are Vite,
TypeScript, Vitest, jsdom for the two DOM test files, and a headless canvas
used only by the share card preview script.

Three maintenance scripts exist and are not part of the shipped site:

```
npm run fixtures        # regenerate the demo accounts from the weapon pool
npm run card:preview    # render the share card to scripts/out as a PNG
node scripts/build-weapon-pool.mjs   # refresh the weapon pool from bungie.net
```

## How it talks to Bungie

- `GET /Platform/Destiny2/Manifest/` for the content version and the path to
  `DestinyInventoryItemDefinition`. No API key. It returns HTTP 500
  occasionally, so it is retried.
- The English item table is about 190 MB of JSON holding roughly 39000 items, of
  which about 2200 are weapons. It is scanned as it streams in, one top level
  entry at a time, and only the seven fields a weapon row needs are kept. The
  result is around 400 KB and is cached in local storage under the manifest
  version, so a content update invalidates it on its own. The full table is
  never held in memory.
- `POST /Platform/Destiny2/SearchDestinyPlayerByBungieName/-1/` to turn a Bungie
  Name into a membership.
- `GET /Platform/Destiny2/{membershipType}/Profile/{id}/?components=200` for the
  character list.
- `GET /Platform/Destiny2/{membershipType}/Account/{id}/Character/{characterId}/Stats/UniqueWeapons/`
  for the weapon history, once per character, summed across the account. Note
  the route says `UniqueWeapons` even though the operation is named
  `Destiny2.GetUniqueWeaponHistory`.

Bungie reflects the request origin in `access-control-allow-origin` and permits
the `X-API-Key` header, so a browser can call all of this directly.

## Licence

MIT. See [LICENSE](LICENSE).

Not affiliated with or endorsed by Bungie. Weapon names and icons come from the
public Destiny manifest.
