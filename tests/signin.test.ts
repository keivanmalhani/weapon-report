import { describe, expect, it } from 'vitest';
import { ApiError, type Session } from '../src/auth';
import { BungieError } from '../src/bungie';
import {
  accountView,
  failureText,
  getOwnPlayer,
  isSessionExpiry,
  pickOwnMembership,
  type ApiCall
} from '../src/signin';

const session: Session = {
  accessToken: 'token',
  expiresAt: 0,
  membershipId: '4611686018400000000'
};

describe('accountView', () => {
  it('offers sign-in and says what it buys when nobody is signed in', () => {
    const view = accountView(null, 0);
    expect(view.kind).toBe('signed-out');
    expect(view.showSignIn).toBe(true);
    expect(view.showMine).toBe(false);
    expect(view.note).toBe('Sign in to read your own account without typing your name.');
  });

  it('promises nothing more than not having to type a name', () => {
    // The sign-in buys one thing. Claiming more would be a lie a player finds
    // out about, and there is nothing else honest to claim.
    const note = accountView(null, 0).note;
    expect(note).not.toMatch(/faster|better|more|private|full|complete/i);
  });

  it('swaps the buttons over once there is a session', () => {
    const view = accountView(session, 59);
    expect(view.kind).toBe('signed-in');
    expect(view.showSignIn).toBe(false);
    expect(view.showMine).toBe(true);
  });

  it('says how many minutes are left and that they cannot be extended', () => {
    const view = accountView(session, 59);
    expect(view.note).toContain('59 minutes');
    expect(view.note).toContain('cannot be renewed');
  });

  it('changes tone under five minutes', () => {
    expect(accountView(session, 6).kind).toBe('signed-in');
    expect(accountView(session, 5).kind).toBe('expiring');
    expect(accountView(session, 5).note).toContain('5 minutes left');
  });

  it('reads as one minute rather than one minutes', () => {
    expect(accountView(session, 1).note).toContain('about 1 minute left');
  });

  it('says the last minute is the last minute', () => {
    const view = accountView(session, 0);
    expect(view.kind).toBe('expiring');
    expect(view.note).toContain('within the minute');
    expect(view.showMine).toBe(true);
  });

  it('clamps a negative or fractional count rather than printing it', () => {
    expect(accountView(session, -4).minutesLeft).toBe(0);
    expect(accountView(session, 12.9).minutesLeft).toBe(12);
    expect(accountView(session, 12.9).note).toContain('12 minutes');
  });

  it('reports no minutes at all when signed out', () => {
    expect(accountView(null, 45).minutesLeft).toBe(0);
  });
});

describe('isSessionExpiry', () => {
  it('recognises auth.ts refusing a call it knows has lapsed', () => {
    expect(isSessionExpiry(new ApiError('Not signed in, or the session has expired.', 0, 401))).toBe(
      true
    );
  });

  it('recognises every platform code that means the token is done', () => {
    for (const code of [99, 2111, 2123, 2124]) {
      expect(isSessionExpiry(new ApiError('nope', code, 500)), String(code)).toBe(true);
    }
  });

  it('recognises the same thing arriving through the platform client', () => {
    expect(isSessionExpiry(new BungieError('signed-out', 'gone'))).toBe(true);
  });

  it('does not mistake other failures for an expired hour', () => {
    expect(isSessionExpiry(new ApiError('private', 1665, 500))).toBe(false);
    expect(isSessionExpiry(new BungieError('private', 'private'))).toBe(false);
    expect(isSessionExpiry(new BungieError('not-found', 'nobody'))).toBe(false);
    expect(isSessionExpiry(new Error('offline'))).toBe(false);
    expect(isSessionExpiry(null)).toBe(false);
  });
});

