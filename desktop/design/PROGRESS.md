# World Scale Desktop Port — Design Progress

## Status
Reverse-documenting web game into GDDs for Godot 4 desktop port.

## Completed GDDs
- [x] `gdd/scoring-system.md` — credential input, 5 realms, stat calculation, tier assignment, realm skills, **character name rules**
- [x] `gdd/battle-system.md` — PvP combat, stat allocation (10% min per stat), damage formula, debuffs, gold transfer
- [x] `gdd/boss-pve-system.md` — 15 bosses, cooperative raids, boss AI, special attacks, broadcast system

## Remaining GDDs (in order)
- [ ] #4 `gdd/projectile-system.md` — 12 projectile kinds, arc interpolation, hit flash, trail effects
- [ ] #5 `gdd/map-system.md` — 2400×1600 world, top-down view, collision, towns, river/bridge, landmarks, 15 tier themes
- [ ] #6 `gdd/economy-system.md` — gold flow, insurance, broadcast upgrades, cosmetics store
- [ ] #7 `gdd/networking-system.md` — Supabase Presence, move sync, challenge/invite flow
- [ ] #8 `gdd/audio-system.md` — BGM tracks, synthesized SFX, AudioManager, per-page integration

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
