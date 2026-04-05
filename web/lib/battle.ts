// ── Skill definitions ─────────────────────────────────────────────────────────

export type SkillId = "strike" | "brace" | "realm";

export interface Skill {
  id: SkillId;
  name: string;
  icon: string;
  desc: string;
  cooldown: number; // seconds, 0 = no cooldown
}

export const BASIC_SKILLS: Record<"strike" | "brace", Skill> = {
  strike: {
    id: "strike",
    name: "Strike",
    icon: "⚔️",
    desc: "Deal 1.0× Attack damage",
    cooldown: 0,
  },
  brace: {
    id: "brace",
    name: "Brace",
    icon: "🛡️",
    desc: "Reduce incoming damage by 30% for 1 second",
    cooldown: 0,
  },
};

export interface RealmSkill extends Skill {
  multiplier?: number;       // damage multiplier (if offensive)
  healPercent?: number;      // % of maxHP to heal (if healing)
  defenceDebuff?: number;    // % defence reduction on opponent
  attackDebuff?: number;     // % attack reduction on opponent
  stunChance?: number;       // % chance to stun opponent
  debuffDuration?: number;   // seconds the debuff lasts
}

export const REALM_SKILLS: Record<string, RealmSkill> = {
  academia: {
    id: "realm",
    name: "Deep Research",
    icon: "📖",
    desc: "Reduce opponent Defence by 25% for 2 seconds",
    cooldown: 4,
    defenceDebuff: 0.25,
    debuffDuration: 2,
  },
  tech: {
    id: "realm",
    name: "Commit Storm",
    icon: "⚡",
    desc: "Deal 1.8× Attack damage",
    cooldown: 4,
    multiplier: 1.8,
  },
  medicine: {
    id: "realm",
    name: "Clinical Mastery",
    icon: "⚕️",
    desc: "Heal 20% of max HP",
    cooldown: 4,
    healPercent: 0.20,
  },
  creative: {
    id: "realm",
    name: "Viral Work",
    icon: "🎨",
    desc: "Deal 1.2× damage + 30% chance to stun for 1 second",
    cooldown: 3,
    multiplier: 1.2,
    stunChance: 0.30,
    debuffDuration: 1,
  },
  law: {
    id: "realm",
    name: "Precedent",
    icon: "⚖️",
    desc: "Reduce opponent Attack by 20% for 3 seconds",
    cooldown: 4,
    attackDebuff: 0.20,
    debuffDuration: 3,
  },
};

// ── Damage formula ─────────────────────────────────────────────────────────────
// Based on the RPG standard: damage = attack × multiplier × (100 / (100 + defence))
// Defence never fully blocks — high defence reduces but never zeroes damage

export function calcDamage(
  attackerAttack: number,
  defenderDefence: number,
  multiplier: number = 1.0,
  bracingActive: boolean = false,
  defenceDebuffMultiplier: number = 1.0, // 1.0 = no debuff, 0.75 = 25% reduced defence
): number {
  const effectiveDefence = defenderDefence * defenceDebuffMultiplier;
  const reduction = bracingActive ? 0.70 : 1.0; // brace = 30% damage reduction
  const raw = attackerAttack * multiplier * (100 / (100 + effectiveDefence));
  return Math.max(1, Math.round(raw * reduction));
}

// ── Battle state types ─────────────────────────────────────────────────────────

export interface PlayerBattleState {
  userId: string;
  name: string;
  realm: string;
  maxHp: number;
  currentHp: number;
  attack: number;
  defence: number;
  isBracing: boolean;
  isStunned: boolean;
  defenceDebuffUntil: number;  // timestamp ms, 0 = no debuff
  attackDebuffUntil: number;   // timestamp ms, 0 = no debuff
  defenceDebuffMultiplier: number; // 1.0 = full, 0.75 = 25% reduced
  attackDebuffMultiplier: number;  // 1.0 = full, 0.80 = 20% reduced
  realmSkillLastUsed: number;  // timestamp ms
  gold: number;
}

export interface BattleAction {
  type: "strike" | "brace" | "realm";
  attackerId: string;
  timestamp: number;
}

export interface BattleEvent {
  type: "action" | "hp_update" | "battle_end" | "reconnect" | "disconnect";
  payload: Record<string, unknown>;
}

// ── Gold reward ────────────────────────────────────────────────────────────────
export const GOLD_TRANSFER_PERCENT = 0.10; // winner takes 10% of loser's gold

export function calcGoldTransfer(loserGold: number): number {
  if (loserGold < 50) return loserGold; // lose all remaining if below minimum
  const raw = Math.floor(loserGold * GOLD_TRANSFER_PERCENT);
  return Math.max(50, Math.min(500, raw));
}

// ── Tier check — players must be in the same tier to battle ───────────────────
export function isSameTier(tier1: string, tier2: string): boolean {
  return tier1 === tier2;
}

// ── Starting gold on signup ───────────────────────────────────────────────────
export const BASE_GOLD = 500;

// ── Bonus gold for saving realm scores ───────────────────────────────────────
// Each realm saved gives a bonus proportional to its power contribution
export function calcRealmGoldBonus(realmPower: number): number {
  return Math.floor(realmPower * 0.1); // 10% of realm power as gold bonus
}
