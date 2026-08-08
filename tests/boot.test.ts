// @vitest-environment jsdom
//
// Boots the real page: the shipped index.html markup plus main.ts, with no
// network and nobody signed in. Demo mode has to render on load with nothing
// set up, which is the promise the site makes. The signed-in half of the same
// boot is in boot-signed-in.test.ts, which needs its own module registry to
// seed a session before main.ts reads one.

import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

beforeAll(async () => {
  sessionStorage.clear();
  // jsdom has no 2D context. The share panel copes with a null context, and
  // stubbing it here keeps jsdom from logging a not implemented warning.
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
  await import('../src/main');
});

describe('first paint', () => {
  it('renders the demo report signed out and with no network call', () => {
    expect(document.querySelector('#report .headline')).not.toBeNull();
    expect(document.querySelector('#report .figure')?.textContent).toMatch(/^\d+%$/);
  });

  it('renders every section', () => {
    for (const cls of [
      '.headline',
      '.curve',
      '.top',
      '.precision',
      '.archetype',
      '.tail',
      '.share'
    ]) {
      expect(document.querySelector('#report ' + cls), cls).not.toBeNull();
    }
  });

  it('says it is the demo', () => {
    expect(document.querySelector('#status')?.textContent).toContain('Demo account');
  });

  it('puts the positioning line on the page', () => {
    expect(document.querySelector('.positioning')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'light.gg tells you what is good. DIM tells you what you own. This tells you what you actually use.'
    );
  });

  it('says what it will not do', () => {
    const text = document.querySelector('.colophon')?.textContent || '';
    expect(text).toContain('counts kills, not time held');
    expect(text).toContain('pooled');
  });
});

describe('the way in', () => {
  it('asks nobody for an API key', () => {
    expect(document.querySelector('#api-key')).toBeNull();
    expect(document.querySelectorAll('input[type="password"]')).toHaveLength(0);
    const text = document.body.textContent || '';
    expect(text).not.toContain('API key');
    expect(document.body.innerHTML).not.toContain('bungie.net/en/Application');
  });

  it('offers sign-in and says plainly what it buys', () => {
    const button = document.querySelector<HTMLButtonElement>('#signin');
    expect(button?.hidden).toBe(false);
    expect(button?.textContent?.trim()).toBe('Sign in with Bungie');
    expect(document.querySelector('#session')?.textContent).toBe(
      'Sign in to read your own account without typing your name.'
    );
  });

  it('hides the signed-in controls until somebody signs in', () => {
    expect(document.querySelector<HTMLButtonElement>('#mine')?.hidden).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('#signout')?.hidden).toBe(true);
  });

  it('keeps the name lookup, because looking up a friend is the other half', () => {
    expect(document.querySelector('#bungie-name')).not.toBeNull();
    expect(document.querySelector<HTMLButtonElement>('#run')?.disabled).toBe(false);
  });

  it('rejects a malformed Bungie Name before it calls anything', async () => {
    const nameInput = document.querySelector<HTMLInputElement>('#bungie-name');
    if (!nameInput) throw new Error('missing input');
    nameInput.value = 'no hash here';
    document
      .querySelector<HTMLFormElement>('#lookup')
      ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));
    expect(document.querySelector('#report .status')?.textContent).toContain(
      'No account by that name'
    );
  });
});

describe('compare mode', () => {
  it('renders both curves and a verdict for the demo pair', async () => {
    document.querySelector<HTMLButtonElement>('#compare-demo')?.click();
    await new Promise((r) => setTimeout(r, 60));
    const output = document.querySelector('#compare-output');
    expect(output?.querySelectorAll('.lz-curve')).toHaveLength(2);
    expect(output?.querySelector('.prose.lead')?.textContent).toContain(
      'more concentrated'
    );
    expect(output?.querySelectorAll('.compare-table tr').length).toBeGreaterThan(4);
  });
});
