---
date: 2026-04-22
author: tliu603
status: approved
---

# World Scale Desktop Port — Godot 4 Architecture Design

## 1. Overview

A full Godot 4 desktop port of the web game "World Scale". The port is a
visual and technical upgrade — not a direct translation. The core game
mechanics (scoring, economy, networking, boss AI) are preserved faithfully;
the rendering, movement, and camera are rebuilt in 3D.

**Visual direction:** Cel-shaded 3D with cute/chibi character proportions.
Bold black outlines, flat toon-shaded color zones, no photorealistic textures.
Reference: Godot Engine mascot (Godot 4.6 promo art), Wind Waker.

**Camera:** Third-person over-the-shoulder, spring-arm follow, ~60° tilt.
Player sees their character from behind as they explore the world.

**Scope boundary:** This document covers Godot 4 desktop implementation only.
Web/Next.js server routes, Supabase Edge Functions, and backend API changes
are out of scope — documented as integration points below.

---

## 2. Visual Style Specification

### 2.1 Rendering Pipeline
- Godot 4 **Forward+** renderer (supports point lights, shadows, post-processing)
- **Toon shader** on all characters and world geometry: two-tone shading
  (lit face / shadow face), hard boundary, no gradient
- **Outline pass** via `WorldEnvironment` + screen-space outline shader or
  per-object `StandardMaterial3D` with inverted-hull technique
- No physically-based materials — flat colored `StandardMaterial3D` with
  `Shading Mode: Unshaded` or custom toon shader

### 2.2 Character Design
- **Proportions:** Chibi/cute — head ~40% of total height, short limbs
- **5 realm variants** (one model, different accent colors + minor shape tweaks):
  - `academia` — blue/gold
  - `tech` — cyan/dark
  - `medicine` — white/green
  - `creative` — purple/pink
  - `law` — red/silver
- **Animations required:** idle, walk, attack (projectile throw), brace/dodge,
  take-hit, victory, defeat
- **Name tag:** `Label3D` with `Billboard = Enabled`, floats 0.3m above head
- **Equipped title/border:** rendered as a small UI badge near the name tag

### 2.3 World Map Visual
- Terrain mesh matches web map proportions (river south-center, bridge at
  x≈900, towns at fixed positions)
- **Biome coloring per tier** — terrain material swaps per tier zone:
  Apprentice (bright green) → ... → Legend (dark crystal/void)
- River: animated water shader (scrolling UV, slight transparency)
- Landmark towers: simple 3D models, one distinct silhouette per tier
- Buildings (store, portal, boss lair): cel-shaded 3D structures

---

## 3. Scene Architecture

### 3.1 Autoloads (always active)

| Autoload | File | Responsibility |
|---|---|---|
| `GameManager` | `src/core/game_manager.gd` | Game state machine, scene transitions |
| `AudioManager` | `src/core/audio_manager.gd` | BGM crossfade, SFX playback, volume persistence |
| `NetworkManager` | `src/core/network_manager.gd` | Supabase WebSocket, Presence, Broadcast |
| `PlayerData` | `src/core/player_data.gd` | Character stats, gold, cosmetics (in-memory cache) |

### 3.2 Scene Map

```
scenes/
├── ui/
│   ├── TitleScreen.tscn       ← auth, credential input form (web view or native UI)
│   ├── PrepScreen.tscn        ← stat allocation before PvP/PvE
│   └── ResultScreen.tscn      ← win/lose, gold delta, play-again
├── world/
│   ├── WorldScene.tscn        ← persistent 3D world (map + sub-scenes)
│   ├── WorldMap3D.tscn        ← terrain, river, buildings, portals
│   ├── LocalPlayer.tscn       ← CharacterBody3D + SpringArm3D camera
│   ├── RemotePlayer.tscn      ← other players (position synced via Presence)
│   ├── PvPArena.tscn          ← combat sub-scene, loaded on battle start
│   └── BossArena.tscn         ← raid sub-scene, loaded on raid start
└── shared/
    ├── Projectile.tscn        ← reusable projectile (12 kinds via parameters)
    └── HUD.tscn               ← 2D overlay: HP bar, gold, volume controls
```

### 3.3 Scene Transition Flow

```
TitleScreen (2D)
  └─[auth + score + character save]─► WorldScene (3D, persistent)
                                          ├─[challenge accepted]─► PrepScreen (2D overlay)
                                          │                             └─► PvPArena (sub-scene in WorldScene)
                                          │                                     └─► ResultScreen (2D)
                                          │                                             └─► WorldScene (resume)
                                          └─[boss lair entered]──► PrepScreen (2D overlay)
                                                                        └─► BossArena (sub-scene in WorldScene)
                                                                                └─► ResultScreen (2D)
                                                                                        └─► WorldScene (resume)
```

**Transition rules:**
- `TitleScreen → WorldScene`: `change_scene_to_file()` — full scene swap
- `WorldScene → PrepScreen`: additive overlay (PrepScreen added as child, not
  a scene change — world stays loaded)
- `WorldScene → PvPArena/BossArena`: `add_child()` the arena sub-scene;
  `WorldMap3D` visibility toggled off but not freed
- `ResultScreen → WorldScene`: remove arena sub-scene, restore map visibility,
  remove result overlay

---

## 4. Player System (3D)

### 4.1 LocalPlayer
- `CharacterBody3D` with capsule collider
- Movement: WASD / left-stick, `move_and_slide()` on the XZ plane
- Speed: matches web version (4 units/s, scaled to 3D world size)
- **SpringArm3D camera rig:**
  - Arm length: 8m
  - Tilt: 60° from horizontal
  - Horizontal rotation: follows mouse X / right-stick X
  - Collision mask: terrain + buildings (camera clips to avoid walls)
