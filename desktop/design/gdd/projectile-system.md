---
status: reverse-documented
source: web/lib/projectiles.ts
date: 2026-04-22
verified-by: tliu603
---

# Projectile System

> Reverse-engineered from existing implementation. Shared by both PvP and PvE
> battle pages.

## 1. Overview

The Projectile System handles all in-flight visual objects during combat — player
strikes, realm skills, boss attacks, and heal pulses. Projectiles travel linearly
from origin to target at a fixed speed, carry a damage (or heal) payload, and are
destroyed on hit or timeout. They are purely visual + hit-detection; the
authoritative damage calculation happens server-side.

## 2. Player Fantasy

Attacks feel physical and readable — players can see a bolt flying at them and
mentally process what's incoming. Each realm has a distinct visual identity so
players instantly recognise what hit them. Boss attacks look heavier and more
threatening than player attacks.

## 3. Detailed Rules

### 3.1 Projectile Kinds (12 total)

#### Player projectiles (6)

| Kind | Realm / Action | Color | Description |
|---|---|---|---|
| `sword` | Strike (all realms) | `#e8e0f0` off-white | Slash line with white glow |
| `orb` | Academia realm skill | `#9b72cf` purple | Glowing energy orb |
| `lightning` | Tech realm skill | `#EF9F27` amber | Jagged bolt with bright core |
| `heal_pulse` | Medicine realm skill | `#1D9E75` green | Cross-shaped pulse ring |
| `paint` | Creative realm skill | `#cf7272` red-pink | Orb (generic draw) |
| `verdict` | Law realm skill | `#BA7517` gold | Beam line with golden glow |

#### Boss projectiles (6)

| Kind | Boss Realm | Color | Description |
|---|---|---|---|
| `tentacle` | Generic (default) | `#cf3333` red | Wavy arc from boss with tip dot |
| `beam_pulse` | Academia | `#b44cf0` violet | Orb (generic draw) |
| `missile` | Tech | `#EF9F27` amber | Jagged bolt (shared lightning draw) |
| `dark_orb` | Medicine | `#6b2fa0` deep purple | Orb (generic draw) |
| `spiral` | Creative | `#e85d5d` coral | Three rotating ring dots |
| `gavel` | Law | `#d4a017` gold | Beam line (shared verdict draw) |

### 3.2 Core Properties

Every projectile carries:

| Property | Description |
|---|---|
| `originX/Y` | Where it was fired from (fixed at creation) |
| `targetX/Y` | Target position at time of firing (fixed — does not track moving targets) |
| `targetId` | ID of the entity that receives the payload on hit |
| `damage` | Damage (or heal amount for `heal_pulse`) to apply on hit |
| `speed` | Travel speed in px/ms |
| `hitRadius` | Circle radius for hit detection (px) |
| `noDodge` | If true, hits automatically when reaching `targetX/Y` regardless of target's current position |
| `age` | ms elapsed since creation |
| `maxAge` | Auto-destroy timeout in ms |
| `hit` | Destroyed once set true |
| `color` / `trailColor` | Draw colors |
| `size` | Base draw radius (px) |

### 3.3 Movement

All projectiles travel in a straight line from origin to target at constant speed.
Position is computed from elapsed time:

```
t         = min(age × speed / totalDist, 1.0)
x         = originX + (targetX − originX) × t
y         = originY + (targetY − originY) × t
```

Target position is snapped at creation time — projectiles do not home in on a
moving target.

### 3.4 Lifetime

```
totalDist = sqrt((targetX − originX)² + (targetY − originY)²)
maxAge    = (totalDist / speed) × 1.2   // 20% buffer beyond travel time
```

A projectile is destroyed when:
- `hit` is set to true (it landed), OR
- `age >= maxAge` (timeout — missed or target moved away)

### 3.5 Speed Values

Base speed: **0.25 px/ms** (250 px/s). Per-kind multipliers:

| Kind | Speed Multiplier | Effective Speed |
|---|---|---|
| `sword` | ×1.3 | 325 px/s |
| `lightning` / `missile` | ×1.4 | 350 px/s |
| `verdict` | ×1.2 | 300 px/s |
| `gavel` | ×1.1 | 275 px/s |
| `orb` / `heal_pulse` / `paint` / `beam_pulse` | ×1.0 | 250 px/s |
| `dark_orb` | ×0.8 | 200 px/s |
| `spiral` | ×0.85 | 212 px/s |
| `tentacle` | ×0.9 | 225 px/s |

Player attacks are faster; boss special projectiles (especially `dark_orb`) are
slower and more ominous.

### 3.6 Size and Hit Radius

| Kind | Size (draw radius px) | Hit Radius (px) |
|---|---|---|
| `sword` | 8 | 16 |
| `orb` | 9 | 14 |
| `lightning` / `missile` | 7 / 8 | 14 |
| `heal_pulse` | 10 | 20 |
| `paint` | 11 | 16 |
| `verdict` | 7 | 12 |
| `tentacle` | 12 | 18 |
| `beam_pulse` | 10 | 16 |
| `dark_orb` | 11 | 16 |
| `spiral` | 13 | 18 |
| `gavel` | 14 | 20 |

### 3.7 Dodge vs No-Dodge

- **Dodgeable projectiles** (`noDodge: false`): hit detection checks the target's
  *current* position each frame. If the target has moved away from `targetX/Y`,
  the projectile can miss.
- **No-dodge projectiles** (`noDodge: true`): hit detection checks distance from
  the projectile's current position to its fixed `targetX/Y`. Lands automatically
  when it arrives, regardless of where the target currently is.

Only `heal_pulse` is `noDodge: true` — heals cannot be dodged.

