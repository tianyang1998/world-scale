---
status: reverse-documented
source: web/lib/map-data.ts, web/app/map/page.tsx, .superpowers/specs/2026-04-04-world-map-topdown-design.md
date: 2026-04-22
verified-by: tliu603
---

# Map System

> Reverse-engineered from existing implementation and approved design spec.
> The map is a top-down overhead view; the original side-view implementation
> was replaced in the 2026-04-04 overhaul.

## 1. Overview

The Map System renders a persistent 2400×1600 top-down world for each of the
15 tiers. Players move freely around the map, navigate collision obstacles,
cross the river via a bridge, visit the town, approach the boss lair to start
a raid, and walk through portals to move between tiers. Each tier is a
distinct biome — no tier looks inferior to another.

## 2. Player Fantasy

The player feels like they're actually inhabiting their tier's world — walking
through a town, crossing a bridge over a river, approaching an ominous boss
lair. Moving to a higher tier is exciting because the world visually transforms
into something entirely different. The map is alive: other players are visible
moving around in real time.

## 3. Detailed Rules

### 3.1 World Dimensions

| Property | Value |
|---|---|
| Map width | 2400 px |
| Map height | 1600 px |
| Viewport | Canvas sized to browser window (scrolls via camera) |
| Camera | Follows local player, clamped to map bounds |

Camera formula:
```
camX = clamp(player.x − viewportW / 2,  0,  MAP_W − viewportW)
camY = clamp(player.y − viewportH / 2,  0,  MAP_H − viewportH)
```

### 3.2 Player Movement

| Property | Value |
|---|---|
| Speed | 4 px per frame (at 60 fps ≈ 240 px/s) |
| Player radius | 18 px (used for collision and rendering) |
| Controls | Arrow keys or WASD |
| Map boundary | Player clamped to `[PLAYER_RADIUS, MAP_W − PLAYER_RADIUS]` × `[PLAYER_RADIUS, MAP_H − PLAYER_RADIUS]` |

Movement is axis-separated — X and Y are resolved independently each frame,
allowing the player to slide along walls rather than stopping dead on diagonal
contact.

### 3.3 Collision System

All solid objects contribute axis-aligned bounding rects (`CollisionRect {x, y, w, h}`).
The full list is built once per tier on entry and stored; no per-frame allocation.

**Collision sources:**

| Source | Rect dimensions |
|---|---|
| Buildings | Exact footprint (w × h from `BuildingDef`) |
| Trees | 24×24 px centered on trunk (`x−12, y−12, 24, 24`) |
| River | 24 segments spanning full map width; each `segW × 100 px` tall, Y-positioned to follow the wave |
| Bridge gap | Segments whose `midX` is within 60 px of `bridgeX` are **excluded** from the river rects |
| Bushes | No collision — decorative only |
| Paths | No collision — walkable |
| Portals | No collision — proximity trigger only |
| Boss lair | No collision — proximity trigger only |

**Collision check per frame:**
```
proposed = player.pos + input × SPEED
// X axis
if !collidesWithAny(proposed.x, current.y, PLAYER_RADIUS, rects):
    player.x = proposed.x
// Y axis
if !collidesWithAny(player.x, proposed.y, PLAYER_RADIUS, rects):
    player.y = proposed.y
```

`collidesWithAny` uses circle-vs-AABB: finds the closest point on each rect
to the player center, checks if distance < `PLAYER_RADIUS`.

### 3.4 Map Elements

#### Town (upper-left quadrant)

6 buildings per tier at fixed relative positions (all tiers share the same
layout, only colors/styles differ):

| Building | Position | Size | Type |
|---|---|---|---|
| House 1 | (380, 320) | 100×80 | house |
| House 2 | (520, 300) | 90×75 | house |
| House 3 | (440, 440) | 85×70 | house |
| House 4 | (310, 460) | 80×70 | house |
| Tavern | (580, 420) | 120×95 | tavern |
| Store | (700, 310) | 110×85 | store |

