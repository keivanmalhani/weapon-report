// Shared types for weapon-report.

/** One weapon as returned by the Bungie unique weapon history, after flattening. */
export interface WeaponUsage {
  /** DestinyInventoryItemDefinition hash. */
  referenceId: number;
  kills: number;
  precisionKills: number;
  /** Ratio reported by the API, or derived when the API omits it. */
  precisionRatio: number;
}

/** The subset of DestinyInventoryItemDefinition this app keeps. */
export interface WeaponDef {
  /** Display name, for example "Fatebringer". */
  name: string;
  /** Icon path relative to bungie.net, for example "/common/.../abc.jpg". */
  icon: string;
  /** Display type, for example "Hand Cannon". */
  type: string;
  /** DestinyItemSubType enum value. */
  subType: number;
  /** DestinyDamageType enum value. */
  damageType: number;
  /** DestinyItemTierType enum value: 6 exotic, 5 legendary, 4 rare. */
  tierType: number;
  /** DestinyAmmunitionType enum value: 1 primary, 2 special, 3 heavy. */
  ammoType: number;
}

/** A weapon usage row joined against the manifest. */
export interface WeaponRow extends WeaponUsage {
  name: string;
  icon: string;
  type: string;
  subType: number;
  damageType: number;
  tierType: number;
  ammoType: number;
  /** Share of the account total, 0 to 1. */
  share: number;
}

export interface CharacterRef {
  characterId: string;
  classNameHint: string;
}

export interface PlayerRef {
  displayName: string;
  displayNameCode: number;
  membershipType: number;
  membershipId: string;
}

export interface AccountReport {
  player: PlayerRef;
  characterCount: number;
  rows: WeaponRow[];
  totalKills: number;
  totalPrecisionKills: number;
}

/** A demo or live fixture in the shape the UI consumes. */
export interface RawAccount {
  player: PlayerRef;
  characters: string[];
  /** Per character, the raw usage list. */
  histories: WeaponUsage[][];
}
