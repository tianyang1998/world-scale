---
status: reverse-documented
source: web/lib/battle.ts, web/lib/types.ts
date: 2026-04-21
verified-by: tliu603
---

# Battle System

> Reverse-engineered from existing implementation, with stat allocation mechanic
> clarified and confirmed by designer.

## 1. Overview

The Battle System governs PvP combat between two players. Each player acts
independently by clicking skill buttons — there are no enforced turns. Both players
can act simultaneously. A battle ends when one player's HP reaches zero. The loser
transfers gold to the winner.

## 2. Player Fantasy

The player feels like a duelist — timing their realm skill, choosing when to brace
against an incoming strike, and pressing their advantage when the opponent is
debuffed. Battles are short and punchy (seconds to minutes), not drawn-out wars
of attrition. Before each battle, players make a meaningful strategic choice about
how to allocate their power — going glass cannon, tank, or balanced.

## 3. Detailed Rules

### 3.1 Character Stats in Battle

Before each battle, a reallocation popup lets the player distribute their total
power across three stats:

| Battle Stat | Minimum | Description |
|-------------|---------|-------------|
| HP | 10% of power | Maximum health |
| Attack | 10% of power | Damage output |
| Defence | 10% of power | Damage reduction |

**Rules:**
- HP + Attack + Defence = power (exactly)
- Each stat ≥ floor(power × 0.10)
- Stats are used raw in all formulas — no additional scaling
- Reallocation is available before every battle via a popup

**Example** (power = 5000):
- Minimum per stat: 500
- Free to allocate: 2000 remaining after minimums
- Valid: HP=2000, Attack=2000, Defence=1000 ✓
- Invalid: HP=400, Attack=4100, Defence=500 ✗ (HP below minimum)

### 3.2 Available Actions

Players have three actions available at all times:

| Action | Icon | Effect | Cooldown |
|--------|------|--------|----------|
| Strike | ⚔️ | Deal 1.0× attack damage to opponent | None |
| Brace | 🛡️ | Reduce incoming damage by 30% for 1 second | None |
| Realm Skill | varies | Realm-specific effect (see Section 3.4) | 3–4 seconds |

Strike and Brace have no cooldown — players can use them as fast as they can click.
The realm skill has a per-realm cooldown tracked by timestamp.

### 3.3 Damage Formula

```
effectiveDefence = defenderDefence × defenceDebuffMultiplier
raw = attackerAttack × skillMultiplier × (100 / (100 + effectiveDefence))
reduction = isBracing ? 0.70 : 1.0
final = max(1, round(raw × reduction))
```

Key properties:
- Defence never fully blocks damage — high defence reduces but never zeroes it
- Bracing applies a 30% reduction on top of the defence calculation
- Minimum 1 damage always lands
- Debuffs modify effective attack or effective defence before the formula runs

### 3.4 Realm Skills

One skill per realm, unlocked automatically at character creation:

| Realm | Skill | Effect | Cooldown |
|-------|-------|--------|----------|
| Academia | Deep Research | Opponent defence ×0.75 for 2s | 4s |
| Tech | Commit Storm | Deal 1.8× attack damage | 4s |
| Medicine | Clinical Mastery | Heal self for 20% of max HP *(PvP only — in PvE, heals a selected ally; see boss-pve-system.md §3.5)* | 4s |
| Creative | Viral Work | Deal 1.2× damage + 30% stun chance for 1s | 3s |
| Law | Precedent | Opponent attack ×0.80 for 3s | 4s |

Cooldown is tracked as a timestamp — the skill button is unavailable until
`now - lastUsed >= cooldownMs`.

### 3.5 Debuff System

Two debuff slots exist per player, tracked independently:

| Debuff | Multiplier | Applied By | Duration |
|--------|-----------|-----------|---------|
| Defence debuff | ×0.75 (−25%) | Academia: Deep Research | 2s |
| Attack debuff | ×0.80 (−20%) | Law: Precedent | 3s |

Debuffs are stored as `{ multiplier, expiresAt }`. On each damage calculation,
expired debuffs are treated as multiplier = 1.0 (no effect).

