import { describe, expect, it } from 'vitest';
import {
  explainFailure,
  formatBungieName,
  iconUrl,
  parseBungieName,
  pickMembership,
  platformFetch,
  readWeaponEntry,
  readWeaponStats,
  BungieError
} from '../src/bungie';

describe('parseBungieName', () => {
  it('splits a plain name and code', () => {
    expect(parseBungieName('Guardian#1234')).toEqual({
      displayName: 'Guardian',
      displayNameCode: 1234
    });
  });

  it('trims surrounding whitespace', () => {
    expect(parseBungieName('  Guardian#1234  ')).toEqual({
      displayName: 'Guardian',
      displayNameCode: 1234
    });
  });

  it('keeps spaces inside the name', () => {
    expect(parseBungieName('The Drifter#0001')?.displayName).toBe('The Drifter');
  });

  it('reads a code with leading zeros as a number', () => {
    expect(parseBungieName('Guardian#0042')?.displayNameCode).toBe(42);
  });

  it('accepts short codes', () => {
    expect(parseBungieName('Guardian#7')?.displayNameCode).toBe(7);
  });

  it('rejects a missing code', () => {
    expect(parseBungieName('Guardian')).toBeNull();
    expect(parseBungieName('Guardian#')).toBeNull();
  });

  it('rejects a missing name', () => {
    expect(parseBungieName('#1234')).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(parseBungieName('')).toBeNull();
    expect(parseBungieName('   ')).toBeNull();
  });

  it('rejects a non numeric code', () => {
    expect(parseBungieName('Guardian#abcd')).toBeNull();
    expect(parseBungieName('Guardian#12a4')).toBeNull();
  });

  it('rejects more than one hash', () => {
    expect(parseBungieName('Guar#dian#1234')).toBeNull();
  });

  it('rejects an over long code', () => {
    expect(parseBungieName('Guardian#123456')).toBeNull();
  });

  it('round trips through formatBungieName with padding', () => {
    const parsed = parseBungieName('Guardian#42');
    expect(parsed).not.toBeNull();
    expect(formatBungieName(parsed!)).toBe('Guardian#0042');
  });
});

describe('readWeaponEntry', () => {
  it('reads the nested basic values', () => {
    const usage = readWeaponEntry({
      referenceId: 1234,
      values: {
        uniqueWeaponKills: { statId: 'uniqueWeaponKills', basic: { value: 500 } },
        uniqueWeaponPrecisionKills: { basic: { value: 250 } },
        uniqueWeaponKillsPrecisionKills: { basic: { value: 0.5 } }
      }
    });
    expect(usage).toEqual({
      referenceId: 1234,
      kills: 500,
      precisionKills: 250,
      precisionRatio: 0.5
    });
  });

  it('derives the ratio when the API omits it', () => {
    const usage = readWeaponEntry({
      referenceId: 9,
      values: {
        uniqueWeaponKills: { basic: { value: 4 } },
        uniqueWeaponPrecisionKills: { basic: { value: 1 } }
      }
    });
    expect(usage?.precisionRatio).toBeCloseTo(0.25, 12);
  });

  it('ignores a nonsense ratio and derives one instead', () => {
    const usage = readWeaponEntry({
      referenceId: 9,
      values: {
        uniqueWeaponKills: { basic: { value: 10 } },
        uniqueWeaponPrecisionKills: { basic: { value: 2 } },
        uniqueWeaponKillsPrecisionKills: { basic: { value: 17 } }
      }
    });
    expect(usage?.precisionRatio).toBeCloseTo(0.2, 12);
  });

  it('drops an entry with no reference id', () => {
    expect(readWeaponEntry({ values: {} })).toBeNull();
    expect(readWeaponEntry({ referenceId: 0, values: {} })).toBeNull();
  });

  it('treats a weapon with no values as zero kills', () => {
    expect(readWeaponEntry({ referenceId: 5 })).toEqual({
      referenceId: 5,
      kills: 0,
      precisionKills: 0,
      precisionRatio: 0
    });
  });

  it('rounds fractional counts the API sometimes reports as doubles', () => {
    const usage = readWeaponEntry({
      referenceId: 5,
      values: { uniqueWeaponKills: { basic: { value: 12.0 } } }
    });
    expect(usage?.kills).toBe(12);
  });
});

describe('readWeaponStats', () => {
  it('flattens a whole response', () => {
    const rows = readWeaponStats({
      weapons: [
        { referenceId: 1, values: { uniqueWeaponKills: { basic: { value: 10 } } } },
        { referenceId: 2, values: { uniqueWeaponKills: { basic: { value: 20 } } } }
      ]
    });
    expect(rows.map((r) => r.referenceId)).toEqual([1, 2]);
  });

  it('returns an empty list for a missing weapons array', () => {
    expect(readWeaponStats({})).toEqual([]);
    expect(readWeaponStats(null)).toEqual([]);
  });
});

