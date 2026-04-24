# Phase 5: Boss PvE Arena

> **Goal:** Walking into the boss lair opens a PvE raid against the tier's boss.
> Up to 3 players; boss uses timed normal attacks + realm special skills; 
> gold distributed to alive players on victory.

**Architecture (same pattern as Phase 4):**
- `BossArena.tscn` — CanvasLayer (layer=5), same structure as PvPArena
- WorldScene adds it as a child when boss lair entered; WorldMap hidden
- ResultScreen reused for win/lose display
- BossData: static const dictionary — no resource file needed

**Boss damage formula (GDD §4):**
```
// Normal attack
effectiveDefence = player.defence × debuff_multiplier
dmg = max(1, boss.attack − effectiveDefence)

// Skill (multiplier-based)  
dmg = max(1, boss.attack × multiplier − player.effectiveDefence)

// DoT (Necrotic Touch)
perTick = max(1, boss.attack × 0.15)  — 5 ticks × 1000 ms
```

Note: Boss uses *subtraction* formula (not the PvP percentile formula).
PvP: `attack × (100 / (100 + def))`. PvE: `attack − defence`. Verified from GDD.

---

## File Map

```
desktop/
├── src/
│   ├── core/
│   │   ├── boss_data.gd           ← NEW: 15-boss static table + skill definitions
│   │   └── battle_manager.gd      ← UPDATE: add boss damage statics
│   └── world/
│       └── boss_arena.gd          ← NEW: boss AI timers, player HP bars, actions
├── scenes/
│   └── world/
│       └── BossArena.tscn         ← NEW: CanvasLayer arena UI
└── tests/unit/
    └── test_boss_manager.gd       ← NEW: boss formula, targeting, DoT, skill routing
```

---

## Task 1 — BossData

Static const dictionary. Keyed by tier name.

```gdscript
class_name BossData
extends RefCounted

const BOSSES: Dictionary = {
    "Apprentice": { "name": "The Hollow Golem",     "realm": "tech",
        "hp": 3120,  "attack": 220,  "defence": 70,  "atk_ms": 3000, "skill_ms": 12000, "gold": 100 },
    "Initiate":   { "name": "Sable Witch",          "realm": "academia",
        "hp": 4430,  "attack": 290,  "defence": 100, "atk_ms": 2800, "skill_ms": 11000, "gold": 170 },
    # ... all 15 ...
}

const SKILLS: Dictionary = {
    "academia": { "name": "Countermeasure",   "effect": "defence_debuff",  "mult": 0.0,
                  "debuff_frac": 0.30, "duration_ms": 5000, "targets_all": true },
    "tech":     { "name": "System Overload",  "effect": "aoe_damage",      "mult": 1.4,
                  "debuff_frac": 0.0,  "duration_ms": 0,    "targets_all": true },
    "medicine": { "name": "Necrotic Touch",   "effect": "dot",             "mult": 0.15,
                  "debuff_frac": 0.0,  "duration_ms": 5000, "targets_all": false },
    "creative": { "name": "Viral Despair",    "effect": "attack_debuff",   "mult": 0.0,
                  "debuff_frac": 0.25, "duration_ms": 6000, "targets_all": true },
    "law":      { "name": "Absolute Verdict", "effect": "single_damage",   "mult": 2.2,
                  "debuff_frac": 0.0,  "duration_ms": 0,    "targets_all": false },
}
```

---

## Task 2 — BattleManager additions (boss statics)

