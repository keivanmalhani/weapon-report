// Wiring. Everything interesting lives in the modules this imports.

import './style.css';
import { DEMO_MAIN, loadDemoRival, type DemoAccount } from '../fixtures/demo';
import { getSession, minutesLeft, signIn, signOut, signedIn } from './auth';
import {
  BungieError,
  defaultFetch,
  explainFailure,
  formatBungieName,
  getAllWeaponHistories,
  getCharacters,
  parseBungieName,
  searchPlayer
} from './bungie';
import { loadWeaponIndex, type WeaponIndex } from './manifest';
import { mergeWeaponHistories } from './pareto';
import { buildAccount, buildReport, joinWithManifest, oneHitSentence, type Report } from './report';
import { accountView, failureText, getOwnPlayer, isSessionExpiry } from './signin';
import type { PlayerRef } from './types';
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
const runButton = qs<HTMLButtonElement>('#run');
const signInButton = qs<HTMLButtonElement>('#signin');
const mineButton = qs<HTMLButtonElement>('#mine');
const signOutButton = qs<HTMLButtonElement>('#signout');
const sessionNote = qs<HTMLElement>('#session');
const compareStatus = qs<HTMLElement>('#compare-status');
const compareOutput = qs<HTMLElement>('#compare-output');
const compareA = qs<HTMLInputElement>('#compare-a');
const compareB = qs<HTMLInputElement>('#compare-b');

let manifestIndex: WeaponIndex | null = null;

function setStatus(node: HTMLElement, text: string): void {
  node.textContent = text;
}

/**
 * Redraw the sign-in row from whatever the session is right now.
 *
 * Called on load and either side of anything that could have consumed the hour.
 * Not on a timer: a countdown ticking away in the corner would be one more
 * thing demanding attention, and the only moment the number actually matters is
 * the moment before a call goes out.
 */
function paintAccount(): void {
  const view = accountView(getSession(), minutesLeft());
  signInButton.hidden = !view.showSignIn;
  mineButton.hidden = !view.showMine;
  signOutButton.hidden = !view.showMine;
  sessionNote.textContent = view.note;
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
  // Telling somebody who is already signed in to sign in is a small lie, and
  // small lies are what make a page feel like it is not paying attention.
  const next = signedIn() ? 'Run my report' : 'Sign in';
  setStatus(
    statusLine,
    'Demo account. Real weapon names from the Destiny manifest, generated kill counts. ' +
      next +
      ', or put in a Bungie Name, for a real one.'
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

/**
 * Everything after the account has been identified, whichever way that happened.
 *
 * The token goes along when there is one, so a signed-in visitor whose Destiny
 * privacy is set to private can still read their own account. It costs nothing
 * on a public one.
 */
async function runForPlayer(
  player: PlayerRef,
  statusNode: HTMLElement,
  accessToken: string | null
): Promise<Report> {
  const index = await ensureManifest();
  const characters = await getCharacters(player, accessToken);
  setStatus(
    statusNode,
    'Reading weapon history for ' + characters.length + ' characters.'
  );
  const histories = await getAllWeaponHistories(player, characters, accessToken);
  const merged = mergeWeaponHistories(histories);
  if (merged.length === 0) {
    throw new BungieError('no-kills', explainFailure('no-kills'));
  }
  const rows = joinWithManifest(merged, index);
  return buildReport(buildAccount(player, characters.length, rows));
}

async function runLookup(rawName: string, statusNode: HTMLElement): Promise<Report> {
  const parsed = parseBungieName(rawName);
  if (!parsed) {
    throw new BungieError(
      'not-found',
      'That does not look like a Bungie Name. It is a name, then a hash, then four digits, as in Guardian#1234.'
    );
  }
  const accessToken = getSession()?.accessToken ?? null;
  setStatus(statusNode, 'Looking up ' + formatBungieName(parsed) + '.');
  const player = await searchPlayer(parsed, accessToken);
  return runForPlayer(player, statusNode, accessToken);
}

/** The signed-in path. No name to parse, because Bungie already knows who it is. */
async function runMine(statusNode: HTMLElement): Promise<Report> {
  setStatus(statusNode, 'Reading the account you signed in as.');
  const player = await getOwnPlayer();
  // Read the session again rather than before the call: getOwnPlayer is the
  // point at which an hour that has quietly run out gets noticed.
  return runForPlayer(player, statusNode, getSession()?.accessToken ?? null);
}

/**
 * Show a failure as a panel, and make sure the sign-in row agrees with it.
 *
 * Throwing the session away when bungie.net rejects the token is the point of
 * this. A token can die before the clock says it should, revoked or just
 * disagreed with, and in that case the stored session still looks fine: the
 * page would sit there offering a countdown and a button that cannot work,
 * under a message telling the reader to sign in again with nothing to press.
 */
function showFailure(error: unknown, root: HTMLElement, statusNode: HTMLElement): void {
  if (isSessionExpiry(error)) signOut();
  const { title, body } = failureText(error);
  mount(root, [statusPanel(title, body)]);
  setStatus(statusNode, '');
  paintAccount();
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
    showFailure(error, reportRoot, statusLine);
  } finally {
    runButton.disabled = false;
    // A report takes real minutes off the hour, so the countdown is stale by now.
    paintAccount();
  }
});

signInButton.addEventListener('click', () => {
  try {
    signIn();
  } catch (error) {
    // The only way this throws is a browser that refuses to store anything, and
    // the message auth.ts raises says so in words.
    setStatus(sessionNote, error instanceof Error ? error.message : 'Sign-in could not start.');
  }
});

signOutButton.addEventListener('click', () => {
  signOut();
  paintAccount();
  setStatus(statusLine, 'Signed out. The demo and name lookup still work.');
});

mineButton.addEventListener('click', async () => {
  mineButton.disabled = true;
  try {
    const report = await runMine(statusLine);
    renderReport(report);
    setStatus(statusLine, 'Report for ' + formatBungieName(report.account.player) + '.');
  } catch (error) {
    showFailure(error, reportRoot, statusLine);
  } finally {
    mineButton.disabled = false;
    paintAccount();
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
    showFailure(error, compareOutput, compareStatus);
  } finally {
    paintAccount();
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

paintAccount();
showDemo();
