# World Scale Desktop Port — Design Progress

## Status
Reverse-documenting web game into GDDs for Godot 4 desktop port.

## Completed GDDs
- [x] `gdd/scoring-system.md` — credential input, 5 realms, stat calculation, tier assignment, realm skills
- [x] `gdd/battle-system.md` — PvP combat, stat allocation (10% min per stat), damage formula, debuffs, gold transfer

## Remaining GDDs (in order)
- [ ] #3 `gdd/boss-pve-system.md` — 15 bosses, cooperative raids, boss AI, special attacks
- [ ] #4 `gdd/projectile-system.md` — 12 projectile kinds, arc interpolation, hit flash, trail effects
- [ ] #5 `gdd/map-system.md` — 2400×1600 world, camera, collision, landmarks, 15 tier themes
- [ ] #6 `gdd/economy-system.md` — gold, insurance, cosmetics, broadcast tiers
- [ ] #7 `gdd/networking-system.md` — Supabase Presence, move sync, challenge/invite flow

## Key Decisions Made This Session
- Desktop port lives in `C:\Users\Tianyang Liu\Desktop\Games\WS\desktop\`
- Engine: Godot 4
- Web version in `web/` is source of truth for porting
- Credential entry: in-game web form (same flow as web version)
- Battle stat allocation: player distributes power freely across HP/Attack/Defence before each battle
- Minimum per stat: floor(power × 0.10) — 10% of power
- Future abilities (5 per realm beyond realm skill): deferred, not documented yet
- Review mode: lean

## Source Files (web game)
All in `C:\Users\Tianyang Liu\Desktop\Games\WS\web\lib\`:
- `scorer.ts` — scoring system
- `battle.ts` — battle system
- `boss.ts` — boss/PvE system
- `projectiles.ts` — projectile system
- `map-draw.ts`, `map-data.ts` — map system
- `economy.ts` — economy system
- `types.ts` — shared types