- Player faces movement direction (lerp rotation to velocity direction)
- During combat: player faces target/aim direction

### 4.2 RemotePlayer
- Spawned by `NetworkManager` on Presence `join` event
- Position updated on `move` broadcast (80ms throttle, same as web)
- Interpolated locally to avoid jitter (lerp over 80ms window)
- Displays name tag + realm color
- No physics — kinematic position set directly

---

## 5. World Map (3D)

### 5.1 Terrain
- Single `MeshInstance3D` with heightmap terrain (mostly flat with slight
  elevation variation for visual interest)
- Collision: `StaticBody3D` with `CollisionShape3D` matching terrain mesh
- River carved as a channel in the terrain mesh, filled with water plane
- Bridge: separate `StaticBody3D` crossing the river at x≈900

### 5.2 Layout Faithfulness
The 3D world preserves the web map's spatial relationships:
- River runs roughly east-west at the south-center of the map
- Bridge at the river's midpoint
- Portal entrances at west and east edges (tier transitions)
- Boss lair at the northeast landmark position
- Store building near the center-east
- 15 tier landmarks distributed across the map

Exact 3D coordinates to be determined during implementation (blocked on
terrain mesh authoring). Web coordinates (2400×1600 pixels) mapped to
3D space at 1px = 0.1m → 240m × 160m world.

### 5.3 Interaction Zones
Replaced with `Area3D` trigger volumes instead of range checks:
- Portal: `Area3D` at each portal → tier transition on enter
- Boss lair: `Area3D` → pve_invite broadcast + lobby UI
- Store: `Area3D` → open store UI on enter

---

## 6. Combat (3D)

### 6.1 Projectiles
- All 12 projectile kinds ported to 3D: travel on flat XZ plane (Y = player
  waist height, ~0.8m)
- `CharacterBody3D` or `Area3D` depending on whether they need physics response
- Hit detection: `Area3D` overlap on target's hitbox
- Visual: `MeshInstance3D` with realm-colored toon material + trail `GPUParticles3D`
- Hit flash: toon shader uniform override (flash color, 300ms)

### 6.2 PvP Arena
- Enclosed 3D space (~40m × 40m), loaded as sub-scene
- Same combat logic as web: real-time, projectile-based, stat-driven damage
- Camera: switches to arena-local spring-arm (tighter, lower angle)
- Both players' positions synced via `move` broadcast

### 6.3 PvE Boss Arena
- Larger enclosed space (~80m × 80m)
- Boss: `CharacterBody3D` with NavMesh-based movement (simple patrol/chase)
- Boss visual: larger cel-shaded model, tier-appropriate design
- Up to 3 players, all positions synced

---

## 7. Integration Points (Backend — Out of Godot Scope)

These are handled by the existing web server or Supabase Edge Functions.
Godot calls them via `HTTPRequest` node.

| Endpoint | Godot trigger | Notes |
|---|---|---|
| `POST /api/score` | TitleScreen credential submit | Returns computed stats |
| `POST /api/character/save` | After scoring | Saves character to DB |
| `POST /api/battle/create` | Challenge accepted | Returns battle_id |
| `POST /api/battle/end` | Loser HP reaches 0 | Server derives winner |
| `POST /api/pve/create` | Boss lair entered | Returns battle_id |
| `POST /api/pve/end` | Boss defeated or all dead | Server awards gold |
| `POST /api/economy/buy-insurance` | PrepScreen | Deducts premium |
| `POST /api/economy/buy-cosmetic` | Store UI | Deducts cost |

**Auth:** Supabase email/magic link. TitleScreen opens a native Godot UI
or embedded WebView for the auth flow. Session JWT stored in `PlayerData`,
passed as `Authorization: Bearer <jwt>` header on all API calls.

**Realtime:** `NetworkManager` connects to Supabase Realtime WebSocket
directly. Channel subscription, Presence tracking, and Broadcast follow
the protocol documented in `gdd/networking-system.md`.

---

## 8. Audio

Implemented per `gdd/audio-system.md`. Key Godot specifics:
- BGM: two `AudioStreamPlayer` nodes, `Tween` for 1s crossfade
- MP3 files copied from `web/public/audio/bgm/` into `assets/audio/bgm/`
- SFX: pre-rendered WAV files (Option A from GDD §6) imported as
  `AudioStreamWAV` — simpler than runtime `AudioStreamGenerator` synthesis
- Volume persistence: `ConfigFile` at `user://settings.cfg`

---

## 9. Implementation Phases

| Phase | Content | Key Deliverable |
|---|---|---|
| 1 | Project scaffold, Autoloads, TitleScreen | Auth works, character loads into PlayerData |
| 2 | 3D WorldMap, LocalPlayer, camera | Player walks around the 3D world |
| 3 | NetworkManager, Presence, RemotePlayers | Other players visible on map |
| 4 | PrepScreen, PvP arena, projectiles, result | Full PvP match playable |
| 5 | Boss arena, boss AI, PvE cooperative combat | Full raid playable |
| 6 | Economy: store, insurance, cosmetics, leaderboard | Gold flow complete |
| 7 | AudioManager, BGM, SFX, volume overlay | Full audio |
| 8 | Polish: VFX, cel-shader tuning, UI refinement | Shippable quality |

---

## 10. Out of Scope

- Web/Next.js server code changes
- Supabase Edge Function authoring
- Mobile or web export of the Godot build
- Voice acting, narration
- New game mechanics not in the web version (deferred to post-launch)
- Full 3D character model creation (placeholder assets used during development)
