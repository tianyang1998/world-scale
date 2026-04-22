---
status: reverse-documented
source: web/lib/economy.ts, web/lib/battle.ts, .superpowers/specs/2026-04-05-economy-system-design.md
date: 2026-04-22
verified-by: tliu603
---

# Economy System

> Reverse-engineered from existing implementation and approved design spec.

## 1. Overview

The Economy System governs all gold flow: how players earn it, how they lose
it, and how they spend it. Gold is the only currency. All spending happens in
the world/meta layer — money never touches the inside of battles. No consumable
gives a combat advantage; medicine remains the sole source of in-battle healing.

## 2. Player Fantasy

Gold accumulates as evidence of achievement — winning fights, surviving raids.
Spending it on insurance before a risky PvP match or buying a broadcast to find
better raid teammates feels like a strategic decision, not a grind tax. Cosmetics
let players display their identity and accomplishments without paying for power.

## 3. Detailed Rules

### 3.1 Gold Flow — Earning

| Event | Gold Change | Notes |
|---|---|---|
| Account creation | +500 | One-time signup bonus |
| Boss raid win (solo) | +200 | Full reward, no split |
| Boss raid win (team) | +150 per surviving player | Per-boss `goldReward` from boss table; only alive players receive it |
| PvP win | Steal 10% of loser's gold | Min 50, max 500; see §3.2 |

> **Note:** The boss `goldReward` column in `boss.ts` defines the per-player
> payout for team raids. The values above (200 solo / 150 team) are from the
> design spec; verify against current boss table values during porting.

### 3.2 Gold Flow — PvP Loss

```
transfer = max(50, min(500, floor(loserGold × 0.10)))
special case: if loserGold < 50 → transfer = loserGold (lose all, floor does not apply)
```

- Gold cannot go below 0.
- The winner receives the full `transfer` amount.
- If the loser has active insurance, a refund is calculated separately (§3.4)
  and reduces their net loss — the winner still receives the full transfer.

### 3.3 Broadcast Upgrades (PvE Money Sink)

Selected on the PvE prep screen before entering a boss raid. Widens the pool
of players who receive the raid invite.

| ID | Name | Cost | Reach |
|---|---|---|---|
| `basic` | Basic | 0 gold (free) | Your current map tier only |
| `extended` | Extended | 100 gold | Your tier ± 1 tier |
| `global` | Global | 300 gold | All players across all tiers |

Rules:
- Cost deducted at raid entry, not at lobby creation.
- One-time per battle session — cannot change tier after entry.
- No refund if the battle fills before others join.
- Wider broadcasts increase the chance of finding a medicine player for healing.

### 3.4 Battle Insurance (PvP Money Sink)

Purchased from the PvP prep screen before queuing. Protects against gold loss
on a PvP defeat.

| ID | Name | Premium Cost | Refund on Loss |
|---|---|---|---|
| `none` | None | 0 gold | No protection |
| `bronze` | Bronze | 30 gold | 25% of gold lost refunded |
| `silver` | Silver | 60 gold | 50% of gold lost refunded |
| `gold` | Gold | 100 gold | 75% of gold lost refunded |

**Refund formula:**
```
refund = floor(goldLost × refundPercent)
loserNetLoss = goldLost − refund
```
The winner always receives the full `goldLost` amount. The refund is paid
back to the loser separately — it does not reduce the winner's gain.

**Rules:**
- Premium is deducted immediately on purchase, win or lose.
- Policy is consumed after any match result (win or loss) — one use only.
- Cannot stack multiple tiers on the same match.
- Cannot be purchased after a match has started.
- Winner's insurance (if any) is also consumed but provides no benefit.

**Example** (loser would normally lose 200 gold):
| Insurance | Premium paid | Refund | Net loss |
|---|---|---|---|
| None | 0 | 0 | −200 |
| Bronze | 30 | 50 | −180 (30 premium + 150 net loss) |
| Silver | 60 | 100 | −160 (60 premium + 100 net loss) |
| Gold | 100 | 150 | −150 (100 premium + 50 net loss) |

### 3.5 Cosmetics (Permanent Money Sink)

Purchased from the in-game store (accessed via the store building on the world
map). Pure aesthetics — no gameplay effect.

#### Titles (displayed under character name)

| ID | Name | Cost | Display Value |
|---|---|---|---|
| `title_boss_slayer` | Boss Slayer | 150 gold | "Boss Slayer" |
| `title_the_unyielding` | The Unyielding | 200 gold | "The Unyielding" |
| `title_realm_champion` | Realm Champion | 350 gold | "Realm Champion" |
| `title_gold_hoarder` | Gold Hoarder | 500 gold | "Gold Hoarder" |

#### Profile Borders (decorative frame on character card)

| ID | Name | Cost | Realm |
|---|---|---|---|
| `border_academia` | Scholar's Frame | 300 gold | academia |
| `border_tech` | Circuit Frame | 300 gold | tech |
| `border_medicine` | Healer's Frame | 300 gold | medicine |
| `border_creative` | Artist's Frame | 300 gold | creative |
| `border_law` | Justice Frame | 300 gold | law |
| `border_gilded` | Gilded Frame | 800 gold | (universal) |

**Rules:**
- Purchase is permanent — cosmetics are added to `owned_cosmetics` and never expire.
- Already-owned items can be equipped/unequipped at no cost.
- Purchasing auto-equips the item unless explicitly opted out.
- One title and one border can be equipped simultaneously.
- Visible to other players on the leaderboard, in battle, and on the profile page.

