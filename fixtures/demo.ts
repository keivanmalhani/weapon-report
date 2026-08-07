// The bundled demo account. Real weapon names, types and icon paths taken
// from the live Destiny manifest; the kill counts are generated with a fixed
// seed so the numbers are stable and nobody's real account is on display.
// Rebuild with `npm run fixtures`.

import mainAccount from './demo-account.json';
import type { PlayerRef, WeaponDef, WeaponUsage } from '../src/types';

export interface DemoAccount {
  player: PlayerRef;
  characters: string[];
  histories: WeaponUsage[][];
  weapons: Record<string, WeaponDef>;
}

export const DEMO_MAIN = mainAccount as DemoAccount;

/**
 * The second demo account is only wanted by compare mode, so it is split out
 * of the first load rather than doubling the download for everyone.
 */
export async function loadDemoRival(): Promise<DemoAccount> {
  const module = await import('./demo-account-b.json');
  return (module.default ?? module) as unknown as DemoAccount;
}