All buildings are solid collision. The store shows a tooltip when the player
is within 80 px of its center (`STORE_RANGE = 80`). Press `E` near the store
to navigate to `/store`.

#### River

- Horizontal wavy band at `riverY = 1100` (lower third of map)
- Wave shape: `y = riverY + sin(x × 0.003) × riverAmplitude` (amplitude = 40 px)
- Half-width: 50 px → total river band ≈ 100 px tall
- Animated shimmer: sine wave highlight color shifts with `timestamp`
- **Impassable** — collision rects cover full width in 24 segments (~100 px each)

#### Bridge

- Single bridge at `bridgeX = 900` px
- Bridge gap in river collision: segments with `midX` within ±60 px of 900 are skipped
- Effective walkable gap: ~120 px wide
- Rendered as wooden planks with side rails, viewed from above

#### Dirt Paths

- Main path: connects left portal → town → bridge → landmark → boss lair → right portal
- Branch paths: spur from main road toward town center and landmark
- Main path width: ~60 px; branch width: ~40 px
- No collision — purely visual ground strip

Waypoints (shared across all tiers):
```
Main: (50,800)→(300,800)→(550,600)→(900,700)→(900,1100)
      →(900,700)→(1300,600)→(1700,500)→(2050,500)→(2350,800)
Branches: [(400,600)→(500,500)→(550,400)], [(1500,550)→(1500,400)]
```

#### Trees & Bushes

15 trees and 12 bushes per tier, at fixed positions (shared layout).
Trees: solid collision (24×24 px hitbox). Bushes: decorative, no collision.

#### Landmark (1 per tier, unique, upper-right area at x=1500, y=380)

| Tier | Landmark Type |
|---|---|
| Apprentice | `well` — Old Well |
| Initiate | `watchtower` — Wooden Watchtower |
| Acolyte | `shrine` — Mossy Shrine |
| Journeyman | `windmill` — Windmill |
| Adept | `clocktower` — Clocktower |
| Scholar | `observatory` — Observatory Dome |
| Sage | `library` — Ancient Library Ruin |
| Arcanist | `obelisk` — Glowing Obelisk |
| Exemplar | `fountain` — Grand Fountain |
| Vanguard | `forge` — Forge & Anvil |
| Master | `colosseum` — Stone Colosseum |
| Grandmaster | `dragon` — Dragon Statue |
| Champion | `brazier` — Eternal Flame Brazier |
| Paragon | `crystal` — Floating Crystal |
| Legend | `portal_arch` — Ancient Portal Arch |

Purely decorative — no interaction or collision.

#### Boss Lair