### 3.6 Database Schema (relevant columns)

All gold and cosmetic state lives on the `characters` table:

| Column | Type | Description |
|---|---|---|
| `gold` | integer | Current gold balance |
| `active_insurance` | text \| null | Active insurance ID (`bronze`/`silver`/`gold`), cleared after match |
| `owned_cosmetics` | text[] | Array of owned cosmetic IDs |
| `equipped_title` | text \| null | Currently equipped title cosmetic ID |
| `equipped_border` | text \| null | Currently equipped border cosmetic ID |

Additional columns on battle tables:

| Table | Column | Description |
|---|---|---|
| `battles` | `insurance_refund` | Refund amount applied on this PvP result |
| `pve_battles` | `broadcast_tier` | Broadcast tier selected for this raid |

## 4. Formulas

```
// PvP gold transfer
if loserGold < 50:
    transfer = loserGold                          // lose everything
else:
    transfer = max(50, min(500, floor(loserGold × 0.10)))

// Insurance refund
refund = floor(transfer × refundPercent)
loserNetLoss = transfer − refund
// winner receives: transfer (not affected by loser's insurance)
// loser receives back: refund

// Net cost of insurance (break-even analysis)
// Bronze (30g premium): profitable if goldLost > 120  (25% of 120 = 30 = premium)
// Silver (60g premium): profitable if goldLost > 120  (50% of 120 = 60 = premium)
// Gold  (100g premium): profitable if goldLost > 133  (75% of 133 ≈ 100 = premium)
// At max transfer (500g): Gold insurance saves 375g − 100g premium = 275g net
```

## 5. Edge Cases

- **Gold below 50 before PvP loss**: Transfer = all remaining gold; no floor
  applied. Balance goes to 0, not negative.
- **Insurance purchased, then player wins**: Premium already spent; no refund
  of premium on win. Insurance is consumed regardless.
- **Raid wipe (all players die)**: No `goldReward` distributed; broadcast cost
  already spent and not refunded.
- **Purchasing an already-owned cosmetic**: No charge; equip action applied if
  requested.
- **Equipping a cosmetic not owned**: Rejected server-side.
- **Two PvP matches resolve simultaneously for the same player**: Gold
  transactions must be atomic (database-level) to prevent race conditions.
- **Balance goes negative from a bug**: `max(0, ...)` guard on all deductions.

## 6. Design Rationale — Why This Preserves Realm Balance

- **Broadcast upgrades** help parties find medicine healers — they increase
  the incentive to team with medicine players rather than replacing them.
- **Battle insurance** is purely financial — no heals, no stat changes, no
  effect inside combat.
- **Cosmetics** are zero gameplay impact by definition.
- No consumable heals, damage boosters, or stat items exist. Medicine is the
  exclusive source of in-battle healing in both PvP and PvE.

## 7. Dependencies

- **Battle System** (`battle-system.md`) — PvP gold transfer on match end;
  insurance refund applied post-match.
- **Boss/PvE System** (`boss-pve-system.md`) — boss `goldReward` paid to
  surviving players; broadcast cost deducted on raid entry.
- **Map System** (`map-system.md`) — store building on world map is the
  entry point for cosmetic purchases.
- **Networking System** (`networking-system.md`) — gold updates must be
  server-authoritative; client cannot self-report gold changes.

## 8. Tuning Knobs

| Knob | Current Value | Notes |
|---|---|---|
| Signup bonus | 500 gold | Sets floor for new player experience |
| PvP transfer % | 10% | Higher = more punishing losses |
| PvP transfer min | 50 gold | Protects new players |
| PvP transfer max | 500 gold | Limits farming of rich players |
| Insurance premiums | 30 / 60 / 100 | Should feel like a meaningful bet, not trivial |
| Insurance refund % | 25 / 50 / 75% | Higher tiers should clearly dominate at high stakes |
| Broadcast costs | 0 / 100 / 300 | Tune based on typical gold accumulation rate |
| Title costs | 150–500 | Cheap titles for casual players; expensive for status seekers |
| Border costs | 300 / 800 | Gilded Frame at 800 as aspirational top-tier item |

## 9. Acceptance Criteria

- [ ] New accounts start with 500 gold.
- [ ] PvP winner receives `max(50, min(500, floor(loserGold × 0.10)))` gold.
- [ ] A loser with less than 50 gold loses all remaining gold, not a floored 50.
- [ ] Gold balance never goes below 0.
- [ ] Insurance premium is deducted immediately on purchase.
- [ ] Insurance refund is applied to the loser after a PvP loss; winner's gain is unaffected.
- [ ] Insurance policy is cleared after any match result (win or loss).
- [ ] Cannot purchase a second insurance policy while one is active.
- [ ] Broadcast cost (100 or 300 gold) is deducted on raid entry; Basic is free.
- [ ] Cosmetic purchase deducts the correct gold amount and adds the item to `owned_cosmetics`.
- [ ] Already-owned cosmetic can be equipped at no cost.
- [ ] Equipped title appears under the player's name on profile, leaderboard, and in battle.
- [ ] Equipped border changes the character card frame color on profile and leaderboard.
- [ ] Gold transactions are atomic — no partial updates on PvP match end.
