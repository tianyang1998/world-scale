---
status: reverse-documented
source: .superpowers/specs/2026-04-09-audio-system-design.md,
        .superpowers/plans/2026-04-09-audio-system.md
date: 2026-04-22
verified-by: tliu603
---

# Audio System

> Designed for the web version; ported to Godot for desktop.
> Web implementation: singleton `AudioManager` class + Web Audio API synthesis.
> Desktop implementation: Godot `AudioStreamPlayer` nodes + synthesized SFX
> via `AudioStreamGenerator` or pre-rendered WAV files.

## 1. Overview

The Audio System provides background music (BGM) and sound effects (SFX) for
all game screens. BGM uses external royalty-free MP3 files with 1-second
crossfades between tracks. SFX are synthesized procedurally — no audio files
needed for effects. Volume settings persist between sessions.

## 2. Player Fantasy

Music makes the world feel alive — the map feels like an adventure, PvP feels
tense and electric, a boss raid feels dark and epic. SFX give combat weight:
every strike sounds like it connects. Volume controls let players adjust
without leaving the game.

## 3. BGM Tracks

6 tracks total. All sourced externally as royalty-free MP3s (CC0 recommended
— OpenGameArt.org, Freesound.org, or Pixabay Music).

| Key | File | Loops | Vibe |
|---|---|---|---|
| `landing` | `landing.mp3` | yes | Epic / cinematic orchestral |
| `map` | `map.mp3` | yes | Ambient adventure loop |
| `pvp` | `pvp.mp3` | yes | Intense electronic / combat |
| `pve` | `pve.mp3` | yes | Dark epic boss fight |
| `win` | `win.mp3` | **no** | Triumphant fanfare (short, plays once) |
| `lose` | `lose.mp3` | **no** | Somber dramatic sting (short, plays once) |

### Track switching

- Only one track plays at a time.
- Switching tracks: fade current track out over **1 second** → swap → fade
  new track in over **1 second**.
- Requesting the currently-playing track is a no-op (no restart, no stutter).
- `win` and `lose` play once and stop — no loop.

### BGM trigger points

| Screen / State | Track |
|---|---|
| Landing / title screen | `landing` |
| World map | `map` |
| PvP battle (fighting phase) | `pvp` |
| PvE boss raid (fighting phase) | `pve` |
| Battle result — victory | `win` |
| Battle result — defeat | `lose` |
| Prep screens (PvP prep, PvE prep) | *(no BGM — silence or carry-over)* |

BGM is triggered on screen load / state change, not on user action.
Track switches happen automatically when game state changes (e.g. battle ends).

## 4. SFX

6 synthesized sound effects. No audio files — all generated procedurally at
runtime from oscillators and noise.

### SFX catalog

| Key | Trigger | Character |
|---|---|---|
| `playerAttack` | Player fires any projectile | Short high-pitched sine sweep upward (400 Hz → 900 Hz, 150 ms) |
| `hit` | Any projectile hits a target | White noise burst (low-pass filtered) + low sine thud (120 Hz → 40 Hz, 120 ms) |
| `dodge` | Player successfully braces | Quick ascending square wave blip (300 Hz → 600 Hz, 100 ms) |
| `bossAttack` | Boss fires or charges an attack | Deep sawtooth rumble sweep downward (80 Hz → 30 Hz, 350 ms) |
| `victory` | Win result screen appears | Ascending arpeggio: C5 → E5 → G5 → C6, sine, 4 notes × 120 ms apart |
| `defeat` | Lose result screen appears | Descending sine tone drop (440 Hz → 110 Hz, 650 ms) |

### SFX trigger locations

| SFX | PvP | PvE |
|---|---|---|
| `playerAttack` | On player strike or realm offensive | On player strike or realm offensive |
| `hit` | On incoming opponent projectile arrival | On boss projectile hitting the local player |
| `dodge` | On player brace action | *(not used)* |
| `bossAttack` | *(not used)* | On boss firing a projectile |
| `victory` | On win result screen | On win result screen |
| `defeat` | On lose result screen | On lose result screen |

### SFX synthesis parameters (web reference — use as target for Godot port)

#### `playerAttack`
```
Oscillator: sine
Frequency: 400 Hz → 900 Hz over 120 ms (linear ramp)
Gain: 0.4 × sfxVolume → 0 over 150 ms
Duration: 150 ms
```

#### `hit`
```
// Noise component
White noise buffer: 80 ms
Low-pass filter: 1200 Hz cutoff
Gain: 0.5 × sfxVolume → 0 over 80 ms

// Thud component
Oscillator: sine
Frequency: 120 Hz → 40 Hz over 100 ms (linear ramp)
Gain: 0.6 × sfxVolume → 0 over 120 ms
```

#### `dodge`
```
Oscillator: square
Frequency: 300 Hz → 600 Hz over 80 ms (linear ramp)
Gain: 0.25 × sfxVolume → 0 over 100 ms
Duration: 100 ms
```

#### `bossAttack`
```
Oscillator: sawtooth
Frequency: 80 Hz → 30 Hz over 300 ms (linear ramp)
Gain: 0.5 × sfxVolume → 0 over 350 ms
Duration: 350 ms
```

#### `victory`
```
4 notes played sequentially, 120 ms apart:
  C5 (523.25 Hz), E5 (659.25 Hz), G5 (783.99 Hz), C6 (1046.50 Hz)
Each note: sine oscillator
  Attack: 0 → 0.4 × sfxVolume over 30 ms
  Release: 0.4 × sfxVolume → 0 over 200 ms (170 ms after attack)
  Duration: 220 ms per note
```