```gdscript
# Boss normal attack damage to one player
static func boss_normal_damage(boss_attack: int, player: BattleState) -> int:
    var eff_def: float = player.effective_defence()
    return max(1, boss_attack - int(eff_def))

# Boss skill damage (multiplier-based, uses subtraction formula)
static func boss_skill_damage(boss_attack: int, multiplier: float,
        player: BattleState) -> int:
    var eff_def: float = player.effective_defence()
    return max(1, int(round(boss_attack * multiplier)) - int(eff_def))

# DoT tick damage
static func boss_dot_tick(boss_attack: int) -> int:
    return max(1, int(round(boss_attack * 0.15)))

# Pick boss normal attack target per AI rules (§3.3)
static func pick_normal_target(players: Array[BattleState]) -> BattleState:
    var alive: Array[BattleState] = players.filter(func(p): return not p.is_dead())
    if alive.is_empty():
        return null
    # Priority 1: below 30% HP (skip brace check)
    var low_hp: Array[BattleState] = alive.filter(func(p): return p.current_hp < p.max_hp * 0.30)
    if not low_hp.is_empty():
        return low_hp.reduce(func(a, b): return a if a.current_hp < b.current_hp else b)
    # Priority 2: non-bracing
    var non_bracing: Array[BattleState] = alive.filter(func(p): return not p.is_bracing)
    var pool: Array[BattleState] = non_bracing if not non_bracing.is_empty() else alive
    return pool[0]  # round-robin handled by caller rotating the array

# Pick boss skill target per AI rules (§3.4)
static func pick_skill_target(players: Array[BattleState],
        targets_all: bool, effect: String) -> Array[BattleState]:
    var alive: Array[BattleState] = players.filter(func(p): return not p.is_dead())
    if alive.is_empty():
        return []
    if targets_all:
        return alive
    if effect == "dot":  # highest attack (most threatening)
        var target: BattleState = alive.reduce(
            func(a, b): return a if a.attack > b.attack else b)
        return [target]
    # lowest HP
    var target: BattleState = alive.reduce(
        func(a, b): return a if a.current_hp < b.current_hp else b)
    return [target]
```

---

## Task 3 — BossArena scene + script

### Node tree
```
BossArena (CanvasLayer, layer=5)
└── ArenaPanel (Control, full-rect)
    ├── Background (ColorRect #1a0a0a)
    ├── BossNameLabel (Label)        — boss name + tier
    ├── BossHPBar (ProgressBar)      — wide, top-center
    ├── BossHPLabel (Label)
    ├── BossSkillLabel (Label)       — "Skill ready!" / countdown
    ├── PlayerRows (VBoxContainer)   — up to 3 player HP rows
    │   ├── PlayerRow0 (HBoxContainer) → NameLabel + HPBar + HPLabel
    │   ├── PlayerRow1
    │   └── PlayerRow2
    ├── ActionButtons (HBoxContainer)
    │   ├── StrikeBtn
    │   ├── BraceBtn
    │   └── RealmBtn
    ├── StatusLabel (Label)          — debuff/stun notices
    ├── ProjectileLayer (Node2D)
    └── WaitingLabel (Label)         — "Entering lair…" (brief)
```

### Script key behaviors

**`_ready`:**
- Load boss from `BossData.BOSSES[PlayerData.tier]`
- Init `_boss_hp = boss.hp`; set HP bar max
- Init local player's BattleState from `PlayerData.battle_*`
- Phase 5: solo only — no Realtime party join yet
- Start after 1s simulated ready delay
- `AudioManager.play_bgm("pve")`

**`_process(delta)`:**
- Accumulate `_atk_timer` and `_skill_timer` (ms)
- When `_atk_timer >= boss.atk_ms`: fire normal attack, reset timer
- When `_skill_timer >= boss.skill_ms`: fire skill, reset timer
- Poll realm btn cooldown

**Normal attack:**
```
target = BattleManager.pick_normal_target([local_state])
dmg = BattleManager.boss_normal_damage(boss.attack, target)
target.current_hp -= dmg
spawn projectile "tentacle" from boss pos to target token
refresh player HP bar
check defeat
```

**Skill:**
```
skill_def = BossData.SKILLS[boss.realm]
targets = BattleManager.pick_skill_target([local_state], skill_def)
match skill_def.effect:
    "aoe_damage" / "single_damage":
        for each target:
            dmg = BattleManager.boss_skill_damage(boss.attack, skill_def.mult, target)
            target.current_hp -= dmg
            spawn boss realm projectile
    "defence_debuff":
        for each target:
            apply defence_debuff (×(1 - debuff_frac), duration_ms)
    "attack_debuff":
        for each target:
            apply attack_debuff (×(1 - debuff_frac), duration_ms)
    "dot":
        start DoT coroutine on target (5 ticks × 1000 ms)
```

