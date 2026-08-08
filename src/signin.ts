// Who the report is for, and what the page says about it.
//
// The sign-in itself is not here and is not this site's problem: it lives at
// /d2-auth/ and arrives vendored as auth.ts. What is left over is the part that
// is specific to this page, and all of it is a function of one session object,
// so all of it is written as plain functions over that object rather than as
// something that reads the DOM.
//
// The hour is the thing worth designing around. Bungie hands a public client no
// refresh token, so a session cannot be extended, only replaced. That makes an
// expired session an ordinary event rather than an error, and the page treats
// it as one: it says how long is left before anyone has to find out the hard
// way, and when a call does fail on it, it offers the button again instead of
// printing a code.

import { ApiError, api, type CallOptions, type Session } from './auth';
import { AUTH_EXPIRY_CODES, BungieError, explainFailure, pickMembership } from './bungie';
import type { UserInfoCard } from './bungie';
import type { PlayerRef } from './types';

/**
 * Below this many minutes the countdown stops being background information and
 * starts being something worth reading before pressing a button.
 */
export const EXPIRING_MINUTES = 5;

export type AccountKind = 'signed-out' | 'signed-in' | 'expiring';

export interface AccountView {
  kind: AccountKind;
  /** Whole minutes left, and zero whenever nobody is signed in. */
  minutesLeft: number;
  /** The quiet line under the buttons. */
  note: string;
  showSignIn: boolean;
  showMine: boolean;
}

/**
 * The whole of the sign-in area, decided from the session and nothing else.
 *
 * Both arguments come out of auth.ts, which owns the minute of slack it allows
 * a session; taking the minutes as a number rather than recomputing them here
 * keeps that arithmetic in one place.
 */
export function accountView(session: Session | null, minutesLeft: number): AccountView {
  if (!session) {
    return {
      kind: 'signed-out',
      minutesLeft: 0,
      note: 'Sign in to read your own account without typing your name.',
      showSignIn: true,
      showMine: false
    };
  }

  const minutes = Math.max(0, Math.floor(minutesLeft));
  const shown = { minutesLeft: minutes, showSignIn: false, showMine: true } as const;

  if (minutes > EXPIRING_MINUTES) {
    return {
      kind: 'signed-in',
      note:
        'Signed in, with about ' +
        minutes +
        ' minutes left. Bungie sessions last an hour and cannot be renewed.',
      ...shown
    };
  }
  if (minutes === 0) {
    return {
      kind: 'expiring',
      note: 'Signed in, but this session runs out within the minute. Signing in again is the only way to get another.',
      ...shown
    };
  }
  return {
    kind: 'expiring',
    note:
      'Signed in, with about ' +
      minutes +
      (minutes === 1 ? ' minute' : ' minutes') +
      ' left. Signing in again is the only way to get another.',
    ...shown
  };
}

/**
 * Whether a failure is the hour running out rather than something being wrong.
 *
 * It arrives two ways. Usually auth.ts refuses the call outright, because the
 * stored session lapsed before the request was made, and that never reaches the
 * network. Sometimes the token dies mid-report and bungie.net rejects it, which
 * comes back as one of the platform codes.
 */
export function isSessionExpiry(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 401 || AUTH_EXPIRY_CODES.has(error.code);
  }
  if (error instanceof BungieError) return error.kind === 'signed-out';
  return false;
}

/**
 * A failure as a heading and a paragraph.
 *
 * Pure, because what the page says when something goes wrong is worth pinning
 * down in tests rather than discovering in production.
 */
export function failureText(error: unknown): { title: string; body: string } {
  if (isSessionExpiry(error)) {
    return {
      title: 'That sign-in has run out',
      body: 'Bungie sessions last an hour and cannot be renewed. Sign in again and the report will run.'
    };
  }
  if (error instanceof BungieError) {
    const title =
      error.kind === 'private'
        ? 'This account is private'
        : error.kind === 'not-found'
          ? 'No account by that name'
          : error.kind === 'app-key'
            ? 'This site cannot talk to Bungie'
            : 'That did not work';
    const explanation = explainFailure(error.kind);
    const body = error.message && error.kind === 'unknown' ? error.message : explanation;
    return { title, body };
  }
  // auth.ts has already turned Bungie's error names into a sentence by here.
  if (error instanceof ApiError) return { title: 'That did not work', body: error.message };
  return {
    title: 'That did not work',
    body: 'An unexpected error stopped the report. The browser console has the detail.'
  };
}

export interface MembershipsResponse {
  destinyMemberships?: UserInfoCard[];
  /** Set once an account has picked which membership its cross save runs on. */
  primaryMembershipId?: string;
}

/**
 * Which of the signed-in account's Destiny memberships owns the stats.
 *
 * Bungie names the cross save primary outright here, which the public name
 * search does not, so prefer it and fall back to the same guess the search
 * path makes.
 */
export function pickOwnMembership(response: MembershipsResponse | null): UserInfoCard | null {
  const list = response?.destinyMemberships ?? [];
  const primary = response?.primaryMembershipId;
  if (primary) {
    const named = list.find((m) => m.membershipId === primary);
    if (named) return named;
  }
  return pickMembership(list);
}

/** The one call in auth.ts this module needs, loosened so tests can stand in. */
export type ApiCall = <T>(path: string, options?: CallOptions) => Promise<T>;

/**
 * The signed-in visitor as a PlayerRef, so the rest of the report cannot tell
 * whether it came from a sign-in or from someone typing a name.
 */
export async function getOwnPlayer(call: ApiCall = api): Promise<PlayerRef> {
  const response = await call<MembershipsResponse>('/User/GetMembershipsForCurrentUser/', {
    authenticated: true
  });
  const membership = pickOwnMembership(response);
  if (!membership) {
    throw new BungieError(
      'no-characters',
      'That Bungie account has no Destiny memberships on it.'
    );
  }
  return {
    displayName: membership.bungieGlobalDisplayName || membership.displayName || 'Guardian',
    displayNameCode: membership.bungieGlobalDisplayNameCode ?? 0,
    membershipType: membership.membershipType,
    membershipId: membership.membershipId
  };
}
