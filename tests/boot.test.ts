// @vitest-environment jsdom
//
// Boots the real page: the shipped index.html markup plus main.ts, with no
// network. Demo mode has to render on load with nothing set up, which is the
// promise the site makes.

import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

beforeAll(async () => {
  // jsdom has no 2D context. The share panel copes with a null context, and
  // stubbing it here keeps jsdom from logging a not implemented warning.
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
  await import('../src/main');
});

describe('first paint', () => {
  it('renders the demo report without a key or a network call', () => {
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

describe('lookup without a key', () => {
  it('explains that a key is needed rather than drawing an empty chart', async () => {
    const nameInput = document.querySelector<HTMLInputElement>('#bungie-name');
    const keyInput = document.querySelector<HTMLInputElement>('#api-key');
    if (!nameInput || !keyInput) throw new Error('missing inputs');
    nameInput.value = 'Guardian#1234';
    keyInput.value = '';
    document
      .querySelector<HTMLFormElement>('#lookup')
      ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));
    const panel = document.querySelector('#report .status');
    expect(panel?.textContent).toContain('API key');
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