describe('failureText', () => {
  it('offers the sign-in again instead of showing a code', () => {
    const { title, body } = failureText(new BungieError('signed-out', 'AccessTokenHasExpired'));
    expect(title).toBe('That sign-in has run out');
    expect(body).toContain('Sign in again');
    expect(body).not.toContain('AccessTokenHasExpired');
  });

  it('blames the site rather than the reader when the shared key is rejected', () => {
    const { title, body } = failureText(new BungieError('app-key', 'ApiInvalidOrExpiredKey'));
    expect(title).toBe('This site cannot talk to Bungie');
    expect(body).toContain('fault here');
  });

  it('still explains a private account', () => {
    expect(failureText(new BungieError('private', 'x')).title).toBe('This account is private');
  });

  it('still explains a name that matched nothing', () => {
    expect(failureText(new BungieError('not-found', 'x')).title).toBe('No account by that name');
  });

  it('passes through the sentence auth.ts already wrote', () => {
    const { body } = failureText(new ApiError('bungie.net did not answer in time.', 0, 0));
    expect(body).toBe('bungie.net did not answer in time.');
  });

  it('shows an unknown platform message rather than swallowing it', () => {
    expect(failureText(new BungieError('unknown', 'Something odd')).body).toBe('Something odd');
  });

  it('has something to say about a thrown value it has never seen', () => {
    expect(failureText('whoops').title).toBe('That did not work');
  });
});

describe('pickOwnMembership', () => {
  it('takes the membership Bungie names as the cross save primary', () => {
    const picked = pickOwnMembership({
      primaryMembershipId: 'b',
      destinyMemberships: [
        { membershipType: 1, membershipId: 'a' },
        { membershipType: 3, membershipId: 'b' }
      ]
    });
    expect(picked?.membershipId).toBe('b');
  });

  it('falls back to the search path guess when no primary is named', () => {
    const picked = pickOwnMembership({
      destinyMemberships: [
        { membershipType: 1, membershipId: 'a', crossSaveOverride: 3 },
        { membershipType: 3, membershipId: 'b', crossSaveOverride: 3 }
      ]
    });
    expect(picked?.membershipId).toBe('b');
  });

  it('falls back when the named primary is not in the list', () => {
    const picked = pickOwnMembership({
      primaryMembershipId: 'missing',
      destinyMemberships: [{ membershipType: 1, membershipId: 'a' }]
    });
    expect(picked?.membershipId).toBe('a');
  });

  it('returns null for an account with no Destiny memberships', () => {
    expect(pickOwnMembership({ destinyMemberships: [] })).toBeNull();
    expect(pickOwnMembership({})).toBeNull();
    expect(pickOwnMembership(null)).toBeNull();
  });
});

describe('getOwnPlayer', () => {
  function stub(response: unknown): { call: ApiCall; seen: { path: string; authenticated?: boolean } } {
    const seen = { path: '', authenticated: undefined as boolean | undefined };
    const call = (async (path: string, options?: { authenticated?: boolean }) => {
      seen.path = path;
      seen.authenticated = options?.authenticated;
      return response;
    }) as ApiCall;
    return { call, seen };
  }

  it('reads the signed-in account with the token, not the name search', async () => {
    const { call, seen } = stub({
      primaryMembershipId: '9',
      destinyMemberships: [
        {
          membershipType: 3,
          membershipId: '9',
          bungieGlobalDisplayName: 'Guardian',
          bungieGlobalDisplayNameCode: 42
        }
      ]
    });
    const player = await getOwnPlayer(call);
    expect(seen.path).toBe('/User/GetMembershipsForCurrentUser/');
    expect(seen.authenticated).toBe(true);
    expect(player).toEqual({
      displayName: 'Guardian',
      displayNameCode: 42,
      membershipType: 3,
      membershipId: '9'
    });
  });

  it('falls back to the platform display name when there is no Bungie Name', async () => {
    const { call } = stub({
      destinyMemberships: [{ membershipType: 2, membershipId: '7', displayName: 'OldPsnName' }]
    });
    const player = await getOwnPlayer(call);
    expect(player.displayName).toBe('OldPsnName');
    expect(player.displayNameCode).toBe(0);
  });

  it('says so when the Bungie account has no Destiny account on it', async () => {
    const { call } = stub({ destinyMemberships: [] });
    await expect(getOwnPlayer(call)).rejects.toMatchObject({ kind: 'no-characters' });
  });

  it('lets an expired session through untouched, for failureText to read', async () => {
    const call = (async () => {
      throw new ApiError('Not signed in, or the session has expired.', 0, 401);
    }) as ApiCall;
    await expect(getOwnPlayer(call)).rejects.toSatisfy(isSessionExpiry);
  });
});
