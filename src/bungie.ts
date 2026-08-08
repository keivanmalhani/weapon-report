// Bungie.net platform client.
//
// Every call carries the shared application key from auth.ts. Public stats need
// nothing more than that. A signed-in visitor's access token goes along as well
// where one exists, which is what lets somebody read their own account when
// their Destiny privacy is set to private.
//
// Confirmed against the live OpenAPI document at
// https://github.com/Bungie-net/api. Note that the route for the weapon
// history is Stats/UniqueWeapons/, even though the operation is named
// Destiny2.GetUniqueWeaponHistory. Stats/UniqueWeaponHistory/ is not a route
// and returns an HTML error page.

import { API_KEY } from './auth';
import type { CharacterRef, PlayerRef, WeaponUsage } from './types';

export const PLATFORM = 'https://www.bungie.net/Platform';
export const BUNGIE_ROOT = 'https://www.bungie.net';

/** Platform error codes this app reacts to by name. */
export const ERROR_CODES = {
  Success: 1,
  WebAuthRequired: 99,
  SystemDisabled: 5,
  DestinyAccountNotFound: 1601,
  DestinyUnexpectedError: 1618,
  DestinyPrivacyRestriction: 1665,
  DestinyLegacyPlatformInaccessible: 1670,
  ApiInvalidOrExpiredKey: 2101,
  ApiKeyMissingFromRequest: 2102,
  AccessTokenHasExpired: 2111,
  AuthorizationRecordExpired: 2123,
  AuthorizationRecordRevoked: 2124
} as const;

/**
 * The codes that mean the hour ran out, as opposed to the request being wrong.
 *
 * Bungie issues no refresh token to a public client, so there is nothing to do
 * about any of these except sign in again. They are gathered here because both
 * the failure mapping below and the sign-in module need the same list.
 */
export const AUTH_EXPIRY_CODES: ReadonlySet<number> = new Set([
  ERROR_CODES.WebAuthRequired,
  ERROR_CODES.AccessTokenHasExpired,
  ERROR_CODES.AuthorizationRecordExpired,
  ERROR_CODES.AuthorizationRecordRevoked
]);

/**
 * A detached reference to the global fetch throws in some browsers, so every
 * default goes through this wrapper rather than through `fetch` directly.
 */
export const defaultFetch: typeof fetch = (input, init) => fetch(input, init);

export type FailureKind =
  | 'app-key'
  | 'signed-out'
  | 'private'
  | 'not-found'
  | 'no-characters'
  | 'no-kills'
  | 'network'
  | 'bungie-down'
  | 'unknown';

export class BungieError extends Error {
  readonly kind: FailureKind;
  readonly code: number;

  constructor(kind: FailureKind, message: string, code = 0) {
    super(message);
    this.name = 'BungieError';
    this.kind = kind;
    this.code = code;
  }
}

/** Human readable explanation for every failure the UI can hit. */
export function explainFailure(kind: FailureKind): string {
  switch (kind) {
    case 'app-key':
      return 'Bungie rejected this site\'s own API key, which is a fault here and not anything to do with your account. Nothing will load until the key is replaced.';
    case 'signed-out':
      return 'That sign-in has run out. Bungie sessions last an hour and cannot be renewed, so signing in again is the only way to carry on.';
    case 'private':
      return 'This account has its Destiny history set to private, so Bungie will not hand out the weapon numbers to anyone but the account holder. The player can change this at bungie.net under Settings, Privacy, by allowing their Destiny stats to be public. Nothing here is broken and there is no partial number worth showing.';
    case 'not-found':
      return 'No Destiny account matched that Bungie Name. The name is case sensitive and the four digit code after the hash is part of it.';
    case 'no-characters':
      return 'That account exists but has no Destiny characters on it.';
    case 'no-kills':
      return 'That account has characters but no recorded weapon kills yet.';
    case 'network':
      return 'The request to bungie.net did not complete. That is usually a connection problem rather than an account problem.';
    case 'bungie-down':
      return 'The Bungie API is in maintenance or returning errors right now. This happens on patch days. Try again later.';
    default:
      return 'Something went wrong talking to bungie.net.';
  }
}

function kindForCode(code: number): FailureKind {
  if (AUTH_EXPIRY_CODES.has(code)) return 'signed-out';
  switch (code) {
    case ERROR_CODES.ApiKeyMissingFromRequest:
    case ERROR_CODES.ApiInvalidOrExpiredKey:
      return 'app-key';
    case ERROR_CODES.DestinyPrivacyRestriction:
      return 'private';
    case ERROR_CODES.DestinyAccountNotFound:
      return 'not-found';
    case ERROR_CODES.SystemDisabled:
    case ERROR_CODES.DestinyUnexpectedError:
      return 'bungie-down';
    default:
      return 'unknown';
  }
}

