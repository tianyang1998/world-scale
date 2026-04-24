# Phase 4: PrepScreen + PvP Arena + Projectiles + ResultScreen

> **Goal:** A full PvP match is playable end-to-end.
> Player accepts a challenge → PrepScreen allocates stats → PvP arena with
> real-time projectile combat → ResultScreen shows outcome + gold delta →
> returns to WorldScene.

**Architecture (from architecture doc §3.3):**
- PrepScreen: additive CanvasLayer overlay on WorldScene (world stays loaded)
- PvPArena: `add_child()` sub-scene into WorldScene; WorldMap3D hidden, not freed
- ResultScreen: CanvasLayer overlay on top of arena
- Tear-down: ResultScreen removed → arena sub-scene freed → WorldMap3D visible again

---

## File Map

```
desktop/
├── src/
│   ├── core/
│   │   ├── battle_state.gd         ← NEW: BattleState class (stats, debuffs, HP)
│   │   ├── battle_manager.gd       ← NEW: damage formula, action resolution, gold calc
│   │   └── game_manager.gd         ← UPDATE: add PvP state transitions
│   ├── ui/
│   │   ├── prep_screen.gd          ← NEW: stat slider logic
│   │   └── result_screen.gd        ← NEW: win/lose display, gold delta
│   └── world/
│       ├── pvp_arena.gd            ← NEW: arena setup, action buttons, HP sync loop
│       ├── projectile.gd           ← NEW: 12-kind travel + hit detection
│       └── world_scene.gd          ← UPDATE: challenge modal + arena lifecycle
├── scenes/
│   ├── ui/
│   │   ├── PrepScreen.tscn         ← NEW
│   │   └── ResultScreen.tscn       ← NEW
│   ├── world/
│   │   └── PvPArena.tscn           ← NEW (2D overlay arena UI + 3D stub)
│   └── shared/
│       └── Projectile.tscn         ← NEW: Area3D + MeshInstance3D
└── tests/unit/
    └── test_battle_manager.gd      ← NEW: damage formula, gold transfer, debuffs
```

---

## Task 1 — BattleState resource

Holds the mutable in-match state for one fighter.

```gdscript
class_name BattleState
extends RefCounted

var user_id: String
var player_name: String
var realm: String

# Allocated on PrepScreen
var max_hp: int
var attack: int
var defence: int
var current_hp: int

# Debuff slots — { multiplier: float, expires_at_ms: int }
var defence_debuff: Dictionary = {}
var attack_debuff: Dictionary = {}

# Stun
var stun_expires_at_ms: int = 0

# Brace flag
var is_bracing: bool = false

# Realm skill cooldown
var realm_skill_last_used_ms: int = 0

func is_stunned() -> bool:
    return Time.get_ticks_msec() < stun_expires_at_ms

func effective_defence() -> float:
    var mult: float = defence_debuff.get("multiplier", 1.0)
    var exp: int = defence_debuff.get("expires_at_ms", 0)
    if Time.get_ticks_msec() >= exp:
        mult = 1.0
    return defence * mult

func effective_attack() -> float:
    var mult: float = attack_debuff.get("multiplier", 1.0)
    var exp: int = attack_debuff.get("expires_at_ms", 0)
    if Time.get_ticks_msec() >= exp:
        mult = 1.0
    return attack * mult
```

---

## Task 2 — BattleManager (damage formula + gold calc)

Pure logic — no nodes, no scene. Stateless static methods.

