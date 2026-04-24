# World Scale Desktop Port — Design Progress

## Status
Reverse-documenting web game into GDDs for Godot 4 desktop port.

## Completed GDDs
- [x] `gdd/scoring-system.md` — credential input, 5 realms, stat calculation, tier assignment, realm skills, **character name rules**
- [x] `gdd/battle-system.md` — PvP combat, stat allocation (10% min per stat), damage formula, debuffs, gold transfer
- [x] `gdd/boss-pve-system.md` — 15 bosses, cooperative raids, boss AI, special attacks, broadcast system
- [x] `gdd/projectile-system.md` — 12 projectile kinds, movement, dodge vs no-dodge, hit flash, draw shapes
- [x] `gdd/map-system.md` — 2400×1600 top-down world, camera, collision, towns, river/bridge, 15 landmarks, tier themes, portals
- [x] `gdd/economy-system.md` — gold flow, PvP transfer, insurance, broadcast upgrades, cosmetics catalog, DB schema
- [x] `gdd/networking-system.md` — DB schema, all Realtime channels + events, API endpoints, leader election, desktop port options
- [x] `gdd/audio-system.md` — 6 BGM tracks, 6 synthesized SFX with full synthesis parameters, volume overlay, Godot port equivalents

## Implementation Progress

### Phase 1 — COMPLETE (merged to main `56108be`, 2026-04-23)

- [x] Godot 4.6 project initialized (`desktop/project.godot`, Forward+ renderer, 1280x720)
- [x] 4 autoloads: `PlayerData`, `GameManager`, `AudioManager`, `NetworkManager`
- [x] `Scorer` — 15-tier power system, percentile scoring, 11 unit tests (GdUnit4)
- [x] `AudioManager` — BGM crossfade (Tween kill guard), ConfigFile volume persistence, 6 MP3 tracks
- [x] `PlayerData` — multi-realm: `realm_scores: Dictionary` + `dominant_realm: String`
- [x] `TitleScreen.tscn` — 5-panel layout (auth, accumulator, realm picker, credentials, name entry)
- [x] `TitleScreen.gd` — email/password auth, multi-realm accumulator, HttpState enum routing, 8 name validation tests
- [x] Placeholder `WorldScene.tscn`

**Key implementation decisions:**
- Multi-realm: players submit any subset of 5 realms; `total_power` = sum; `dominant_realm` = highest contributor
- Returning users: DB realm scores pre-populated in accumulator; unedited realms skip `/api/score` on Proceed
- `HttpState` enum routes all HTTP responses through a single handler (no signal swapping)
- Static RegEx cache for name validation — compiled once per process, not per keystroke
- `API_BASE` placeholder in `TitleScreen.gd` — replace with real Supabase URL before testing

### Phase 2 — COMPLETE (2026-04-23)

- [x] `src/world/local_player.gd` — CharacterBody3D, WASD at 24 m/s, SpringArm3D camera (8m, -60°), mouse-look, gravity guard, face-velocity lerp
- [x] `scenes/world/LocalPlayer.tscn` — capsule collider (layer=2, mask=1), placeholder mesh, Label3D name tag (billboard), SpringArm3D > Camera3D (fov=60), interact hint
- [x] `src/world/world_map_3d.gd` — trigger_entered signal, 15-tier TIER_COLORS (typed dict), cached terrain material, apply_tier_theme, Area3D body_entered lambdas
- [x] `scenes/world/WorldMap3D.tscn` — 240×160m terrain, river dual-segment collision (12m bridge gap at X=84–96), 6 town buildings (StaticBody3D), 4 Area3D triggers (portals/boss/store), portal torus meshes, boss disc
- [x] `src/ui/world_hud.gd` + `scenes/world/WorldHUD.tscn` — CanvasLayer overlay: tier name, gold, ESC hint
- [x] `src/world/world_scene.gd` + `WorldScene.tscn` rewrite — ProceduralSky env, DirectionalLight3D, instances WorldMap3D + WorldHUD, spawns LocalPlayer at runtime with ±15m jitter
- [x] `project.godot` — WASD + arrow key input map, interact (E key)
- [x] Collision layers verified: world=1, player=2, triggers=4 (all .tscn files)

**Key implementation decisions:**
- Player speed: 24 m/s (= web 4px/frame × 60fps ÷ 10, matching 1px=0.1m scale)
- River collision: two BoxShape3D segments leave a 12m walkable gap at bridge (X=84–96)
- LocalPlayer runtime-spawned (not in WorldScene.tscn) for clean spawn-point passing
- Terrain material cached in _terrain_mat; albedo mutated on tier changes (no reallocation)
- Trigger handlers are print stubs — Phase 3 wires real portal/boss/store logic

### Phase 3 — Not started

---

## Remaining GDDs (in order)

*All GDDs complete.*

## Key Decisions Made This Session
- Desktop port lives in `C:\Users\Tianyang Liu\Desktop\Games\WS\desktop\`
- Engine: Godot 4
- Web version in `web/` is source of truth for porting
- Credential entry: in-game web form (same flow as web version)
- Battle stat allocation: player distributes power freely across HP/Attack/Defence before each battle
- Minimum per stat: floor(power × 0.10) — 10% of power
- Future abilities (5 per realm beyond realm skill): deferred, not documented yet
- Review mode: lean
- Boss stats reflect 2026-04-10 balance pass (linear tier-scaling multipliers applied)
- Gold economy: 500 signup bonus, 10% PvP transfer (min 50, max 500)
- Map system: top-down overhaul with collision, towns, river/bridge, per-tier landmarks
- Backend: desktop uses a **separate Supabase project** (different URL + anon key from web)
  - Fresh schema — no data migration from web
  - Same auth flow (email/magic link/OAuth)
  - Same Supabase Realtime + Presence for multiplayer
  - Web and desktop player bases are fully independent

## Source Files (web game)
All in `C:\Users\Tianyang Liu\Desktop\Games\WS\web\lib\`:
- `scorer.ts` — scoring system
- `battle.ts` — battle system
- `boss.ts` — boss/PvE system
- `projectiles.ts` — projectile system
- `map-draw.ts`, `map-data.ts` — map system
- `economy.ts` — economy system
- `types.ts` — shared types

## Additional Design Sources
All in `C:\Users\Tianyang Liu\Desktop\Games\WS\.superpowers\`:
- `specs/2026-04-10-boss-buff-design.md` — boss balance pass rationale and stat table
- `specs/2026-04-05-economy-system-design.md` — full economy design (gold flow, insurance, broadcast, cosmetics)
- `plans/2026-04-05-economy-system.md` — economy implementation plan (constants, API routes, UI)
- `specs/2026-04-04-world-map-topdown-design.md` — top-down map overhaul (terrain, collision, landmarks, draw order)
- `specs/2026-04-09-audio-system-design.md` — audio system design (BGM tracks, SFX, AudioManager)
- `plans/2026-04-09-audio-system.md` — audio implementation plan (full AudioManager code)
- `specs/2026-04-11-username-validation-design.md` — character name rules (length, chars, profanity, uniqueness)