#### `defeat`
```
Oscillator: sine
Frequency: 440 Hz → 110 Hz over 600 ms (linear ramp)
Gain: 0.4 × sfxVolume → 0 over 650 ms
Duration: 650 ms
```

## 5. Volume Controls

Shown as an overlay on game screens (map, PvP battle, PvE raid).
**Not** shown on landing, prep screens, or result screens.

| Control | Range | Default | Persistence |
|---|---|---|---|
| BGM volume | 0.0 – 1.0 (step 0.05) | 0.5 | Saved to local storage |
| SFX volume | 0.0 – 1.0 (step 0.05) | 0.5 | Saved to local storage |

Layout: top-right corner overlay, semi-transparent.
```
[♪ BGM ████░░]  [◈ SFX ████░░]
```

Each control has:
- A slider for continuous adjustment.
- A mute icon button: snaps volume to 0; clicking again restores the previous value.

Volume changes take effect immediately (no confirmation needed).

### Web storage keys (reference)
- BGM: `ws_bgm_volume`
- SFX: `ws_sfx_volume`

In Godot, persist to a config file (e.g. `user://settings.cfg`) instead of
localStorage.

## 6. Desktop Port — Godot Considerations

The web version uses the Web Audio API. Godot equivalents:

| Web concept | Godot equivalent |
|---|---|
| `<audio>` element + `GainNode` | `AudioStreamPlayer` with `AudioStreamMP3` |
| 1s crossfade via `GainNode.linearRampToValueAtTime` | `Tween` animating `AudioStreamPlayer.volume_db` |
| Singleton class (`audioManager`) | Autoload singleton (`AudioManager.gd`) |
| `AudioContext` + `OscillatorNode` for SFX | `AudioStreamGenerator` filled with synthesized PCM, or pre-rendered short WAV files |
| `localStorage` volume persistence | `ConfigFile` saved to `user://settings.cfg` |
| `AudioControls` React component | Godot `Control` node (e.g. `HBoxContainer` with `HSlider` nodes) |

**BGM crossfade in Godot:**
Use two `AudioStreamPlayer` nodes. Fade out the current one while fading in the
next with a `Tween`. Swap which player is "active" after the fade completes.

**SFX synthesis in Godot:**
Option A (recommended for accuracy): Pre-render each SFX as a short WAV file
using the synthesis parameters in §4, import as `AudioStreamWAV`.
Option B: Implement synthesis at runtime using `AudioStreamGenerator` and fill
PCM buffers — more complex, matches the web approach exactly.

**Autoplay policy:**
In Godot desktop there is no browser autoplay restriction — BGM can start
immediately on scene load without waiting for user interaction.

## 7. Out of Scope

- Spatial / positional audio (3D sound)
- Dynamic music (layering stems based on game state)
- Audio on prep screens (PvP prep, PvE prep)
- Separate audio settings page (controls are in the in-game overlay only)
- Voice acting or narration

## 8. Dependencies

- **Battle System** (`battle-system.md`) — `playerAttack`, `hit`, `dodge` SFX
  triggered at action sites; `win`/`lose` BGM on result.
- **Boss/PvE System** (`boss-pve-system.md`) — `bossAttack`, `hit` SFX at boss
  fire and player hit events; `win`/`lose` BGM on raid result.
- **Map System** (`map-system.md`) — `map` BGM plays on the world map screen.

## 9. Tuning Knobs

| Knob | Current Value | Notes |
|---|---|---|
| Crossfade duration | 1.0 s | Raise for smoother transitions; lower for snappier |
| Default BGM volume | 0.5 | Adjust based on music loudness |
| Default SFX volume | 0.5 | |
| `playerAttack` frequency range | 400–900 Hz | Higher top = more piercing |
| `bossAttack` frequency range | 80–30 Hz | Lower = more threatening |
| `victory` arpeggio tempo | 120 ms between notes | Lower = snappier fanfare |
| `defeat` drop duration | 650 ms | Longer = more dramatic |

## 10. Acceptance Criteria

- [ ] `landing` BGM plays on the title screen; `map` BGM plays on the world map; `pvp` BGM plays in PvP battle; `pve` BGM plays in boss raid.
- [ ] Switching screens crossfades BGM over 1 second with no audible pop.
- [ ] Requesting the current track again does not restart or stutter it.
- [ ] `win` BGM plays once and stops after a victory; does not loop.
- [ ] `lose` BGM plays once and stops after a defeat; does not loop.
- [ ] `playerAttack` SFX plays when the local player fires any projectile.
- [ ] `hit` SFX plays when a projectile lands on a target.
- [ ] `dodge` SFX plays when the player braces (PvP only).
- [ ] `bossAttack` SFX plays when the boss fires a projectile (PvE only).
- [ ] `victory` SFX plays as an ascending arpeggio on the win screen.
- [ ] `defeat` SFX plays as a descending tone drop on the lose screen.
- [ ] BGM and SFX volume sliders are visible on map, PvP, and PvE screens; not on landing or prep screens.
- [ ] Moving the BGM slider immediately adjusts music volume.
- [ ] Mute button snaps volume to 0; pressing again restores previous level.
- [ ] Volume settings persist between sessions (config file / local storage).
- [ ] SFX at volume 0 produce no audible output.