```gdscript
class_name BattleManager
extends Node   # autoload-friendly but not registered as one

const SKILL_MULTIPLIERS: Dictionary = {
    "strike": 1.0,
    "commit_storm": 1.8,
    "viral_work": 1.2,
    "realm_offensive": 1.0,
}

const SKILL_COOLDOWNS_MS: Dictionary = {
    "academia": 4000, "tech": 4000, "medicine": 4000,
    "creative": 3000, "law": 4000
}

static func calc_damage(attacker: BattleState, defender: BattleState,
                         skill_mult: float) -> int:
    var eff_def: float = defender.effective_defence()
    var raw: float = attacker.effective_attack() * skill_mult \
                     * (100.0 / (100.0 + eff_def))
    var reduction: float = 0.70 if defender.is_bracing else 1.0
    return max(1, int(round(raw * reduction)))

static func calc_gold_transfer(loser_gold: int) -> int:
    if loser_gold < 50:
        return loser_gold
    return max(50, min(500, int(floor(loser_gold * 0.10))))

static func apply_debuff(target: BattleState, debuff_type: String,
                          multiplier: float, duration_ms: int) -> void:
    var entry: Dictionary = {
        "multiplier": multiplier,
        "expires_at_ms": Time.get_ticks_msec() + duration_ms
    }
    match debuff_type:
        "defence":
            target.defence_debuff = entry
        "attack":
            target.attack_debuff = entry

static func apply_stun(target: BattleState, duration_ms: int) -> void:
    target.stun_expires_at_ms = Time.get_ticks_msec() + duration_ms

static func apply_realm_skill(actor: BattleState, target: BattleState,
                               realm: String) -> Dictionary:
    # Returns { damage, heal, debuff_type, stun } for broadcast/display.
    var result: Dictionary = {"damage": 0, "heal": 0, "stun": false, "debuff_type": ""}
    match realm:
        "academia":
            apply_debuff(target, "defence", 0.75, 2000)
            result["debuff_type"] = "defence"
        "tech":
            result["damage"] = calc_damage(actor, target, 1.8)
        "medicine":
            var heal: int = int(actor.max_hp * 0.20)
            actor.current_hp = min(actor.max_hp, actor.current_hp + heal)
            result["heal"] = heal
        "creative":
            result["damage"] = calc_damage(actor, target, 1.2)
            if randf() < 0.30:
                apply_stun(target, 1000)
                result["stun"] = true
        "law":
            apply_debuff(target, "attack", 0.80, 3000)
            result["debuff_type"] = "attack"
    actor.realm_skill_last_used_ms = Time.get_ticks_msec()
    return result
```

---

## Task 3 — PrepScreen

### Node tree

```
PrepScreen (CanvasLayer, layer=10)
└── Panel (Control, centered, 480×420)
    ├── Title (Label)               "Allocate Your Power"
    ├── PowerLabel (Label)          "Power: 5000"
    ├── HPRow (HBoxContainer)
    │   ├── Label "HP"
    │   ├── HPSlider (HSlider)
    │   └── HPValue (Label)
    ├── AttackRow (HBoxContainer)   (same pattern)
    ├── DefenceRow (HBoxContainer)  (same pattern)
    ├── RemainingLabel (Label)      "Remaining: 0"  ← turns red if ≠ 0
    ├── ErrorLabel (Label)          "" — shows validation errors
    └── ConfirmBtn (Button)         "Enter Battle"
```

### Script: `src/ui/prep_screen.gd`

Key behaviors:
- Reads `PlayerData.total_power` and sets slider max = power − (2 × min)
- Each slider min = floor(power × 0.10)
- On any slider change: update RemainingLabel = power − HP − Attack − Defence
- ConfirmBtn disabled unless remaining == 0 and all stats ≥ minimum
- On Confirm: writes to `PlayerData.battle_hp/attack/defence`, calls
  `GameManager.enter_pvp_arena(opponent_id, battle_id)`, hides self

Signal: `confirmed` — emitted when ConfirmBtn pressed (WorldScene listens).

---

## Task 4 — Projectile scene + script

### Coordinate mapping
Arena is a 2D CanvasLayer overlay. Projectile positions use arena-local 2D
coordinates (pixels, origin top-left). Arena size: 800×500 px.

### Node tree
```
Projectile (Node2D)
└── (drawn procedurally in _draw — no MeshInstance needed for 2D arena)
```

### Script: `src/world/projectile.gd`

