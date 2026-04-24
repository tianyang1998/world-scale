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

### Phase 3 — COMPLETE (2026-04-24)

- [x] `src/core/network_manager.gd` — full rewrite: WebSocketPeer connection, Phoenix channel protocol, Supabase Realtime Presence (track/diff), Broadcast (move/challenge/pve_invite), 30s heartbeat, 80ms move throttle
- [x] `src/world/remote_player.gd` + `scenes/world/RemotePlayer.tscn` — kinematic Node3D, lerp interpolation (speed=8), Label3D name tag (billboard)
- [x] `src/world/world_scene.gd` — NetworkManager signal wiring, remote player spawn/despawn on presence join/leave, move relay, portal tier transition (clears remote players, switches channel, updates terrain + HUD, repositions local player at opposite edge)
- [x] `src/ui/world_hud.gd` + `WorldHUD.tscn` — added `OnlineLabel` (green), `update_tier()`, `update_online_count()` methods
- [x] `tests/unit/test_network_manager.gd` — 9 unit tests: ref counter, throttle guard, presence diff joins/leaves, broadcast routing (move/self-filter, challenge/self-filter, pve_invite)

**Key implementation decisions:**
- WebSocket protocol: Godot `WebSocketPeer` + Phoenix channel JSON directly (no GDExtension Supabase SDK needed)
- Presence track payload mirrors web version: `{userId, name, tier, x, y}`
- Move broadcast throttle: 80ms (matches web version), sent from `WorldScene._process` not `LocalPlayer` (keeps networking out of physics node)
- Z↔Y axis mapping: web `y` = Godot `Z` — applied in `send_move(pos.x, pos.z)` and `RemotePlayer.update_target(x, y) → Vector3(x, 0, y)`
- Portal tier transition: clears all remote players, applies tier theme, re-subscribes channel, repositions local player 5m inside new tier edge
- Challenge + pve_invite: print stubs only — modals wired in Phase 4/5
- SUPABASE_WS_URL and SUPABASE_ANON_KEY are PLACEHOLDER — replace before live network test

### Phase 4 — COMPLETE (2026-04-24)

- [x] `src/core/battle_state.gd` — BattleState RefCounted: HP/Attack/Defence, debuff slots (dict with multiplier + expiry), stun expiry, brace flag, cooldown timestamp; `effective_attack()` / `effective_defence()` check expiry at call time
- [x] `src/core/battle_manager.gd` — stateless static methods: `calc_damage()` (GDD §3.3 formula), `calc_gold_transfer()` (10%, min 50, cap 500, edge: <50 loses all), `apply_debuff()`, `apply_stun()`, `apply_realm_skill()` (all 5 realms), `realm_skill_ready()`, `realm_skill_name()`, `projectile_kind_for_action()`
- [x] `src/ui/prep_screen.gd` + `scenes/ui/PrepScreen.tscn` — 3 HSliders (HP/Attack/Defence), min = floor(power×0.10), confirm disabled until sum == power and all ≥ min, writes to `PlayerData.battle_*`
- [x] `src/world/projectile.gd` + `scenes/shared/Projectile.tscn` — 12-kind projectile: linear travel, per-kind speed/size/hit-radius/no-dodge from KIND_DATA; 5 draw shapes (orb, sword, lightning, verdict, heal_pulse, spiral); hit flash 300ms; fade-out alpha
- [x] `src/world/pvp_arena.gd` + `scenes/world/PvPArena.tscn` — CanvasLayer (layer=5): HP bars, Strike/Brace/Realm buttons, projectile spawn, cooldown display, stun guard, `_end_battle()` → `battle_ended` signal
- [x] `src/ui/result_screen.gd` + `scenes/ui/ResultScreen.tscn` — CanvasLayer (layer=20): Victory/Defeat, gold delta (color-coded), new gold total, Continue button → `continue_pressed` signal
- [x] `src/core/game_manager.gd` — added `start_pvp_prep()`, `enter_pvp_arena()`, `show_result()`, `return_to_world()` state transitions; `current_battle_id` / `current_opponent_id`
- [x] `src/world/world_scene.gd` — full PvP flow: challenge AcceptDialog → PrepScreen → PvPArena (world_map hidden) → ResultScreen → restore world; `_process` gated to WORLD state only
- [x] `tests/unit/test_battle_manager.gd` — 20 unit tests covering damage formula, brace, defence debuff, expired debuff, gold transfer (all 4 edge cases), medicine heal cap, realm skill names, projectile kind routing

**Key implementation decisions:**
- PvP arena is a 2D CanvasLayer overlay — world stays loaded in 3D behind it
- PvPArena Phase 4: opponent simulated (joins after 1s, placeholder stats) — real Supabase battle channel wired once credentials are live
- Damage applied immediately locally; in networked play will rely on `hp_sync` broadcast
- Gold delta: winner uses loser's `max_hp / 3` as proxy for gold (placeholder) — real gold from `PlayerData.gold` in networked play via server `battle/end`
- `_process` in WorldScene skips move broadcast while not in WORLD state

### Phase 5 — COMPLETE (2026-04-24)

