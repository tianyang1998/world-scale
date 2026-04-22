---
status: reverse-documented
source: web/lib/boss.ts, .superpowers/specs/2026-04-10-boss-buff-design.md
date: 2026-04-21
verified-by: tliu603
---

# Boss / PvE System

> Reverse-engineered from existing implementation. Boss stats reflect the
> buffed values from the 2026-04-10 balance pass (linear tier-scaling multipliers).

## 1. Overview

Players cooperate in real-time raids against one of 15 static bosses — one per
tier. Each boss has fixed stats, a timed normal attack, and a timed special attack
derived from its realm. The raid ends when the boss reaches 0 HP (victory) or all
players are dead (defeat). Gold is distributed to surviving players on victory.

## 2. Player Fantasy

Cooperative power fantasy — even strangers in the same tier can gang up on a
brutal boss. Higher-tier bosses feel overwhelming until a coordinated group chips
them down. The boss actively punishes passivity and rewards reading its attack
cadence. Legend boss requires a full coordinated 3-player party; solo is a
near-guaranteed wipe.

## 3. Detailed Rules

### 3.1 Boss Roster (15 bosses, one per tier)

Stats follow a linear multiplier curve: `base + (max - base) × (i / 14)` where
`i` is tier index 0–14. Multiplier endpoints: HP ×1.30→×2.50, ATK ×1.20→×2.00,
DEF ×1.15→×1.80, Gold ×1.30→×2.50. All values baked in (not computed at runtime).

| Tier | Boss Name | Realm | HP | Attack | Defence | Atk Interval | Skill Interval | Gold Reward |
|---|---|---|---|---|---|---|---|---|
| Apprentice | The Hollow Golem | tech | 3,120 | 220 | 70 | 3000 ms | 12,000 ms | 100 |
| Initiate | Sable Witch | academia | 4,430 | 290 | 100 | 2800 ms | 11,000 ms | 170 |
| Acolyte | Iron Sentinel | law | 6,180 | 380 | 140 | 2600 ms | 10,000 ms | 250 |
| Journeyman | The Pale Surgeon | medicine | 8,410 | 490 | 180 | 2400 ms | 9,500 ms | 360 |
| Adept | Stormcaller Vex | tech | 11,170 | 630 | 230 | 2200 ms | 9,000 ms | 490 |
| Scholar | The Archivist | academia | 14,520 | 790 | 290 | 2100 ms | 8,500 ms | 660 |
| Sage | Mirethis the Undying | medicine | 18,510 | 970 | 360 | 2000 ms | 8,000 ms | 850 |
| Arcanist | The Blind Judge | law | 23,180 | 1,180 | 440 | 1900 ms | 7,500 ms | 1,080 |
| Exemplar | Vorath the Creator | creative | 28,990 | 1,430 | 520 | 1800 ms | 7,000 ms | 1,350 |
| Vanguard | The Iron Chancellor | law | 36,040 | 1,700 | 630 | 1700 ms | 6,500 ms | 1,660 |
| Master | Nexus Prime | tech | 44,440 | 2,020 | 740 | 1600 ms | 6,000 ms | 2,030 |
| Grandmaster | The Hollow Oracle | academia | 54,280 | 2,400 | 880 | 1500 ms | 5,500 ms | 2,470 |
| Champion | Seraph of Ruin | creative | 66,130 | 2,830 | 1,040 | 1400 ms | 5,000 ms | 2,980 |
| Paragon | The Last Tyrant | law | 80,150 | 3,340 | 1,230 | 1300 ms | 4,500 ms | 3,570 |
| Legend | The Eternal Arcanist | academia | 100,000 | 4,000 | 1,440 | 1200 ms | 4,000 ms | 4,500 |

### 3.2 Boss Special Attacks (one per realm)

| Realm | Skill Name | Effect | Target |
|---|---|---|---|
| academia | Countermeasure 📖 | −30% defence on all players for 5 s | All alive |
| tech | System Overload 💻 | 1.4× boss attack AoE damage to all players | All alive |
| medicine | Necrotic Touch ☠️ | DoT: 15% boss attack × 5 ticks at 1 s intervals | Highest-attack player |
| creative | Viral Despair 🎭 | −25% attack on all players for 6 s | All alive |
| law | Absolute Verdict 🔨 | 2.2× boss attack, single hit | Lowest-HP player |

### 3.3 Boss AI — Normal Attack Targeting

Priority order each attack cycle:
1. Skip dead players.
2. Focus any alive player below 30% HP (pick lowest HP among them), ignoring brace status.
3. If no low-HP target: prefer non-bracing players. If all players are bracing, include them.
4. Among the eligible pool, rotate by index past the last target (round-robin).

### 3.4 Boss AI — Skill Targeting

- `targetsAll` → hits every alive player simultaneously.
- `damage` or `dot` type → hits the alive player with the **highest attack** (most threatening).
- All other types → hits the alive player with the **lowest current HP**.

### 3.5 Medicine Player — Ally Healing

In PvE, Clinical Mastery works differently from PvP. Instead of healing the
caster, it heals a **selected ally** (or the caster if no target is chosen).

**Mechanic:**
- Click any teammate's HP bar to set them as the heal target.
- On using Clinical Mastery, the heal travels to that target as a visual pulse.
- If no target is selected, the heal defaults to self.
- Heal amount: `round(caster.maxHp × 0.20)` — based on the **caster's** max HP, not the target's.
- Capped at the target's max HP (no overheal).
- After healing, the selected target is cleared (each cast requires re-selection).
- The heal is broadcast to all party members so HP bars sync for everyone.