```gdscript
class_name Projectile
extends Node2D

# Configured at creation via init()
var kind: String
var origin: Vector2
var target_pos: Vector2
var target_id: String
var damage: int
var speed: float       # px/ms
var hit_radius: float
var no_dodge: bool
var color: Color
var trail_color: Color
var size: float

var age_ms: float = 0.0
var max_age_ms: float = 0.0
var hit: bool = false
var total_dist: float = 0.0

signal hit_landed(target_id: String, damage: int, kind: String)

const BASE_SPEED: float = 0.25  # px/ms = 250 px/s

const KIND_DATA: Dictionary = {
    "sword":      {"speed_mult": 1.3, "size": 8.0,  "hit_r": 16.0, "no_dodge": false, "color": "#e8e0f0"},
    "orb":        {"speed_mult": 1.0, "size": 9.0,  "hit_r": 14.0, "no_dodge": false, "color": "#9b72cf"},
    "lightning":  {"speed_mult": 1.4, "size": 7.0,  "hit_r": 14.0, "no_dodge": false, "color": "#EF9F27"},
    "heal_pulse": {"speed_mult": 1.0, "size": 10.0, "hit_r": 20.0, "no_dodge": true,  "color": "#1D9E75"},
    "paint":      {"speed_mult": 1.0, "size": 11.0, "hit_r": 16.0, "no_dodge": false, "color": "#cf7272"},
    "verdict":    {"speed_mult": 1.2, "size": 7.0,  "hit_r": 12.0, "no_dodge": false, "color": "#BA7517"},
    "tentacle":   {"speed_mult": 0.9, "size": 12.0, "hit_r": 18.0, "no_dodge": false, "color": "#cf3333"},
    "beam_pulse": {"speed_mult": 1.0, "size": 10.0, "hit_r": 16.0, "no_dodge": false, "color": "#b44cf0"},
    "missile":    {"speed_mult": 1.4, "size": 8.0,  "hit_r": 14.0, "no_dodge": false, "color": "#EF9F27"},
    "dark_orb":   {"speed_mult": 0.8, "size": 11.0, "hit_r": 16.0, "no_dodge": false, "color": "#6b2fa0"},
    "spiral":     {"speed_mult": 0.85,"size": 13.0, "hit_r": 18.0, "no_dodge": false, "color": "#e85d5d"},
    "gavel":      {"speed_mult": 1.1, "size": 14.0, "hit_r": 20.0, "no_dodge": false, "color": "#d4a017"},
}

func init(p_kind: String, p_origin: Vector2, p_target: Vector2,
          p_target_id: String, p_damage: int) -> void:
    kind = p_kind
    origin = p_origin
    target_pos = p_target
    target_id = p_target_id
    damage = p_damage
    position = origin

    var data: Dictionary = KIND_DATA.get(kind, KIND_DATA["orb"])
    speed = BASE_SPEED * float(data["speed_mult"])
    size = float(data["size"])
    hit_radius = float(data["hit_r"])
    no_dodge = bool(data["no_dodge"])
    color = Color(data["color"])
    trail_color = color.darkened(0.4)

    total_dist = origin.distance_to(target_pos)
    if total_dist < 0.001:
        hit = true
        return
    max_age_ms = (total_dist / speed) * 1.2

func _process(delta: float) -> void:
    if hit:
        queue_free()
        return
    age_ms += delta * 1000.0
    if age_ms >= max_age_ms:
        queue_free()
        return
    var t: float = min(age_ms * speed / total_dist, 1.0)
    position = origin.lerp(target_pos, t)
    queue_redraw()
    _check_hit()

func _check_hit() -> void:
    # target_current_pos is updated externally if dodgeable;
    # for no_dodge we compare to fixed target_pos.
    var check_pos: Vector2 = target_pos
    if position.distance_to(check_pos) < hit_radius:
        hit = true
        hit_landed.emit(target_id, damage, kind)
        queue_free()

func _draw() -> void:
    var alpha: float = max(0.0, 1.0 - age_ms / max_age_ms) if max_age_ms > 0.0 else 1.0
    modulate.a = alpha
    match kind:
        "sword":
            _draw_sword()
        "lightning", "missile":
            _draw_lightning()
        "verdict", "gavel":
            _draw_verdict()
        "heal_pulse":
            _draw_heal_pulse()
        "spiral":
            _draw_spiral()
        "tentacle":
            _draw_orb()  # fallback; tentacle bezier is Phase 8 polish
        _:
            _draw_orb()

func _draw_orb() -> void:
    draw_circle(Vector2.ZERO, size * 1.6, trail_color)
    draw_circle(Vector2.ZERO, size, color)
    draw_circle(Vector2.ZERO, size * 0.3, Color.WHITE)

func _draw_sword() -> void:
    var dir: Vector2 = (target_pos - origin).normalized() if total_dist > 0.0 else Vector2.RIGHT
    var half: Vector2 = dir * 12.0
    draw_line(-half, half, Color(1, 1, 1, 0.4), 6.0)
    draw_line(-half, half, color, 3.0)

func _draw_lightning() -> void:
    var dir: Vector2 = (target_pos - origin).normalized() if total_dist > 0.0 else Vector2.RIGHT
    var pts: PackedVector2Array = PackedVector2Array()
    var seg_len: float = size * 2.0
    for i in range(5):
        var base: Vector2 = dir * (seg_len * i)
        var perp: Vector2 = dir.rotated(PI / 2.0) * randf_range(-size, size)
        pts.append(base + perp)
    for i in range(pts.size() - 1):
        draw_line(pts[i], pts[i + 1], color, 2.0)
    draw_circle(pts[-1], size * 0.4, Color.WHITE)

func _draw_verdict() -> void:
    var dir: Vector2 = (target_pos - origin).normalized() if total_dist > 0.0 else Vector2.RIGHT
    var tip: Vector2 = dir * size * 2.0
    draw_line(Vector2.ZERO, tip, Color(color.r, color.g, color.b, 0.35), size * 1.2)
    draw_line(Vector2.ZERO, tip, color, 2.0)
    draw_circle(tip, size * 0.5, color)

func _draw_heal_pulse() -> void:
    var arm: float = size * 1.4
    draw_line(Vector2(-arm, 0), Vector2(arm, 0), color, 3.0)
    draw_line(Vector2(0, -arm), Vector2(0, arm), color, 3.0)
    draw_arc(Vector2.ZERO, size * 1.8, 0, TAU, 16, Color(color.r, color.g, color.b, 0.4), 2.0)

func _draw_spiral() -> void:
    var t_norm: float = age_ms / max_age_ms if max_age_ms > 0.0 else 0.0
    for i in range(3):
        var angle: float = t_norm * TAU * 4.0 + i * (TAU / 3.0)
        var p: Vector2 = Vector2(cos(angle), sin(angle)) * size * 1.2
        draw_circle(p, size * 0.35, color)
    draw_circle(Vector2.ZERO, size * 0.4, color)
```