- [x] `src/core/boss_data.gd` — all 15 bosses with exact stats from §3.1 balance pass; 5 realm skill definitions (effect, mult, debuff_frac, duration_ms, targets_all)
- [x] `src/core/battle_manager.gd` — boss statics added: `boss_normal_damage()` (subtraction formula), `boss_skill_damage()` (mult-subtraction), `boss_dot_tick()` (×0.15), `pick_normal_target()` (§3.3 priority: <30%HP → non-bracing → round-robin), `pick_skill_targets()` (§3.4: all / highest-atk / lowest-HP), `boss_projectile_kind()`
- [x] `src/world/boss_arena.gd` + `scenes/world/BossArena.tscn` — CanvasLayer (layer=5): boss HP bar with countdown label, player HP bar, Strike/Brace/Realm buttons, boss AI `_process` loop (atk + skill timers), DoT coroutine (5 ticks × 1s via `await`), all 5 skill effects (aoe_damage, single_damage, dot, defence_debuff, attack_debuff), victory/defeat → `battle_ended` signal
- [x] `src/core/game_manager.gd` — `enter_pve_arena()` → `State.PVE_ARENA` added
- [x] `src/world/world_scene.gd` — `_on_boss_lair()` now calls `_open_boss_arena()`; BossArena wired to shared `_on_battle_ended` / ResultScreen flow
- [x] `tests/unit/test_boss_manager.gd` — 18 unit tests: normal damage (basic, min-1, with-debuff), skill damage (AoE, Absolute Verdict, min-1), DoT tick, targeting (low-HP priority, brace ignore on low-HP, non-bracing preference, all-bracing fallback, skip-dead, all-dead null), skill target (AoE, dot=highest-atk, single=lowest-HP, empty-when-all-dead), all-15-boss data completeness, projectile kind routing

**Key implementation decisions:**
- Boss→player hits use subtraction formula (`attack − defence`); player→boss hits use PvP percentile formula via `_boss_proxy: BattleState`
- DoT implemented as `await get_tree().create_timer(1.0).timeout` coroutine; exits early if target dies or battle ends
- Phase 5 is single-player only — BossArena holds `_players: Array[BattleState]` ready for multi-player wiring in Phase 5 networking (needs live Supabase creds)
- BossArena reuses same `_on_battle_ended` / ResultScreen flow from WorldScene as PvP

### Phase 6 — COMPLETE (2026-04-24)

- [x] `src/core/player_data.gd` — economy fields added: `active_insurance`, `owned_cosmetics`, `equipped_title`, `equipped_border`, `pending_broadcast`; `load_from_dict` and `clear` updated
- [x] `src/core/economy_manager.gd` — stateless static class: INSURANCE / BROADCAST / TITLES / BORDERS catalogs; `buy_insurance()`, `calc_refund()`, `consume_insurance()`, `buy_broadcast()`, `buy_cosmetic()`, `equip_cosmetic()`, `unequip_slot()`, `equipped_title_display()`
- [x] `src/ui/prep_screen.gd` + `scenes/ui/PrepScreen.tscn` — InsuranceRow + BroadcastRow added (hidden by default); `mode` property set by WorldScene before `add_child()`; pvp mode shows insurance picker (disabled when unaffordable), pve mode shows broadcast picker; confirm calls `buy_insurance()` or stores `pending_broadcast`
- [x] `src/ui/store_screen.gd` + `scenes/ui/StoreScreen.tscn` — CanvasLayer (layer=15): two-tab cosmetics store (Titles/Borders); per-item Buy/Equip/Unequip buttons; disables Buy when insufficient gold; emits `close_requested`
- [x] `src/world/pvp_arena.gd` — `_end_battle()`: calculates insurance refund on loss via `EconomyManager.calc_refund()`, consumes policy via `consume_insurance()`; `battle_ended` signal gains 4th param `refund: int`
- [x] `src/world/boss_arena.gd` — `_ready()`: deducts `pending_broadcast` cost before battle starts, resets to "basic" after deduction
- [x] `src/world/world_scene.gd` — STORE_SCREEN_SCENE preloaded; `_on_store()` opens StoreScreen (deduplicates), `_on_store_closed()` frees it and refreshes HUD gold; `prep_screen.mode = "pvp"` set before `add_child()`; `_on_battle_ended()` accepts optional `refund` param and passes to ResultScreen
- [x] `src/ui/result_screen.gd` + `scenes/ui/ResultScreen.tscn` — InsuranceLabel added (hidden by default); `show_result()` gains `refund: int = 0` param; shows refund line in green when > 0
- [x] `tests/unit/test_economy_manager.gd` — 19 unit tests: insurance buy/block/stack, refund percentages (bronze/silver/gold/none + floor), broadcast (free/deduct/insufficient), cosmetic buy (deduct/owned/auto-equip/re-own no-charge/insufficient), equip (not-owned error, title, border)

**Key implementation decisions:**
- EconomyManager is fully stateless static — no instantiation; all state lives in PlayerData
- Insurance policy consumed after every match (win or lose) — `consume_insurance()` always called in `_end_battle()`
- Broadcast cost deducted once at BossArena entry, not at PrepScreen confirm — PrepScreen only stores the selection in `PlayerData.pending_broadcast`
- StoreScreen buy auto-equips the purchased cosmetic; equip/unequip are separate actions per item row
- `prep_screen.mode` must be set BEFORE `add_child()` — `_setup_economy_rows()` runs in `_ready()` which fires on `add_child()`
- WorldScene `_on_battle_ended` uses `refund: int = 0` default so BossArena's 3-param signal still works

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
