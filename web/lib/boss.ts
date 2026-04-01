// lib/boss.ts
// Boss definitions and AI logic for PvE battles

export interface Boss {
  tier: string
  name: string
  lore: string        // flavour text shown in lobby
  realm: string       // determines boss special attack flavour
  hp: number
  attack: number
  defence: number
  attackIntervalMs: number  // how fast the boss attacks
  skillIntervalMs: number   // how fast the boss uses its special
  goldReward: number        // per surviving player
  icon: string
}

export interface BossState {
  currentHp: number
  lastAttackAt: number
  lastSkillAt: number
  attackTargetIndex: number // cycles through players
}

// ── 15 bosses, one per tier ─────────────────────────────────────────────────
// Stats scale significantly with tier.
// Lower tiers: slow, weak, forgiving.
// Higher tiers: fast, devastating, punishing.

export const BOSSES: Record<string, Boss> = {
  Apprentice: {
    tier: 'Apprentice',
    name: 'The Hollow Golem',
    lore: 'A crumbling construct of forgotten stone. It moves slowly, but its fists are heavy.',
    realm: 'tech',
    hp: 2400,
    attack: 180,
    defence: 60,
    attackIntervalMs: 3000,
    skillIntervalMs: 12000,
    goldReward: 80,
    icon: '🪨',
  },
  Initiate: {
    tier: 'Initiate',
    name: 'Sable Witch',
    lore: 'A novice spellcaster who never learned restraint. Her curses linger.',
    realm: 'academia',
    hp: 3200,
    attack: 230,
    defence: 80,
    attackIntervalMs: 2800,
    skillIntervalMs: 11000,
    goldReward: 120,
    icon: '🧙',
  },
  Acolyte: {
    tier: 'Acolyte',
    name: 'Iron Sentinel',
    lore: 'A guardian built to last. It has outlasted every challenger — until now.',
    realm: 'law',
    hp: 4200,
    attack: 290,
    defence: 110,
    attackIntervalMs: 2600,
    skillIntervalMs: 10000,
    goldReward: 170,
    icon: '🤖',
  },
  Journeyman: {
    tier: 'Journeyman',
    name: 'The Pale Surgeon',
    lore: 'Once a healer. Now something else entirely. It knows exactly where to cut.',
    realm: 'medicine',
    hp: 5400,
    attack: 360,
    defence: 140,
    attackIntervalMs: 2400,
    skillIntervalMs: 9500,
    goldReward: 230,
    icon: '🩺',
  },
  Adept: {
    tier: 'Adept',
    name: 'Stormcaller Vex',
    lore: 'A rogue technomancer who rewired the laws of combat in their favour.',
    realm: 'tech',
    hp: 6800,
    attack: 440,
    defence: 170,
    attackIntervalMs: 2200,
    skillIntervalMs: 9000,
    goldReward: 300,
    icon: '⚡',
  },
  Scholar: {
    tier: 'Scholar',
    name: 'The Archivist',
    lore: 'It has read every battle ever fought. It knows your next move before you do.',
    realm: 'academia',
    hp: 8400,
    attack: 530,
    defence: 210,
    attackIntervalMs: 2100,
    skillIntervalMs: 8500,
    goldReward: 380,
    icon: '📜',
  },
  Sage: {
    tier: 'Sage',
    name: 'Mirethis the Undying',
    lore: 'She has died a hundred times. Each death made her stronger.',
    realm: 'medicine',
    hp: 10200,
    attack: 630,
    defence: 250,
    attackIntervalMs: 2000,
    skillIntervalMs: 8000,
    goldReward: 470,
    icon: '💀',
  },
  Arcanist: {
    tier: 'Arcanist',
    name: 'The Blind Judge',
    lore: 'Justice without mercy. It weighs every soul and finds them wanting.',
    realm: 'law',
    hp: 12200,
    attack: 740,
    defence: 295,
    attackIntervalMs: 1900,
    skillIntervalMs: 7500,
    goldReward: 570,
    icon: '⚖️',
  },
  Exemplar: {
    tier: 'Exemplar',
    name: 'Vorath the Creator',
    lore: 'An artist who sculpts with suffering. Every move is deliberate. Every strike, art.',
    realm: 'creative',
    hp: 14600,
    attack: 860,
    defence: 345,
    attackIntervalMs: 1800,
    skillIntervalMs: 7000,
    goldReward: 680,
    icon: '🎨',
  },
  Vanguard: {
    tier: 'Vanguard',
    name: 'The Iron Chancellor',
    lore: 'It has governed this realm for centuries. Challengers are just another petition — denied.',
    realm: 'law',
    hp: 17400,
    attack: 990,
    defence: 400,
    attackIntervalMs: 1700,
    skillIntervalMs: 6500,
    goldReward: 800,
    icon: '🏛️',
  },
  Master: {
    tier: 'Master',
    name: 'Nexus Prime',
    lore: 'An artificial mind that has solved combat as a mathematical problem. The answer is you dying.',
    realm: 'tech',
    hp: 20600,
    attack: 1140,
    defence: 460,
    attackIntervalMs: 1600,
    skillIntervalMs: 6000,
    goldReward: 940,
    icon: '🔮',
  },
  Grandmaster: {
    tier: 'Grandmaster',
    name: 'The Hollow Oracle',
    lore: 'It speaks in futures. All of them end the same way for you.',
    realm: 'academia',
    hp: 24200,
    attack: 1310,
    defence: 530,
    attackIntervalMs: 1500,
    skillIntervalMs: 5500,
    goldReward: 1100,
    icon: '🌀',
  },
  Champion: {
    tier: 'Champion',
    name: 'Seraph of Ruin',
    lore: 'It was worshipped once. The prayers stopped. It did not take that well.',
    realm: 'creative',
    hp: 28400,
    attack: 1500,
    defence: 610,
    attackIntervalMs: 1400,
    skillIntervalMs: 5000,
    goldReward: 1280,
    icon: '👼',
  },
  Paragon: {
    tier: 'Paragon',
    name: 'The Last Tyrant',
    lore: 'Every civilisation that rose eventually sent their best to face it. Every civilisation fell.',
    realm: 'law',
    hp: 33200,
    attack: 1720,
    defence: 700,
    attackIntervalMs: 1300,
    skillIntervalMs: 4500,
    goldReward: 1480,
    icon: '👑',
  },
  Legend: {
    tier: 'Legend',
    name: 'The Eternal Arcanist',
    lore: 'It predates the tiers. It predates the world. It is waiting for someone worthy. It is still waiting.',
    realm: 'academia',
    hp: 40000,
    attack: 2000,
    defence: 800,
    attackIntervalMs: 1200,
    skillIntervalMs: 4000,
    goldReward: 1800,
    icon: '🌑',
  },
}