describe('pickMembership', () => {
  it('prefers the cross save primary', () => {
    const picked = pickMembership([
      { membershipType: 1, membershipId: 'a', crossSaveOverride: 3 },
      { membershipType: 3, membershipId: 'b', crossSaveOverride: 3 }
    ]);
    expect(picked?.membershipId).toBe('b');
  });

  it('falls back to the first result', () => {
    const picked = pickMembership([
      { membershipType: 1, membershipId: 'a', crossSaveOverride: 0 }
    ]);
    expect(picked?.membershipId).toBe('a');
  });

  it('returns null for nothing', () => {
    expect(pickMembership([])).toBeNull();
    expect(pickMembership(null)).toBeNull();
  });
});

describe('platformFetch', () => {
  function once(body: unknown, status = 200): typeof fetch {
    return (async () =>
      new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  }

  it('unwraps a successful envelope', async () => {
    const result = await platformFetch<{ ok: boolean }>(
      '/x/',
      { retries: 0 },
      once({ ErrorCode: 1, Response: { ok: true } })
    );
    expect(result).toEqual({ ok: true });
  });

  it('maps the privacy error code to the private failure kind', async () => {
    await expect(
      platformFetch('/x/', { retries: 0 }, once({ ErrorCode: 1665, Message: 'nope' }, 500))
    ).rejects.toMatchObject({ kind: 'private', code: 1665 });
  });

  it('maps a missing key to the no key failure kind', async () => {
    await expect(
      platformFetch('/x/', { retries: 0 }, once({ ErrorCode: 2102 }, 500))
    ).rejects.toMatchObject({ kind: 'no-key' });
  });

  it('maps a bad key to the bad key failure kind', async () => {
    await expect(
      platformFetch('/x/', { retries: 0 }, once({ ErrorCode: 2101 }, 500))
    ).rejects.toMatchObject({ kind: 'bad-key' });
  });

  it('retries a transient error and then succeeds', async () => {
    let calls = 0;
    const flaky = (async () => {
      calls++;
      if (calls < 3) return new Response(JSON.stringify({ ErrorCode: 5 }), { status: 500 });
      return new Response(JSON.stringify({ ErrorCode: 1, Response: 'ok' }), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(platformFetch('/x/', { retries: 3 }, flaky)).resolves.toBe('ok');
    expect(calls).toBe(3);
  });

  it('does not retry a privacy failure', async () => {
    let calls = 0;
    const denied = (async () => {
      calls++;
      return new Response(JSON.stringify({ ErrorCode: 1665 }), { status: 500 });
    }) as unknown as typeof fetch;
    await expect(platformFetch('/x/', { retries: 3 }, denied)).rejects.toBeInstanceOf(
      BungieError
    );
    expect(calls).toBe(1);
  });

  it('reports a network failure after exhausting retries', async () => {
    const dead = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(platformFetch('/x/', { retries: 0 }, dead)).rejects.toMatchObject({
      kind: 'network'
    });
  });

  it('handles a non JSON body', async () => {
    const html = (async () =>
      new Response('<html>Service</html>', { status: 500 })) as unknown as typeof fetch;
    await expect(platformFetch('/x/', { retries: 0 }, html)).rejects.toMatchObject({
      kind: 'bungie-down'
    });
  });

  it('sends the API key header when one is given', async () => {
    let seen: Record<string, string> = {};
    const spy = (async (_url: string, init: RequestInit) => {
      seen = init.headers as Record<string, string>;
      return new Response(JSON.stringify({ ErrorCode: 1, Response: 1 }), { status: 200 });
    }) as unknown as typeof fetch;
    await platformFetch('/x/', { apiKey: 'abc', retries: 0 }, spy);
    expect(seen['X-API-Key']).toBe('abc');
  });
});

describe('explainFailure', () => {
  it('explains a private profile without pretending the data is zero', () => {
    const text = explainFailure('private');
    expect(text).toContain('private');
    expect(text).toContain('Settings');
    expect(text).not.toContain('0');
  });

  it('has a sentence for every failure kind', () => {
    for (const kind of [
      'no-key',
      'bad-key',
      'private',
      'not-found',
      'no-characters',
      'no-kills',
      'network',
      'bungie-down',
      'unknown'
    ] as const) {
      expect(explainFailure(kind).length).toBeGreaterThan(20);
    }
  });
});

describe('iconUrl', () => {
  it('prefixes a bungie path', () => {
    expect(iconUrl('/common/x.jpg')).toBe('https://www.bungie.net/common/x.jpg');
  });

  it('leaves an absolute url alone', () => {
    expect(iconUrl('https://example.com/x.jpg')).toBe('https://example.com/x.jpg');
  });

  it('returns an empty string for nothing', () => {
    expect(iconUrl('')).toBe('');
  });
});