export interface ParsedBungieName {
  displayName: string;
  displayNameCode: number;
}

/**
 * Parse "Guardian#1234" into its two parts. The code is exactly the digits
 * after the last hash, kept as a number because that is what the API wants,
 * and leading zeros are allowed because Bungie issues them.
 */
export function parseBungieName(input: string): ParsedBungieName | null {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;
  const hash = trimmed.lastIndexOf('#');
  if (hash <= 0 || hash === trimmed.length - 1) return null;
  const name = trimmed.slice(0, hash).trim();
  const code = trimmed.slice(hash + 1).trim();
  if (!name) return null;
  if (!/^[0-9]{1,5}$/.test(code)) return null;
  if (name.includes('#')) return null;
  return { displayName: name, displayNameCode: Number(code) };
}

/** Render a player back into the canonical "Name#0042" form. */
export function formatBungieName(player: {
  displayName: string;
  displayNameCode: number;
}): string {
  const code = String(player.displayNameCode).padStart(4, '0');
  return player.displayName + '#' + code;
}

export interface BungieEnvelope<T> {
  Response?: T;
  ErrorCode?: number;
  ErrorStatus?: string;
  Message?: string;
  ThrottleSeconds?: number;
}

export interface FetchOptions {
  /** Overrides the shared application key. Only tests have a reason to. */
  apiKey?: string;
  /** The signed-in visitor's token, when there is one. */
  accessToken?: string | null;
  method?: 'GET' | 'POST';
  body?: unknown;
  retries?: number;
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * One platform call with retry. Bungie returns HTTP 500 for ordinary
 * application errors including a missing API key, so the envelope matters
 * more than the status code.
 */
export async function platformFetch<T>(
  path: string,
  options: FetchOptions = {},
  fetchImpl: typeof fetch = defaultFetch
): Promise<T> {
  const retries = options.retries ?? 2;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-API-Key': options.apiKey || API_KEY
  };
  if (options.accessToken) headers['Authorization'] = 'Bearer ' + options.accessToken;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(300 * Math.pow(2, attempt - 1));
    let response: Response;
    try {
      response = await fetchImpl(PLATFORM + path, {
        method: options.method || 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal
      });
    } catch (error) {
      lastError = new BungieError('network', 'Could not reach bungie.net.');
      continue;
    }
    let envelope: BungieEnvelope<T>;
    try {
      envelope = (await response.json()) as BungieEnvelope<T>;
    } catch (error) {
      lastError = new BungieError('bungie-down', 'bungie.net returned a non JSON body.');
      continue;
    }
    const code = envelope.ErrorCode ?? 0;
    if (code === ERROR_CODES.Success && envelope.Response !== undefined) {
      return envelope.Response;
    }
    const kind = kindForCode(code);
    const error = new BungieError(
      kind,
      envelope.Message || 'bungie.net returned error code ' + code,
      code
    );
    // Only transient classes are worth another attempt.
    if (kind === 'bungie-down' || kind === 'unknown') {
      lastError = error;
      continue;
    }
    throw error;
  }
  throw lastError instanceof Error
    ? lastError
    : new BungieError('unknown', 'bungie.net request failed.');
}

export interface UserInfoCard {
  membershipType: number;
  membershipId: string;
  bungieGlobalDisplayName?: string;
  bungieGlobalDisplayNameCode?: number;
  displayName?: string;
  crossSaveOverride?: number;
  applicableMembershipTypes?: number[];
}

/**
 * Look up a Bungie Name. membershipType -1 is "All". Cross save overridden
 * memberships are hidden by the API already, so the first result is the one
 * that owns the stats.
 */
export async function searchPlayer(
  name: ParsedBungieName,
  accessToken: string | null = null,
  fetchImpl: typeof fetch = defaultFetch
): Promise<PlayerRef> {
  const results = await platformFetch<UserInfoCard[]>(
    '/Destiny2/SearchDestinyPlayerByBungieName/-1/',
    {
      accessToken,
      method: 'POST',
      body: { displayName: name.displayName, displayNameCode: name.displayNameCode }
    },
    fetchImpl
  );
  const first = pickMembership(results);
  if (!first) {
    throw new BungieError('not-found', 'No Destiny account matched that Bungie Name.');
  }
  return {
    displayName: first.bungieGlobalDisplayName || name.displayName,
    displayNameCode: first.bungieGlobalDisplayNameCode ?? name.displayNameCode,
    membershipType: first.membershipType,
    membershipId: first.membershipId
  };
}

/**
 * Prefer the membership the account has cross saved onto, otherwise the first
 * one the API returned.
 */