- Position: (2050, 450) — upper-right, accessible from main path
- Rendered as a dark cave mouth (dark oval, red glowing eyes) viewed from above
- Proximity trigger radius: **80 px** (`BOSS_RANGE`)
- On proximity: shows boss challenge modal (only on the player's home tier)
- No collision rect

#### Portals

- Left portal: (50, 800) — leads to the tier below
- Right portal: (2350, 800) — leads to the tier above
- Proximity trigger radius: **60 px** (`PORTAL_RANGE`)
- On trigger: fade transition begins, player teleports to new tier
- Rendered as a glowing oval on the ground with pulsing animation
- Label: tier name + directional arrow; color = accent of the adjacent tier
- First tier (Apprentice): no left portal. Last tier (Legend): no right portal.

#### Spawn Position

On entering a tier (initial load or portal transition), player spawns at:
```
x = MAP_W / 2 + random(−150, 150)   // ≈ 1200 ± 150
y = MAP_H / 2 + random(−150, 150)   // ≈ 800 ± 150
```

### 3.5 Tier Themes

All tiers share the same layout skeleton; only colors and styles differ.

| Tier | Ground | Path | Accent | Biome Feel |
|---|---|---|---|---|
| Apprentice | `#3a3828` grey-brown | `#6a6040` sandy | `#888780` | Barren earth, rough stone |
| Initiate | `#2e3a22` dark green | `#6a5a3a` dirt | `#7aaa50` | Emerging forest, wood buildings |
| Acolyte | `#1e3a20` lush green | `#5a5030` packed dirt | `#50cc70` | Deep forest, warm thatch |
| Journeyman | `#1e3828` green-teal | `#5a4a30` | `#3a8ab0` | Wetland, riverside |
| Adept | `#1e2e38` blue-grey | `#4a5560` cobble | `#5070c0` | Stone city, arcane tinge |
| Scholar | `#1e2240` deep blue | `#5a5a70` cobble | `#7060d0` | Arcane academy, blue stone |
| Sage | `#2a1e40` purple | `#5a4a6a` flagstone | `#9060c0` | Mystical, ivy-covered ruins |
| Arcanist | `#30183a` deep purple | `#604a6a` | `#b050c0` | Dark magic, glowing runes |
| Exemplar | `#351a2a` mauve | `#604050` flagstone | `#c04080` | Flowering meadow, ornate stone |
| Vanguard | `#3a2210` brown-orange | `#6a5030` sandstone | `#c06030` | Savanna, forge district |
| Master | `#3a2a10` golden tan | `#7a6a40` sandstone | `#d07020` | Desert city, adobe |
| Grandmaster | `#3a2808` ochre | `#7a6030` sandstone | `#e08030` | Arid plateau, terracotta |
| Champion | `#3a1010` volcanic red | `#5a3a3a` dark slate | `#e04020` | Volcanic, dark iron |
| Paragon | `#3a0e0e` deep red | `#5a3535` dark slate | `#f03030` | Obsidian, smoldering |
| Legend | `#200020` deep purple | `#5a2a6a` glowing | `#ff40ff` | Crystal formations, arcane arch |

### 3.6 Draw Order

Rendered each frame in this order (painter's algorithm — later items appear on top):

1. Terrain fill (ground + groundAlt texture variation)
2. Dirt paths (main + branches)
3. River (with animated shimmer highlight)
4. Bridge
5. Building shadows
6. Buildings (walls, roofs, doors, windows with warm glow)
7. Landmark
8. Tree shadows
9. Trees & bushes
10. Boss lair
11. Portals (with pulsing glow)
12. Player shadows
13. Player blobs (circle + name label + tier badge)
14. HUD (current tier name, top-left)
15. Store tooltip (if player near store)
16. Fade overlay (black, for tier transitions)

### 3.7 Tier Transitions

When the player enters a portal:
1. Fade overlay ramps from 0 → 1 (black screen).
2. Player position resets to spawn point in new tier.
3. Collision rects rebuilt for the new tier.
4. Fade overlay ramps from 1 → 0.

No state is preserved across transitions (debuffs, projectiles all clear).

### 3.8 Multiplayer Presence

Other players on the same tier are visible as player blobs in real time via
Supabase Presence. Remote players' positions update on each broadcast from
their client. Only players on the same tier are shown. See
`networking-system.md` for the sync protocol.

## 4. Formulas

```
// Camera
camX = clamp(player.x − viewW / 2,   0,  2400 − viewW)
camY = clamp(player.y − viewH / 2,   0,  1600 − viewH)

// Movement (per frame, axis-separated)
proposed.x = player.x + (right − left) × 4
proposed.y = player.y + (down − up) × 4
player.x = proposed.x  if !collidesWithAny(proposed.x, player.y, 18, rects)
player.y = proposed.y  if !collidesWithAny(player.x, proposed.y, 18, rects)

// Boundary clamp
player.x = clamp(player.x, 18, 2400 − 18)
player.y = clamp(player.y, 18, 1600 − 18)

// Circle-vs-AABB collision
closestX = clamp(player.x,  rect.x,  rect.x + rect.w)
closestY = clamp(player.y,  rect.y,  rect.y + rect.h)
hit = (player.x − closestX)² + (player.y − closestY)² < 18²

// River wave (for collision rect Y position)
waveY = riverY + sin(segmentMidX × 0.003) × riverAmplitude
rectY = waveY − 50

// Proximity triggers
nearPortal = dist(player, portal) < 60
nearBoss   = dist(player, bossLair) < 80
nearStore  = dist(player, storeCenter) < 80

// Spawn on tier entry
x = 1200 + random(−150, 150)
y = 800  + random(−150, 150)
```

## 5. Edge Cases

- **Player spawns inside a collision rect**: Spawn point is in the open center
  of the map, away from all buildings and trees. River is in the lower third —
  spawn is well above it. Extremely unlikely; no guard currently implemented.
- **Two players simultaneously enter a portal**: Each client triggers its own
  transition independently — no server coordination needed.
- **Remote player on a different tier**: Not rendered; presence channel is
  tier-scoped.
- **Canvas resize**: Camera formula recalculates each frame from live
  `canvas.width / canvas.height` — no explicit resize handler needed.
- **Legend tier right portal / Apprentice left portal**: Portal draw and trigger
  are skipped when `tierIdx === 0` (no tier below) or `tierIdx === 14` (no tier above).
- **Store on non-home tier**: Store tooltip and E-key navigation are always
  active — the store is accessible from any tier map.

## 6. Dependencies

- **Scoring System** (`scoring-system.md`) — tier assignment determines which
  map the player's home is; players can walk to adjacent tiers via portals.
- **Boss/PvE System** (`boss-pve-system.md`) — boss lair proximity triggers
  the raid initiation flow.
- **Economy System** (`economy-system.md`) — store proximity triggers navigation
  to the cosmetics store.
- **Networking System** (`networking-system.md`) — Supabase Presence broadcasts
  player positions to all tier-mates; challenge/invite flows are initiated from
  the map.

## 7. Tuning Knobs

| Knob | Current Value | Notes |
|---|---|---|
| Map size | 2400×1600 px | Larger = more exploration; affects camera clamp |
| Player speed | 4 px/frame | Raise for faster traversal |
| Player radius | 18 px | Affects collision feel and visual size |
| Portal trigger radius | 60 px | Raise to make portals easier to enter |
| Boss trigger radius | 80 px | Raise to make lair easier to approach |
| Store trigger radius | 80 px | |
| River Y position | 1100 px | Currently in lower third |
| River amplitude | 40 px | Higher = more dramatic wave |
| Bridge gap half-width | 60 px | Total gap ≈ 120 px; raise for easier crossing |
| Tree collision radius | 12 px (24×24 rect) | Lower for easier navigation |
| Spawn randomness | ±150 px | Spreads players out on entry |

## 8. Acceptance Criteria

- [ ] Map renders at 2400×1600 with camera clamped to viewport.
- [ ] Player moves at 4 px/frame with WASD and arrow keys.
- [ ] Player slides along walls (axis-separated collision).
- [ ] Player cannot walk through buildings or trees.
- [ ] Player cannot cross the river except at the bridge (~x=900).
- [ ] All 15 tier maps render with correct biome colors and unique landmarks.
- [ ] Approaching a portal within 60 px triggers a fade transition to the adjacent tier.
- [ ] Left portal absent on Apprentice tier; right portal absent on Legend tier.
- [ ] Boss lair proximity (80 px) shows the raid challenge modal on the player's home tier only.
- [ ] Store proximity (80 px) shows tooltip; pressing E navigates to `/store`.
- [ ] Other players on the same tier are visible as blobs with names; players on other tiers are not shown.
- [ ] Collision rects are rebuilt on tier transition; old tier's rects are discarded.
- [ ] Player spawns in the open center area on tier entry (not inside a building or tree).