---

## Task 5 — PvPArena scene + script

Arena is a **CanvasLayer** at layer=5 (above world, below PrepScreen/Result).
It contains a 2D view of the battle: two fighter tokens, action buttons, HP bars,
and a projectile container node.

### Node tree

```
PvPArena (CanvasLayer, layer=5)
└── ArenaPanel (Control, full-rect)
    ├── Background (ColorRect, #1a1a2e)
    ├── LocalToken (Control, 80×80)  ← circular fighter graphic (left side)
    ├── OpponentToken (Control)      ← right side
    ├── LocalHPBar (ProgressBar)
    ├── OpponentHPBar (ProgressBar)
    ├── LocalHPLabel (Label)
    ├── OpponentHPLabel (Label)
    ├── ActionButtons (HBoxContainer)
    │   ├── StrikeBtn (Button)       "⚔ Strike"
    │   ├── BraceBtn (Button)        "🛡 Brace"
    │   └── RealmBtn (Button)        "✦ [realm skill name]"
    ├── StatusLabel (Label)          debuff / stun notice
    ├── ProjectileLayer (Node2D)     ← projectiles added here
    └── WaitingLabel (Label)        "Waiting for opponent…" (shown before both join)
```

### Script: `src/world/pvp_arena.gd`

Key behaviors:
- On `_ready`: subscribe to `battle:{battle_id}` Realtime channel via
  NetworkManager; show WaitingLabel; presence phase: `waiting`
- When presence count reaches 2: hide WaitingLabel, enable action buttons
- StrikeBtn pressed: call `_do_action("strike", 1.0)`
- BraceBtn pressed: toggle `local_state.is_bracing`; broadcast `brace` event
- RealmBtn pressed: check cooldown; call `BattleManager.apply_realm_skill()`
- `_do_action(type, mult)`: calculate damage, broadcast `projectile` event,
  spawn Projectile locally traveling toward opponent token
- On `projectile` broadcast received: spawn Projectile traveling toward local token;
  on hit: apply damage, broadcast `hp_sync`
- On `hp_sync` received: update remote HP bar
- On local HP hits 0: call `POST /api/battle/end`, broadcast `battle_end`
- On `battle_end` received: show ResultScreen

Token positions (arena 800×500):
- LocalToken center: (150, 250)
- OpponentToken center: (650, 250)

---

## Task 6 — ResultScreen

### Node tree

```
ResultScreen (CanvasLayer, layer=20)
└── Panel (Control, centered, 480×300)
    ├── OutcomeLabel (Label)    "Victory!" / "Defeat"
    ├── GoldDeltaLabel (Label)  "+240 gold" / "-240 gold"
    ├── NewGoldLabel (Label)    "Gold: 740"
    └── ContinueBtn (Button)    "Return to World"
```

### Script: `src/ui/result_screen.gd`

```gdscript
signal continue_pressed

func show_result(won: bool, gold_delta: int, new_gold: int) -> void:
    outcome_label.text = "Victory!" if won else "Defeat"
    outcome_label.modulate = Color("#ffdd44") if won else Color("#ff4444")
    gold_delta_label.text = ("+" if gold_delta >= 0 else "") + str(gold_delta) + " gold"
    new_gold_label.text = "Gold: " + str(new_gold)

func _on_continue_btn_pressed() -> void:
    continue_pressed.emit()
```

