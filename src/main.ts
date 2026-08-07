// Wiring. Everything interesting lives in the modules this imports.

import './style.css';
import { DEMO_MAIN, loadDemoRival, type DemoAccount } from '../fixtures/demo';
import {
  BungieError,
  defaultFetch,
  explainFailure,
  formatBungieName,
  getAllWeaponHistories,
  getCharacters,
  loadApiKey,
  parseBungieName,
  saveApiKey,
  searchPlayer
} from './bungie';
import { loadWeaponIndex, type WeaponIndex } from './manifest';
import { mergeWeaponHistories } from './pareto';
import { buildAccount, buildReport, joinWithManifest, oneHitSentence, type Report } from './report';
import { comparePanel } from './ui/compare';
import { qs } from './ui/dom';
import {
  archetypePanel,
  curvePanel,
  headlinePanel,
  mount,
  precisionPanel,
  statusPanel,
  tailPanel,
  topPanel
} from './ui/panels';
import { sharePanel } from './ui/share';

const reportRoot = qs<HTMLElement>('#report');
const statusLine = qs<HTMLElement>('#status');
const nameInput = qs<HTMLInputElement>('#bungie-name');
const keyInput = qs<HTMLInputElement>('#api-key');
const runButton = qs<HTMLButtonElement>('#run');
const compareStatus = qs<HTMLElement>('#compare-status');
const compareOutput = qs<HTMLElement>('#compare-output');
const compareA = qs<HTMLInputElement>('#compare-a');
const compareB = qs<HTMLInputElement>('#compare-b');

let manifestIndex: WeaponIndex | null = null;

keyInput.value = loadApiKey();
keyInput.addEventListener('change', () => saveApiKey(keyInput.value));

function setStatus(node: HTMLElement, text: string): void {
  node.textContent = text;
}

function renderReport(report: Report): void {
  mount(reportRoot, [
    headlinePanel(report),
    curvePanel(report),
    topPanel(report),
    precisionPanel(report),
    archetypePanel(report),
    tailPanel(report, oneHitSentence(report.oneHitWonders)),
    sharePanel(report)
  ]);
}

function reportFromDemo(demo: DemoAccount): Report {
  const merged = mergeWeaponHistories(demo.histories);
  const rows = joinWithManifest(merged, demo.weapons);
  return buildReport(buildAccount(demo.player, demo.histories.length, rows));
}

function showDemo(): void {
  const report = reportFromDemo(DEMO_MAIN);
  renderReport(report);
  setStatus(
    statusLine,
    'Demo account. Real weapon names from the Destiny manifest, generated kill counts. Put in a Bungie Name and an API key for your own.'
  );
}

async function ensureManifest(): Promise<WeaponIndex> {
  if (manifestIndex) return manifestIndex;
  setStatus(statusLine, 'Reading the Destiny manifest. First run only, then it is cached.');
  const loaded = await loadWeaponIndex(defaultFetch, (_stage, bytes) => {
    const mb = (bytes / 1048576).toFixed(0);
    setStatus(
      statusLine,
      'Reading the Destiny item table, ' + mb + ' MB in. Only weapons are kept.'
    );
  });
  manifestIndex = loaded.index;
  return loaded.index;
}

async function runLookup(rawName: string, statusNode: HTMLElement): Promise<Report> {
  const parsed = parseBungieName(rawName);
  if (!parsed) {
    throw new BungieError(
      'not-found',
      'That does not look like a Bungie Name. It is a name, then a hash, then four digits, as in Guardian#1234.'
    );
  }
  const apiKey = keyInput.value.trim();
  if (!apiKey) throw new BungieError('no-key', explainFailure('no-key'));
  saveApiKey(apiKey);

  const index = await ensureManifest();
  setStatus(statusNode, 'Looking up ' + formatBungieName(parsed) + '.');
  const player = await searchPlayer(parsed, apiKey);
  const characters = await getCharacters(player, apiKey);
  setStatus(
    statusNode,
    'Reading weapon history for ' + characters.length + ' characters.'
  );
  const histories = await getAllWeaponHistories(player, characters, apiKey);
  const merged = mergeWeaponHistories(histories);
  if (merged.length === 0) {
    throw new BungieError('no-kills', explainFailure('no-kills'));
  }
  const rows = joinWithManifest(merged, index);
  return buildReport(buildAccount(player, characters.length, rows));
}

function failureText(error: unknown): { title: string; body: string } {
  if (error instanceof BungieError) {
    const title =
      error.kind === 'private'
        ? 'This account is private'
        : error.kind === 'not-found'
          ? 'No account by that name'
          : error.kind === 'no-key'
            ? 'An API key is needed'
            : error.kind === 'bad-key'
              ? 'That key was rejected'
              : 'That did not work';
    const explanation = explainFailure(error.kind);
    const body = error.message && error.kind === 'unknown' ? error.message : explanation;
    return { title, body };
  }
  return {
    title: 'That did not work',
    body: 'An unexpected error stopped the report. The browser console has the detail.'
  };
}

qs<HTMLFormElement>('#lookup').addEventListener('submit', async (event) => {
  event.preventDefault();
  runButton.disabled = true;
  try {
    const report = await runLookup(nameInput.value, statusLine);
    renderReport(report);
    setStatus(
      statusLine,
      'Report for ' + formatBungieName(report.account.player) + '.'
    );
  } catch (error) {
    const { title, body } = failureText(error);
    mount(reportRoot, [statusPanel(title, body)]);
    setStatus(statusLine, '');
  } finally {
    runButton.disabled = false;
  }
});

qs<HTMLButtonElement>('#demo').addEventListener('click', () => showDemo());

qs<HTMLFormElement>('#compare-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  compareOutput.replaceChildren();
  try {
    setStatus(compareStatus, 'Running both accounts.');
    const first = await runLookup(compareA.value, compareStatus);
    const second = await runLookup(compareB.value, compareStatus);
    compareOutput.appendChild(comparePanel(first, second));
    setStatus(compareStatus, '');
  } catch (error) {
    const { title, body } = failureText(error);
    compareOutput.replaceChildren(statusPanel(title, body));
    setStatus(compareStatus, '');
  }
});

qs<HTMLButtonElement>('#compare-demo').addEventListener('click', async () => {
  setStatus(compareStatus, 'Loading the second demo account.');
  const rival = await loadDemoRival();
  compareOutput.replaceChildren(
    comparePanel(reportFromDemo(DEMO_MAIN), reportFromDemo(rival))
  );
  setStatus(compareStatus, 'Both demo accounts, generated with different habits.');
});

showDemo();