export function pickMembership(results: UserInfoCard[] | null): UserInfoCard | null {
  if (!results || results.length === 0) return null;
  const primary = results.find(
    (r) => r.crossSaveOverride !== 0 && r.crossSaveOverride === r.membershipType
  );
  return primary || results[0];
}

interface ProfileCharactersResponse {
  characters?: {
    data?: Record<
      string,
      { characterId: string; classType?: number; classHash?: number }
    >;
    privacy?: number;
  };
}

const CLASS_NAMES: Record<number, string> = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };

/** Character list for an account, using profile component 200. */
export async function getCharacters(
  player: PlayerRef,
  accessToken: string | null = null,
  fetchImpl: typeof fetch = defaultFetch
): Promise<CharacterRef[]> {
  const profile = await platformFetch<ProfileCharactersResponse>(
    '/Destiny2/' +
      player.membershipType +
      '/Profile/' +
      player.membershipId +
      '/?components=200',
    { accessToken },
    fetchImpl
  );
  const data = profile.characters?.data;
  // Privacy 2 means the component exists but Bungie will not populate it.
  if (!data || Object.keys(data).length === 0) {
    if (profile.characters?.privacy === 2) {
      throw new BungieError(
        'private',
        'This account keeps its Destiny profile private.',
        ERROR_CODES.DestinyPrivacyRestriction
      );
    }
    throw new BungieError('no-characters', 'That account has no Destiny characters.');
  }
  return Object.values(data).map((c) => ({
    characterId: c.characterId,
    classNameHint: CLASS_NAMES[c.classType ?? -1] || 'Guardian'
  }));
}

interface HistoricalStatsValue {
  statId?: string;
  basic?: { value?: number; displayValue?: string };
  pga?: { value?: number; displayValue?: string };
}

interface HistoricalWeaponStats {
  referenceId?: number;
  values?: Record<string, HistoricalStatsValue>;
}

export interface WeaponStatsData {
  weapons?: HistoricalWeaponStats[];
}

/**
 * Flatten one weapon entry. The API nests every number under
 * values.<statId>.basic.value, so nothing here can be read off the top level.
 * The known stat ids are uniqueWeaponKills, uniqueWeaponPrecisionKills and
 * uniqueWeaponKillsPrecisionKills, the last being the ratio. The ratio is
 * recomputed when it is missing or when it disagrees with the counts.
 */
export function readWeaponEntry(entry: HistoricalWeaponStats): WeaponUsage | null {
  const referenceId = Number(entry.referenceId ?? 0);
  if (!referenceId) return null;
  const values = entry.values || {};
  const kills = Number(values['uniqueWeaponKills']?.basic?.value ?? 0);
  const precisionKills = Number(
    values['uniqueWeaponPrecisionKills']?.basic?.value ?? 0
  );
  const reported = values['uniqueWeaponKillsPrecisionKills']?.basic?.value;
  const derived = kills > 0 ? precisionKills / kills : 0;
  const ratio =
    typeof reported === 'number' && isFinite(reported) && reported >= 0 && reported <= 1
      ? reported
      : derived;
  return {
    referenceId,
    kills: Math.max(0, Math.round(kills)),
    precisionKills: Math.max(0, Math.round(precisionKills)),
    precisionRatio: ratio
  };
}

/** Flatten a whole UniqueWeaponHistory response. */
export function readWeaponStats(data: WeaponStatsData | null): WeaponUsage[] {
  const list = data?.weapons || [];
  const out: WeaponUsage[] = [];
  for (const entry of list) {
    const usage = readWeaponEntry(entry);
    if (usage) out.push(usage);
  }
  return out;
}

/** Unique weapon history for one character. */
export async function getWeaponHistory(
  player: PlayerRef,
  characterId: string,
  accessToken: string | null = null,
  fetchImpl: typeof fetch = defaultFetch
): Promise<WeaponUsage[]> {
  const data = await platformFetch<WeaponStatsData>(
    '/Destiny2/' +
      player.membershipType +
      '/Account/' +
      player.membershipId +
      '/Character/' +
      characterId +
      '/Stats/UniqueWeapons/',
    { accessToken },
    fetchImpl
  );
  return readWeaponStats(data);
}

/** Unique weapon history for every character on the account. */
export async function getAllWeaponHistories(
  player: PlayerRef,
  characters: CharacterRef[],
  accessToken: string | null = null,
  fetchImpl: typeof fetch = defaultFetch
): Promise<WeaponUsage[][]> {
  const out: WeaponUsage[][] = [];
  for (const character of characters) {
    out.push(await getWeaponHistory(player, character.characterId, accessToken, fetchImpl));
  }
  return out;
}

/** Full bungie.net URL for an icon path out of the manifest. */
export function iconUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return BUNGIE_ROOT + path;
}