// ── Boss special attacks — one per realm ─────────────────────────────────────
// These are the boss equivalents of player realm skills.
// They hit harder and have wider effects than player skills.

export interface BossSkillEffect {
  type: 'damage' | 'defence_debuff' | 'attack_debuff' | 'dot' | 'aoe_damage'
  multiplier?: number       // damage multiplier (on top of boss attack)
  defenceDebuff?: number    // fraction to reduce defence by (e.g. 0.3 = -30%)
  attackDebuff?: number     // fraction to reduce attack by (e.g. 0.25 = -25%)
  debuffDuration?: number   // ms
  targetsAll?: boolean      // hits all players instead of one
  dotTicks?: number         // damage over time ticks
  dotIntervalMs?: number
}

export const BOSS_SKILLS: Record<string, { name: string; icon: string; effect: BossSkillEffect }> = {
  academia: {
    name: 'Countermeasure',
    icon: '📖',
    effect: {
      type: 'defence_debuff',
      defenceDebuff: 0.30,        // -30% defence on all players
      debuffDuration: 5000,
      targetsAll: true,
    },
  },
  tech: {
    name: 'System Overload',
    icon: '💻',
    effect: {
      type: 'aoe_damage',
      multiplier: 1.4,             // 1.4× boss attack to ALL players
      targetsAll: true,
    },
  },
  medicine: {
    name: 'Necrotic Touch',
    icon: '☠️',
    effect: {
      type: 'dot',
      multiplier: 0.15,            // 15% of boss attack per tick
      dotTicks: 5,
      dotIntervalMs: 1000,
      targetsAll: false,           // targets the highest-attack player
    },
  },
  creative: {
    name: 'Viral Despair',
    icon: '🎭',
    effect: {
      type: 'attack_debuff',
      attackDebuff: 0.25,          // -25% attack on all players
      debuffDuration: 6000,
      targetsAll: true,
    },
  },
  law: {
    name: 'Absolute Verdict',
    icon: '🔨',
    effect: {
      type: 'damage',
      multiplier: 2.2,             // 2.2× boss attack, single target
      targetsAll: false,           // targets lowest HP player
    },
  },
}

// ── AI targeting logic ───────────────────────────────────────────────────────

export interface PlayerSnapshot {
  userId: string
  currentHp: number
  maxHp: number
  attack: number
  isBracing: boolean
  isDead: boolean
}

// Pick the normal attack target:
// 1. Skip dead players
// 2. Skip bracing players if there's a non-bracing alternative
// 3. Focus below 30% HP players (finish them off)
// 4. Otherwise rotate (highest attack = most dangerous)
export function pickAttackTarget(players: PlayerSnapshot[], lastTargetIndex: number): number {
  const alive = players.filter(p => !p.isDead)
  if (alive.length === 0) return 0

  // Focus low HP first
  const lowHp = alive.filter(p => p.currentHp / p.maxHp < 0.30 && !p.isBracing)
  if (lowHp.length > 0) {
    // Pick the one closest to death
    lowHp.sort((a, b) => a.currentHp - b.currentHp)
    return players.indexOf(lowHp[0])
  }

  // Avoid bracing if possible
  const nonBracing = alive.filter(p => !p.isBracing)
  const pool = nonBracing.length > 0 ? nonBracing : alive

  // Rotate through pool — pick next after last target
  const lastInPool = pool.findIndex(p => players.indexOf(p) > lastTargetIndex)
  const next = lastInPool >= 0 ? lastInPool : 0
  return players.indexOf(pool[next])
}

// Pick the skill target:
// - targetsAll → returns all alive player indices
// - 'damage' / 'dot' → target the highest attack player (biggest threat)
// - default → target the lowest HP player
export function pickSkillTargets(players: PlayerSnapshot[], effect: BossSkillEffect): number[] {
  const alive = players.map((p, i) => ({ ...p, i })).filter(p => !p.isDead)
  if (alive.length === 0) return []

  if (effect.targetsAll) return alive.map(p => p.i)

  if (effect.type === 'damage' || effect.type === 'dot') {
    // Target highest attack (most threatening)
    alive.sort((a, b) => b.attack - a.attack)
    return [alive[0].i]
  }

  // Default: lowest HP
  alive.sort((a, b) => a.currentHp - b.currentHp)
  return [alive[0].i]
}

// Initial boss state
export function initBossState(): BossState {
  return {
    currentHp: 0,       // will be set from boss.hp on battle start
    lastAttackAt: 0,
    lastSkillAt: 0,
    attackTargetIndex: 0,
  }
}