**DoT coroutine:**
```gdscript
func _apply_dot(target: BattleState, per_tick: int) -> void:
    for i in range(5):
        await get_tree().create_timer(1.0).timeout
        if target.is_dead() or _battle_over:
            return
        target.current_hp = max(0, target.current_hp - per_tick)
        _refresh_player_hp(0)
        _check_defeat()
```

**Player actions (same as PvPArena):**
- Strike: `BattleManager.calc_damage(local, boss_as_state, 1.0)` → subtract from `_boss_hp`
- Brace: toggle `local_state.is_bracing`
- Realm skill: `BattleManager.apply_realm_skill(local, boss_as_state)` but in PvE:
  - medicine heals self (Phase 5 single-player; ally-select deferred to Phase 5 networking)
  - all others apply as normal

**Boss-as-state adapter:**
BossArena holds a lightweight `_boss_proxy: BattleState` with `attack = boss.attack`,
`defence = boss.defence`, `max_hp = boss.hp`, `current_hp = _boss_hp`.
This lets `BattleManager.calc_damage()` (PvP formula) be reused for player→boss hits.
Boss defence uses the same PvP formula (percentile) for player strikes — only boss→player
hits use the subtraction formula.

**Victory:** `_boss_hp <= 0` → `PlayerData.gold += boss.gold` → `battle_ended.emit(true, boss.gold, PlayerData.gold)`
**Defeat:** all local players dead → `battle_ended.emit(false, 0, PlayerData.gold)`

**Boss token positions (800×500 arena):**
- Boss: center top area (400, 120)
- LocalPlayer token: (400, 380)

---

## Task 4 — WorldScene update

Replace `_on_boss_lair()` stub:
```gdscript
func _on_boss_lair() -> void:
    _open_boss_arena()

func _open_boss_arena() -> void:
    world_map.visible = false
    if _local_player != null:
        _local_player.visible = false
    _pvp_arena = BOSS_ARENA_SCENE.instantiate()
    add_child(_pvp_arena)
    GameManager.enter_pve_arena()
    _pvp_arena.battle_ended.connect(_on_battle_ended)
    # _on_battle_ended is shared with PvP (same ResultScreen flow)
```

Also add `GameManager.enter_pve_arena()` → `State.PVE_ARENA`.

---

## Task 5 — Unit tests

`tests/unit/test_boss_manager.gd`:
- `test_boss_normal_damage_basic` — attack 220, defence 70 → dmg 150
- `test_boss_normal_damage_min_1` — attack 10, defence 500 → dmg 1
- `test_boss_skill_damage_multiplier` — attack 220 × 1.4 → 308 − def
- `test_boss_dot_tick` — attack 220 × 0.15 = 33
- `test_pick_normal_target_prefers_low_hp` — player below 30% is chosen
- `test_pick_normal_target_prefers_non_bracing` — bracing player skipped
- `test_pick_skill_target_aoe_returns_all_alive`
- `test_pick_skill_target_dot_picks_highest_attack`
- `test_pick_skill_target_single_picks_lowest_hp`
- `test_all_bosses_have_valid_data` — iterate BOSSES dict, assert HP > 0 etc.

---

## Deliverable

At the end of Phase 5:
- Walking into boss lair → BossArena opens with correct boss for player's tier
- Boss fires normal attacks on timer, skill on longer timer
- All 5 boss realm skills apply correctly (AoE damage, DoT, debuffs)
- Player can Strike, Brace, use Realm Skill against boss
- Victory: gold added to PlayerData, ResultScreen shows reward
- Defeat: ResultScreen shows 0 gold
- BGM: pve track during raid, win/lose on result

**Not in Phase 5 (deferred):**
- Multi-player party joining via Realtime (Phase 3 infra exists; wiring needs live creds)
- Medicine ally-select UI (deferred with multi-player)
- Broadcast upgrade UI — Phase 6