This makes medicine players the irreplaceable support role in raids — broadcast
upgrades are designed to help parties find a medicine player rather than replace one.

### 3.6 Raid Flow

1. Players in the same tier join a raid lobby via the broadcast system.
2. Boss HP initialised to `boss.hp`; attack and skill timers set to `now`.
3. Each tick: check elapsed time against `attackIntervalMs` / `skillIntervalMs`; fire when threshold crossed.
4. Players act freely between boss attacks (attack, brace, use realm skill).
5. A player reaching 0 HP is marked dead; they can no longer act or be targeted by normal attacks.
6. **Victory**: boss HP ≤ 0 — all **alive** players receive `goldReward` each.
7. **Defeat**: all players dead — no gold awarded.

### 3.6 Broadcast System (Raid Discovery)

When a player starts a boss battle, they broadcast an invite to other players.
Wider broadcasts cost gold but attract more allies.

| Tier | Cost | Reach |
|---|---|---|
| Basic | Free | Players in your current map tier only |
| Extended | 100 gold | Your tier ± 1 tier |
| Global | 300 gold | All players across all tiers |

Cost is deducted when entering the lobby. No refund if the battle fills before
the broadcast window closes.

## 4. Formulas

### Normal attack damage to a player
```
effectiveDefence = player.defence × (1 − defenceDebuffFraction)   // 1.0 if no debuff
dmg = max(1, boss.attack − effectiveDefence)
```
*(The web implementation uses direct subtraction, not the percentile formula used
in PvP. Verify during porting.)*

### Skill damage (multiplier-based)
```
dmg = max(1, boss.attack × multiplier − player.effectiveDefence)
```

### DoT (Necrotic Touch — medicine)
```
perTick = max(1, boss.attack × 0.15)
applied 5 times, once per 1000 ms
```

### Attack debuff (Viral Despair — creative)
```
player.effectiveAttack = player.attack × (1 − 0.25)   // lasts 6000 ms
```

### Defence debuff (Countermeasure — academia)
```
player.effectiveDefence = player.defence × (1 − 0.30)   // lasts 5000 ms
```

### Legend boss feel (design reference)
A Legend player (~11,200 power) split evenly: ~3,730 HP / ~3,920 ATK / ~3,550 DEF.
- Boss hits player: `4000 − 3550 ≈ 450 damage` every 1,200 ms
- Player hits boss: meaningful chunk per strike across a 3-player party (~130 strikes total to kill)
- AoE System Overload (if tech boss): `4000 × 1.4 = 5600` hits all players every 4,000 ms — wipes uncoordinated parties.

## 5. Edge Cases

- **All players brace simultaneously**: Boss still picks a target from the bracing pool — no immune turn.
- **Boss skill fires with all players dead**: `pickSkillTargets` returns `[]`; effect is skipped.
- **Solo raid**: Works as-is; boss rotates on the single player.
- **Player dies mid-DoT**: Remaining ticks are skipped (target `isDead`).
- **Simultaneous kill**: Boss HP drops to 0 on the same tick the last player dies → victory takes precedence.
- **Broadcast tier insufficient funds**: Server rejects the upgrade; battle starts at Basic reach.

## 6. Dependencies

- **Scoring System** (`scoring-system.md`) — player stats (HP, attack, defence) that feed into raid combat.
- **Battle System** (`battle-system.md`) — shared damage formula pattern; debuff mechanics mirror PvP debuffs.
- **Economy System** (`economy-system.md`) — `goldReward` deposited to alive players on victory; broadcast cost deducted on entry.
- **Networking System** (`networking-system.md`) — raid lobby, player state sync, boss state broadcast.
- **Map System** (`map-system.md`) — boss portal/lair entry point on the world map.

## 7. Tuning Knobs

| Knob | Notes |
|---|---|
| Boss HP, attack, defence | Scale together per tier — don't adjust one in isolation |
| `attackIntervalMs` | Lower = harder; Legend floor is 1200 ms |
| `skillIntervalMs` | Lower = harder; Legend floor is 4000 ms |
| `goldReward` | Should feel rewarding relative to PvP gold stakes |
| DoT multiplier (0.15) | Adjust if Necrotic Touch is trivial or lethal |
| AoE multiplier (1.4) | Tune for group size — hurts more with fewer players |
| Defence/attack debuff durations | Currently 5–6 s; increase for harder content |
| Low-HP threshold (30%) | Raise to make boss a more punishing finisher |
| Broadcast costs (100 / 300) | Adjust based on typical player gold accumulation |

## 8. Acceptance Criteria

- [ ] All 15 bosses load with correct stats matching the table in §3.1.
- [ ] Boss fires normal attack on its `attackIntervalMs` cadence; correct target per AI rules (§3.3).
- [ ] Boss fires skill on its `skillIntervalMs` cadence; correct realm skill applied (§3.2).
- [ ] AoE skills hit all alive players; single-target skills hit the priority target.
- [ ] Necrotic Touch applies 5 ticks at 1 s intervals; stops if target dies mid-sequence.
- [ ] Debuffs expire after their stated duration; stats return to base exactly.
- [ ] Gold distributes only to alive players on boss death.
- [ ] Raid ends immediately when all players reach 0 HP.
- [ ] Bracing player is deprioritised for normal attacks when non-bracing alternatives exist.
- [ ] Broadcast cost is deducted before entering the lobby; Basic (free) requires no deduction.
- [ ] Victory triggers even if boss HP drops to 0 on the same tick the last player dies.
