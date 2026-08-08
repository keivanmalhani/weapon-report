// @vitest-environment jsdom
//
// The awkward half of the hour: the stored session still looks fine, and
// bungie.net rejects the token anyway. A revoked authorisation does this, and so
// does a clock that disagrees. The page has to end up offering the sign-in
// button, because the message it prints tells the reader to press one.

import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

const calls: string[] = [];

beforeAll(async () => {
  sessionStorage.setItem(
    'd2.session',
    JSON.stringify({
      accessToken: 'revoked-token',
      // A full hour left, so nothing local has any reason to doubt it.
      expiresAt: Date.now() + 3_600_000,
      membershipId: '4611686018400000000'
    })
  );
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(
      JSON.stringify({ ErrorCode: 2111, ErrorStatus: 'AccessTokenHasExpired' }),
      { status: 401, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
  await import('../src/main');

  document.querySelector<HTMLButtonElement>('#mine')?.click();
  await new Promise((r) => setTimeout(r, 60));
});

describe('a token bungie.net rejects before the clock runs out', () => {
  it('asked Bungie who is signed in and got nowhere', () => {
    expect(calls.some((c) => c.includes('/User/GetMembershipsForCurrentUser/'))).toBe(true);
  });

  it('says the sign-in ran out instead of printing the error code', () => {
    const panel = document.querySelector('#report .status');
    expect(panel?.querySelector('h2')?.textContent).toBe('That sign-in has run out');
    const body = panel?.querySelector('.prose')?.textContent || '';
    expect(body).toContain('Sign in again');
    expect(body).not.toContain('2111');
    expect(body).not.toContain('AccessTokenHasExpired');
  });

  it('throws the dead session away rather than counting down to nothing', () => {
    expect(sessionStorage.getItem('d2.session')).toBeNull();
  });

  it('puts the button back, since the message tells the reader to press one', () => {
    expect(document.querySelector<HTMLButtonElement>('#signin')?.hidden).toBe(false);
    expect(document.querySelector<HTMLButtonElement>('#mine')?.hidden).toBe(true);
    expect(document.querySelector('#session')?.textContent).toContain('Sign in to read');
  });
});
