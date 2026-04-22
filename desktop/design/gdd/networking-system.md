---
status: reverse-documented
source: web/app/map/page.tsx, web/app/battle/[id]/page.tsx, web/app/pve/[id]/page.tsx,
        web/app/api/battle/*, web/app/api/pve/*
date: 2026-04-22
verified-by: tliu603
---

# Networking System

> Reverse-engineered from existing implementation.
> Desktop port uses a **separate Supabase project** from the web version —
> fresh schema, same auth flow, same Realtime + Presence approach.

## 1. Overview

All multiplayer state is managed through Supabase Realtime channels.
The architecture is:

- **Supabase Realtime Presence** — who is online and where (map, battle lobby)
- **Supabase Realtime Broadcast** — ephemeral game events (movement, projectiles, HP sync)
- **Supabase REST API (via server routes)** — authoritative writes (battle creation, gold transfer, boss rewards)

The server is authoritative for all gold and battle outcomes. Clients are
authoritative for their own position and action timing. The desktop port
replicates this architecture via Godot's `HTTPRequest` node (API calls) and
a Supabase Realtime WebSocket client (channels).

## 2. Supabase Project

| Property | Value |
|---|---|
| Project | Desktop-specific — separate from web version |
| Schema | Freshly created; web schema is the reference (not copied) |
| Auth | Same flow as web (email/magic link/OAuth), different project URL |
| Realtime | Supabase Realtime WebSocket — same as web |
| Presence | Supabase Presence (built on Realtime) — same as web |

## 3. Database Schema

### `characters` table

| Column | Type | Description |
|---|---|---|
| `user_id` | uuid (PK, FK → auth.users) | Player identity |
| `name` | text | Display name (2–30 chars, validated) |
| `realms` | jsonb | Per-realm stat breakdown |
| `total_power` | integer | Derived power score |
| `gold` | integer | Current gold balance (default 500) |
| `active_insurance` | text \| null | Active insurance ID; cleared after match |
| `owned_cosmetics` | text[] | Owned cosmetic item IDs |
| `equipped_title` | text \| null | Equipped title cosmetic ID |
| `equipped_border` | text \| null | Equipped border cosmetic ID |
| `updated_at` | timestamptz | Last save timestamp |

### `battles` table (PvP)

| Column | Type | Description |
|---|---|---|
| `id` | uuid (PK) | Battle identifier |
| `player1_id` | uuid (FK → auth.users) | Challenger |
| `player2_id` | uuid (FK → auth.users) | Challenged |
| `winner_id` | uuid \| null | Set on battle end; null until resolved |
| `gold_transferred` | integer | Amount transferred on result |
| `insurance_refund` | integer | Refund applied to loser (default 0) |
| `created_at` | timestamptz | |

### `pve_battles` table (Boss raids)

| Column | Type | Description |
|---|---|---|
| `id` | uuid (PK) | Battle identifier |
| `boss_tier` | text | Tier name of the boss fought |
| `boss_name` | text | Boss display name |
| `player_ids` | uuid[] | All party members |
| `success` | boolean | Whether the boss was defeated |
| `gold_awarded` | integer | Per-player gold reward (0 if failed) |
| `broadcast_tier` | text | Broadcast reach used (`basic`/`extended`/`global`) |
| `created_at` | timestamptz | |

## 4. Realtime Channels

### 4.1 Map Channel — `map:{tier}`

One channel per tier. Players subscribe on entering a tier, unsubscribe on
leaving.

**Presence payload** (tracked by each client on subscribe):
```
{ userId, name, tier, x, y, currentTier }
```

**Presence events:**

| Event | Trigger | Action |
|---|---|---|
| `join` | Another player enters the tier | Add to `playersRef` map; render their blob |
| `leave` | Another player leaves the tier | Remove from `playersRef` map |

**Broadcast events:**

| Event | Direction | Payload | Action |
|---|---|---|---|
| `move` | Client → all | `{ userId, x, y }` | Update remote player's rendered position |
| `challenge` | Client → all | `{ toId, fromId, fromName, battleId }` | Show challenge modal on `toId`'s screen |
| `pve_invite` | Client → all | `{ fromId, fromName, fromTier, battleId, bossName, bossTier }` | Show PvE invite modal to all tier-mates |

**Move broadcast throttle:** position sent at most every 80 ms (only when
the player has moved that frame).

**Channel lifecycle:**
1. Previous channel removed on tier change.
2. New channel created for `map:{newTier}`.
3. `channel.track(presencePayload)` called after `SUBSCRIBED`.

### 4.2 PvP Battle Channel — `battle:{battleId}`

One channel per battle. Both players subscribe after navigating to the battle
page.

**Presence payload** (tracked by each player):
```
{ name, hp, attack, defence, gold, realm, currentHp }
```

**Phase transitions driven by presence:**
- Both players present (`presenceState` has 2 keys) → phase changes from
  `waiting` to `fighting`.
- Opponent leaves during `fighting` → 10-second reconnect timer starts.
  If timer expires, local player wins automatically.

**Broadcast events:**

| Event | Direction | Payload | Action |
|---|---|---|---|
| `move` | Client → opponent | `{ userId, x, y, facing }` | Update opponent's rendered position |
| `hp_sync` | Client → opponent | `{ userId, currentHp }` | Update HP bar for that player |
| `projectile` | Client → opponent | `{ actionType, realm, fromX, fromY, toX, toY, targetId, damage, effect? }` | Spawn incoming projectile + apply effects on arrival |
| `battle_end` | Client → opponent | `{ winnerId }` | Resolve result on opponent's screen without a second API call |

**Action types in `projectile` event:**

| `actionType` | Effect on receiver |
|---|---|
| `strike` | Spawn sword projectile; apply damage on hit |
| `brace` | Mark sender as bracing; apply 30% damage reduction |
| `realm_offensive` | Spawn realm projectile; apply damage on hit |
| `realm_heal` | Spawn heal pulse; apply HP gain on hit (self-only in PvP) |
| `realm_debuff` | Spawn realm projectile; apply debuff (`defence_debuff` or `attack_debuff`) immediately on arrival |

**Winner determination — server-authoritative:**
The loser calls `POST /api/battle/end` reporting their own death. The server
derives the winner as the other participant — the client never reports who won,
only who lost. `battle_end` broadcast is then sent so the opponent's screen
resolves without a second API call.

### 4.3 PvE Battle Channel — `pve:{battleId}`

One channel per raid. Up to 3 players subscribe. Channel persists until all
players leave.

**Presence payload** (tracked by each player on subscribe):
```
{ name, hp, attack, defence, gold, realm }
```

**Leader election:**
- First player to subscribe (`presenceState` is empty before their `track`)
  becomes the **leader**.
- Leader runs all boss AI ticks and broadcasts boss state to non-leaders.
- Any party member can press Start — it broadcasts the `start` event.
- Leadership is not transferable — if the leader disconnects, boss AI stops
  on non-leader clients (current limitation, not yet handled with failover).

**Presence events:**

| Event | Action |
|---|---|
| `join` | Add joining player to party display; read their stats from presence payload |
| `leave` | Mark player as disconnected; remove from active party |

On initial subscribe, the client reads `presenceState()` before and after
`track()` to discover players already in the lobby.

**Broadcast events:**

| Event | Sender | Payload | Receivers | Action |
|---|---|---|---|---|
| `start` | Any player | `{ startTime }` | All | Begin battle phase |
| `move` | Any player | `{ userId, x, y, facing }` | All others | Update that player's position |
| `hp_sync` | Any player | `{ userId, currentHp }` | All | Sync HP bar after damage or heal |
| `boss_move` | Leader only | `{ x, y }` | Non-leaders | Sync boss position |
| `boss_projectile` | Leader only | `{ targetId, damage, fromX, fromY, toX, toY, realm }` | Non-leaders | Spawn boss projectile locally for hit detection |
| `boss_skill` | Leader only | `{ skillType, targetIds, damage?, debuffDuration?, attackDebuff?, defenceDebuff? }` | All | Apply boss special attack effects |
| `player_action` | Any player | `{ type, attackerId, damage?, heal?, healTargetId?, effect? }` | All others | Apply that player's action (strike, heal, debuff) |

**Player action types in `player_action` event:**

| `type` | Effect on receivers |
|---|---|
| `strike` / `realm_offensive` | Apply damage to boss HP |
| `realm_heal` | Apply heal to `healTargetId`; sync their HP |
| `realm_debuff` | Apply `boss_defence_debuff` — reduces boss effective defence for the party |

**Boss hit detection:**
Leader runs hit detection for boss projectiles. Non-leaders spawn the
projectile locally (from `boss_projectile` broadcast) and run their own hit
detection against themselves — if hit, they apply damage locally and broadcast
an `hp_sync`.

## 5. API Endpoints

All endpoints require a valid Supabase auth session cookie. The server never
trusts client-reported winner IDs or gold amounts.

### PvP

| Endpoint | Method | Purpose |
|---|---|---|
| `POST /api/battle/create` | POST | Validate same-tier, create `battles` row, return `battle_id` |
| `POST /api/battle/end` | POST | Loser reports own death; server derives winner, transfers gold, applies insurance refund |
| `GET /api/battle/get-stats` | GET | Fetch battle stats for prep screen |
| `POST /api/battle/save-stats` | POST | Save allocated HP/attack/defence before entering battle |

**`/api/battle/create` key validation:**
- Both players must have characters.
- Both must be in the same tier (`getTier(total_power)` must match).
- Cannot battle yourself.

**`/api/battle/end` key logic:**
- Caller is the loser (reports own death).
- Server sets `winner_id = the other participant` — never from client payload.
- `winner_id` already set → return `already_processed: true` (idempotent).
- Gold transfer: `max(50, min(500, floor(loserGold × 0.10)))`.
- Insurance refund calculated server-side; winner's gain is unaffected.

### PvE

| Endpoint | Method | Purpose |
|---|---|---|
| `POST /api/pve/create` | POST | Derive boss from player's tier, create `pve_battles` row |
| `POST /api/pve/end` | POST | Any participant reports outcome; server awards gold to all `player_ids` |
| `POST /api/pve/broadcast` | POST | Deduct broadcast upgrade cost, update `broadcast_tier` on the battle |
| `GET /api/pve/get-stats` | GET | Fetch battle stats for prep screen |
| `POST /api/pve/save-stats` | POST | Save allocated stats |

**`/api/pve/end` key logic:**
- Any participant (not just leader) can call this.
- Server uses `battle.player_ids` (stored at creation) as the survivor list — never trusts a client-supplied list.
- Gold awarded to every player in `player_ids` if `success = true`.

### Character & Economy

| Endpoint | Method | Purpose |
|---|---|---|
| `POST /api/character/save` | POST | Upsert character stats after scoring; validates name format + profanity + uniqueness |
| `GET /api/character/get` | GET | Fetch character for the authenticated user |
| `POST /api/economy/buy-insurance` | POST | Deduct premium, set `active_insurance` |
| `POST /api/economy/buy-cosmetic` | POST | Deduct cost, append to `owned_cosmetics`, optionally equip |
| `GET /api/leaderboard` | GET | Fetch top players by total_power |
| `POST /api/account/delete` | POST | Delete character and auth user |
| `POST /api/score` | POST | Score a credential submission, return computed stats |

## 6. Desktop Port — Godot Considerations

In the web version, API calls go through Next.js server routes which hold the
Supabase service key. In Godot, there is no server middleware — options:

**Option A (recommended): Keep a thin server layer**
Deploy a minimal serverless backend (e.g. Supabase Edge Functions or a small
Next.js/Express API) that replicates the existing routes. Godot calls these
endpoints via `HTTPRequest`. Keeps gold and winner logic server-authoritative.

**Option B: Use Supabase directly from Godot with RLS**
Call Supabase REST API directly from Godot using the anon key + JWT.
Row-Level Security (RLS) policies enforce that players can only update their
own rows. Gold transfer requires a Supabase database function (RPC) to be
atomic. More complex to secure correctly.

**Realtime / Presence in Godot:**
Use a WebSocket client (Godot's built-in `WebSocketClient` or a GDExtension
Supabase client) to connect to the Supabase Realtime endpoint. Channel
subscription, presence tracking, and broadcast follow the same protocol as
the web version — only the client library differs.

> Architecture decision (Option A vs B) to be made before implementing
> networking in Godot. Record as an ADR when decided.

## 7. Edge Cases

- **Player disconnects mid-PvP**: Opponent's `presence leave` event triggers
  a 10-second countdown. If not reconnected, the present player wins. No API
  call needed — local resolution only.
- **Both players call `battle/end` simultaneously**: `winner_id` check
  (`already_processed`) makes the endpoint idempotent — second call is a no-op.
- **Leader disconnects mid-raid**: Boss AI stops. No automatic failover
  currently implemented — this is a known limitation.
- **Player joins raid after `start`**: They see existing party via presence
  state snapshot on subscribe, but the battle has already started. Join is
  rejected by the UI (battle phase check).
- **Broadcast lost in transit**: Supabase Realtime does not guarantee delivery.
  `hp_sync` events mitigate this — HP is resynced after every damage event,
  not just delta-tracked.
- **Same-tier check bypassed**: Server re-validates tier on `battle/create`.
  Client-side check is UX-only.

## 8. Dependencies

- **All game systems** — networking is the transport layer for every
  multiplayer interaction.
- **Economy System** (`economy-system.md`) — gold transfer and insurance
  applied server-side in `battle/end` and `pve/end`.
- **Boss/PvE System** (`boss-pve-system.md`) — boss tier derived server-side
  in `pve/create`; gold reward applied in `pve/end`.
- **Scoring System** (`scoring-system.md`) — `total_power` used for tier
  derivation and same-tier validation in `battle/create`.

## 9. Tuning Knobs

| Knob | Current Value | Notes |
|---|---|---|
| Move broadcast throttle | 80 ms | Lower = smoother remote movement, more bandwidth |
| Disconnect grace period | 10 seconds | Raise to be more forgiving of drops |
| Max party size | 3 players | Hardcoded in UI; `pve_battles.player_ids` supports any count |
| Presence key | `user.id` | One presence slot per user; rejoining replaces old slot |

## 10. Acceptance Criteria

- [ ] Players on the same tier map channel see each other's blobs in real time.
- [ ] Clicking a player on the map sends a `challenge` broadcast; recipient sees the challenge modal.
- [ ] Walking to the boss lair sends a `pve_invite` broadcast; tier-mates see the invite modal.
- [ ] Both players must be in the same tier for a PvP battle to be created (server-validated).
- [ ] PvP battle starts (phase `fighting`) when both players are present in the channel.
- [ ] Loser calls `battle/end`; server sets the winner as the other participant.
- [ ] Gold transfer and insurance refund are applied server-side only.
- [ ] Calling `battle/end` twice returns `already_processed` on the second call.
- [ ] Disconnected opponent triggers 10-second countdown; present player wins on expiry.
- [ ] PvE raid: first subscriber becomes leader and runs boss AI.
- [ ] Boss projectiles are broadcast by leader; non-leaders spawn them locally.
- [ ] `pve/end` uses server-stored `player_ids` — not a client-supplied survivor list.
- [ ] Gold awarded to all `player_ids` on boss defeat.
- [ ] HP sync events keep all party members' HP bars consistent after damage or heals.
