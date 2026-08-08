// @vitest-environment jsdom
//
// The same boot as boot.test.ts with a session already in sessionStorage, which
// is exactly what happens after /d2-auth/ sends somebody back here. It needs to
// be its own file because main.ts reads the session once, at import, and a test
// file is the smallest thing vitest gives a fresh module registry to.

import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

beforeAll(async () => {
  sessionStorage.setItem(
    'd2.session',
    JSON.stringify({
      accessToken: 'test-token',
      expiresAt: Date.now() + 3_600_000,
      membershipId: '4611686018400000000'
    })
  );
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
  await import('../src/main');
});

describe('booting with a session already written by d2-auth', () => {
  it('offers one button that needs no typing', () => {
    const mine = document.querySelector<HTMLButtonElement>('#mine');
    expect(mine?.hidden).toBe(false);
    expect(mine?.textContent?.trim()).toBe('Run my report');
  });

  it('drops the sign-in button and offers signing out instead', () => {
    expect(document.querySelector<HTMLButtonElement>('#signin')?.hidden).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('#signout')?.hidden).toBe(false);
  });

  it('says how much of the hour is left, quietly', () => {
    const note = document.querySelector('#session')?.textContent || '';
    expect(note).toContain('Signed in');
    expect(note).toMatch(/about 5[0-9] minutes left/);
    expect(note).toContain('cannot be renewed');
  });

  it('still renders the demo, because a session is not a report', () => {
    expect(document.querySelector('#report .headline')).not.toBeNull();
  });

  it('does not tell somebody already signed in to sign in', () => {
    const status = document.querySelector('#status')?.textContent || '';
    expect(status).toContain('Demo account');
    expect(status).toContain('Run my report');
    expect(status).not.toContain('Sign in');
  });

  it('still keeps the name lookup for other people\'s accounts', () => {
    expect(document.querySelector('#bungie-name')).not.toBeNull();
  });

  it('goes back to offering sign-in when the session is thrown away', () => {
    document.querySelector<HTMLButtonElement>('#signout')?.click();
    expect(sessionStorage.getItem('d2.session')).toBeNull();
    expect(document.querySelector<HTMLButtonElement>('#signin')?.hidden).toBe(false);
    expect(document.querySelector<HTMLButtonElement>('#mine')?.hidden).toBe(true);
    expect(document.querySelector('#session')?.textContent).toContain(
      'without typing your name'
    );
  });
});