Debuffs do not stack — applying the same debuff again resets the timer.

### 3.6 Stun

Creative's Viral Work has a 30% chance to stun the opponent for 1 second.
While stunned, the player cannot act. Stun is tracked as a boolean + expiry
timestamp, same pattern as debuffs.

### 3.7 Battle End Conditions

- A player's HP reaches 0 → that player loses
- No time limit — battles end only by HP depletion

### 3.8 Gold Transfer on Loss

```
goldTransfer = max(50, min(500, floor(loserGold × 0.10)))
special case: if loserGold < 50 → transfer = loserGold (lose all)
```

10% of the loser's gold (capped at 500, minimum 50) goes to the winner.
Additionally, the winner earns a realm power bonus:
```
realmBonus = floor(winnerRealmPower × 0.10)
```

### 3.9 Starting Gold

Players begin with 500 gold on account creation.

## 4. Formulas

```
// Stat allocation constraints
minimum = floor(power × 0.10)
HP + Attack + Defence = power
HP >= minimum, Attack >= minimum, Defence >= minimum

// Damage
effectiveDefence = Defence × defenceDebuffMultiplier   // 1.0 if no debuff
raw = Attack × skillMultiplier × (100 / (100 + effectiveDefence))
final = max(1, round(raw × (isBracing ? 0.70 : 1.0)))

// Gold transfer on loss
transfer = max(50, min(500, floor(loserGold × 0.10)))
realmBonus = floor(winnerRealmPower × 0.10)
```

## 5. Edge Cases

- **Both players act simultaneously**: Both damage calculations resolve
  independently — no priority ordering needed
- **Bracing when stunned**: Stun prevents all actions including Brace;
  stun takes precedence
- **Realm skill used while debuff is already active**: Resets the debuff
  timer, does not stack the multiplier
- **Loser has less than 50 gold**: Transfer = all remaining gold (not floored
  at 50 in this case)
- **Heal exceeds max HP**: Clinical Mastery heal is capped at max HP
- **Stun lands on a player mid-action**: The action already submitted resolves;
  stun applies to subsequent actions
- **Player skips reallocation popup**: Previous allocation is used as-is

## 6. Dependencies

- **Scoring System** — provides power and realm for stat allocation and skill
  assignment
- **Projectile System** — triggered on each action to display the visual hit
- **Economy System** — gold transfer and realm bonus applied on battle end
- **Networking** — battle state (HP, debuffs, actions) is server-authoritative
  via Supabase; the local client sends actions and receives state updates

## 7. Tuning Knobs

| Parameter | Current Value | Effect of Increasing |
|-----------|--------------|---------------------|
| Stat minimum % | 10% of power | Higher = less build diversity |
| Brace reduction | 30% | Higher = defence more rewarding |
| Defence formula denominator base | 100 | Higher = defence less effective |
| Gold transfer % | 10% | Higher = more punishing losses |
| Gold transfer cap | 500 | Higher = rich players risk more |
| Realm skill cooldowns | 3–4s | Higher = skills less spammable |

## 8. Acceptance Criteria

- [ ] Reallocation popup appears before every battle
- [ ] Stat inputs enforce minimum of floor(power × 0.10) per stat
- [ ] Stat inputs enforce HP + Attack + Defence = power exactly
- [ ] Two players with identical stats deal identical damage per strike
- [ ] A bracing player takes 30% less damage than a non-bracing player
  under identical attack
- [ ] Defence debuff (Deep Research) causes opponent to take more damage
  for exactly 2 seconds, then returns to normal
- [ ] Attack debuff (Precedent) causes attacker to deal less damage
  for exactly 3 seconds, then returns to normal
- [ ] Commit Storm deals exactly 1.8× normal strike damage
- [ ] Clinical Mastery restores exactly 20% of max HP, capped at max HP
- [ ] Viral Work stun prevents opponent from acting for 1 second
- [ ] Gold transfer on loss is exactly 10% of loser's gold, floored at 50,
  capped at 500
- [ ] A player with less than 50 gold loses all their gold, not 50
- [ ] Realm skill button is unclickable during cooldown period