### 3.8 Hit Flash

When a projectile lands, a hit flash effect is drawn at the impact point:

```
radius = 8 + age × 0.08     // expands outward
alpha  = max(0, 1 − age / 300)  // fades over 300 ms
```

The flash uses the projectile's `color`. It is rendered independently from the
projectile itself (the projectile is destroyed on hit; the flash lives on for
its 300 ms duration).

### 3.9 Fade-Out

All projectiles fade out linearly over their lifetime:

```
alpha = max(0, 1 − age / maxAge)
```

Applied as `ctx.globalAlpha` before drawing, reset to 1 after.

### 3.10 Routing — Which Factory to Call

**Player strikes** (all realms): always `createSword`.

**Player realm skills**: routed by realm via `createRealmProjectile`:

| Realm | Factory |
|---|---|
| Academia | `createOrb` |
| Tech | `createLightning` |
| Medicine | `createHealPulse` |
| Creative | `createPaint` |
| Law | `createVerdict` |

**Boss normal attack**: `createTentacle` (generic). Realm-specific boss specials
via `createBossProjectile`:

| Boss Realm | Factory |
|---|---|
| Academia | `createBeamPulse` |
| Tech | `createMissile` |
| Medicine | `createDarkOrb` |
| Creative | `createSpiral` |
| Law | `createGavel` |
| (default) | `createTentacle` |

## 4. Formulas

```
// Projectile lifetime
maxAge = (sqrt((tx−fx)² + (ty−fy)²) / speed) × 1.2

// Position at time t (ms)
dist  = sqrt((targetX−originX)² + (targetY−originY)²)
tNorm = min(age × speed / dist, 1.0)
x     = originX + (targetX − originX) × tNorm
y     = originY + (targetY − originY) × tNorm

// Dodgeable hit detection
hit = sqrt((px−targetCurrentX)² + (py−targetCurrentY)²) < hitRadius

// No-dodge hit detection
hit = sqrt((px−targetX)² + (py−targetY)²) < hitRadius

// Hit flash
flashAlpha  = max(0, 1 − flashAge / 300)
flashRadius = 8 + flashAge × 0.08
```

## 5. Draw Shapes by Kind

| Kind | Draw Method |
|---|---|
| `sword` | Slash line (24 px long, 3 px wide) with wide white glow line behind it |
| `tentacle` | Quadratic bezier from origin to tip with sine-wave lateral offset; filled tip dot |
| `lightning` / `missile` | 5-segment jagged line with random per-segment jitter; bright white dot at tip |
| `spiral` | 3 rotating dots orbiting center + small filled core circle |
| `verdict` / `gavel` | Solid line from origin to tip; wide semi-transparent golden glow overlay; filled circle at tip |
| `heal_pulse` | Cross (+) stroke; outer ring arc in semi-transparent green |
| All others (`orb`, `beam_pulse`, `dark_orb`, `paint`) | Large soft trail circle + solid core circle + bright inner white dot (generic orb) |

## 6. Edge Cases

- **Zero-distance projectile** (origin == target): `totalDist = 0` → projectile
  is destroyed immediately on first update (no division by zero).
- **Target moves after firing**: dodgeable projectiles may miss; `targetX/Y` is
  not updated after creation.
- **Projectile timeout without hit**: destroyed at `maxAge`; no damage applied.
- **`heal_pulse` on dead target**: the payload (heal) is applied by the game
  logic layer, not the projectile system — the projectile system only reports
  the hit; callers must check `isDead` before applying the heal.
- **AoE boss skills** (e.g. System Overload): one projectile is created per
  alive target — the projectile system is single-target only.

## 7. Dependencies

- **Battle System** (`battle-system.md`) — triggers projectile creation on
  player actions; applies damage payload on hit.
- **Boss/PvE System** (`boss-pve-system.md`) — triggers boss projectile
  creation on attack/skill timers; applies damage on hit.
- **Networking System** (`networking-system.md`) — projectile events are
  broadcast to all party members so visuals are mirrored on remote clients.
  Each client re-creates the projectile locally from the broadcast payload.

## 8. Tuning Knobs

| Knob | Current Value | Notes |
|---|---|---|
| Base speed | 0.25 px/ms | Raise to make all combat feel snappier |
| Per-kind speed multipliers | ×0.8–×1.4 | Adjust feel of individual projectile types |
| Hit radius (per kind) | 12–20 px | Larger = more forgiving hit detection |
| Max age buffer | ×1.2 | Lower if stale projectiles linger too long |
| Hit flash duration | 300 ms | Raise for more impact; lower for cleaner look |
| Hit flash expansion rate | 0.08 px/ms | Raise for more dramatic impact burst |

## 9. Acceptance Criteria

- [ ] All 12 projectile kinds render with their correct colors and draw shapes.
- [ ] A projectile travels in a straight line from origin to target at the correct speed.
- [ ] A projectile is destroyed on hit and does not apply damage twice.
- [ ] A projectile is destroyed at `maxAge` if it never hits.
- [ ] Dodgeable projectiles (`noDodge: false`) miss if the target has moved away from `targetX/Y`.
- [ ] `heal_pulse` (`noDodge: true`) always lands at `targetX/Y` regardless of target movement.
- [ ] Hit flash renders at the impact point and fades within 300 ms.
- [ ] All projectiles fade out linearly as they approach `maxAge`.
- [ ] Boss projectiles (tentacle, beam_pulse, missile, dark_orb, spiral, gavel) are visually distinct from player projectiles.
- [ ] `createBossProjectile` returns the correct kind for each realm.
- [ ] `createRealmProjectile` returns the correct kind for each realm.