---

## Task 7 — GameManager + WorldScene updates

### GameManager additions
```gdscript
var current_battle_id: String = ""
var current_opponent_id: String = ""

const PREP_SCENE = "res://scenes/ui/PrepScreen.tscn"
const PVP_ARENA_SCENE = "res://scenes/world/PvPArena.tscn"
const RESULT_SCENE = "res://scenes/ui/ResultScreen.tscn"

func start_pvp_prep(opponent_id: String, battle_id: String) -> void:
    current_state = State.PVP_PREP
    current_battle_id = battle_id
    current_opponent_id = opponent_id
    # WorldScene adds PrepScreen as child (it owns the scene tree reference)

func enter_pvp_arena() -> void:
    current_state = State.PVP_ARENA

func show_result(won: bool, gold_delta: int, new_gold: int) -> void:
    current_state = State.RESULT

func return_to_world() -> void:
    current_state = State.WORLD
    current_battle_id = ""
    current_opponent_id = ""
```

### WorldScene additions (challenge modal → PrepScreen flow)
```gdscript
var _prep_screen: CanvasLayer = null
var _pvp_arena: CanvasLayer = null
var _result_screen: CanvasLayer = null

func _on_challenge_received(from_id, from_name, battle_id) -> void:
    # Show accept/decline popup (simple AcceptDialog)
    var dialog := AcceptDialog.new()
    dialog.title = "Challenge!"
    dialog.dialog_text = from_name + " challenges you to a duel!"
    add_child(dialog)
    dialog.confirmed.connect(func():
        dialog.queue_free()
        _open_prep_screen(from_id, battle_id)
    )
    dialog.canceled.connect(func(): dialog.queue_free())
    dialog.popup_centered()

func _open_prep_screen(opponent_id: String, battle_id: String) -> void:
    GameManager.start_pvp_prep(opponent_id, battle_id)
    _prep_screen = PREP_SCREEN_SCENE.instantiate()
    add_child(_prep_screen)
    _prep_screen.confirmed.connect(_on_prep_confirmed)

func _on_prep_confirmed() -> void:
    _prep_screen.queue_free()
    _prep_screen = null
    world_map.visible = false
    _pvp_arena = PVP_ARENA_SCENE.instantiate()
    add_child(_pvp_arena)
    GameManager.enter_pvp_arena()
    _pvp_arena.battle_ended.connect(_on_battle_ended)

func _on_battle_ended(won: bool, gold_delta: int, new_gold: int) -> void:
    _result_screen = RESULT_SCREEN_SCENE.instantiate()
    add_child(_result_screen)
    _result_screen.show_result(won, gold_delta, new_gold)
    _result_screen.continue_pressed.connect(_on_result_continue)

func _on_result_continue() -> void:
    _result_screen.queue_free()
    _result_screen = null
    _pvp_arena.queue_free()
    _pvp_arena = null
    world_map.visible = true
    GameManager.return_to_world()
    AudioManager.play_bgm("map")
```

---

## Task 8 — Unit tests

`tests/unit/test_battle_manager.gd`:
- `test_damage_formula_basic` — known inputs produce known output
- `test_brace_reduces_damage_30_percent`
- `test_defence_debuff_reduces_effective_defence`
- `test_attack_debuff_reduces_effective_attack`
- `test_expired_debuff_has_no_effect`
- `test_gold_transfer_ten_percent`
- `test_gold_transfer_minimum_50`
- `test_gold_transfer_cap_500`
- `test_gold_transfer_below_50_loses_all`
- `test_medicine_heal_capped_at_max_hp`
- `test_commit_storm_multiplier_1_8`
- `test_minimum_damage_is_1`

---

## Deliverable

At the end of Phase 4:
- Challenge arrives → accept dialog → PrepScreen → PvP arena → projectile combat
  → ResultScreen → back to WorldScene
- All 12 projectile kinds render correctly with distinct draw shapes and colors
- Damage formula matches GDD §3.3 exactly (verified by unit tests)
- Gold transfer formula verified by unit tests
- HP sync keeps both clients consistent
- BGM switches: map → (no bgm change on PrepScreen) → arena (pvp track) →
  result (win/lose) → map on return

**Not in Phase 4 (deferred):**
- Challenger side sending the challenge (they need a UI to click another player)
- Battle channel Supabase subscription (stub: local-only for now)
- Phase 5: Boss PvE arena
- Phase 6: Store + economy UI
