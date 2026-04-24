# Phase 2: 3D WorldMap + LocalPlayer + Camera Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player who completes TitleScreen auth lands in a 3D world, can walk
around with WASD, camera follows via SpringArm3D, and the world has terrain,
a river, a bridge, collision, and `Area3D` triggers for portals, the boss lair,
and the store. Tier theme colors are applied to terrain and buildings.
No networking, no combat — just movement and exploration.

**Architecture:** `WorldScene.tscn` is the persistent 3D root. It instances
`WorldMap3D.tscn` (terrain + static world) and `LocalPlayer.tscn`
(CharacterBody3D + camera). A `WorldHUD.tscn` 2D overlay shows tier name and
gold. `GameManager` already calls `change_scene_to_file(WORLD_SCENE)`.

**Coordinate mapping:** Web map is 2400×1600 px. Scale: 1 px = 0.1 m.
3D world is therefore 240 m × 160 m (X × Z). Y is up. Player walks on Y = 0.

---

## Godot 4.6 Notes

- Jolt is the default physics engine. `CharacterBody3D` + `move_and_slide()`
  are unchanged from 4.3 — no migration needed.
- `StaticBody3D` with `CollisionShape3D` works as before.
- `Area3D` body/area entered signals are unchanged.
- `SpringArm3D` API is unchanged.
- `Label3D` with `Billboard.ENABLED` is unchanged.
- All APIs in this plan are verified against docs as of Godot 4.3 and are
  not in any post-4.3 known breaking change list.

---

## Coordinate Reference

| Web (px) | 3D (m) | Notes |
|---|---|---|
| x=0 | X=0 | West edge |
| x=2400 | X=240 | East edge |
| y=0 | Z=0 | North edge |
| y=1600 | Z=160 | South edge |
| y=1100 (river) | Z=110 | River center |
| x=900 (bridge) | X=90 | Bridge center |
| (380,320) town house 1 | (38, 32) | |
| (2050,450) boss lair | (205, 45) | |
| (50,800) left portal | (5, 80) | |
| (2350,800) right portal | (235, 80) | |
| (700,310) store | (70, 31) | |
| (1500,380) landmark | (150, 38) | |
| spawn ≈ (1200,800) | ≈ (120, 80) | Center of map |

---

## File Map

```
desktop/
├── src/
│   └── world/
│       ├── world_map_3d.gd         ← NEW: terrain + tier theming + triggers
│       └── local_player.gd         ← NEW: CharacterBody3D movement + camera
├── scenes/
│   └── world/
│       ├── WorldScene.tscn         ← REWRITE: instances map + player + HUD
│       ├── WorldMap3D.tscn         ← NEW: terrain, river, bridge, triggers
│       ├── LocalPlayer.tscn        ← NEW: CharacterBody3D + SpringArm3D
│       └── WorldHUD.tscn           ← NEW: 2D overlay (tier name, gold)
└── src/
    └── ui/
        └── world_hud.gd            ← NEW: HUD script
```

---

## Task 1: LocalPlayer scene + script

### Node tree

```
LocalPlayer (CharacterBody3D)
├── CollisionShape3D              ← CapsuleShape3D, radius=0.45, height=1.6
├── MeshInstance3D                ← CapsuleMesh placeholder, toon material
├── NameTag (Label3D)             ← Billboard, offset (0, 1.2, 0)
├── CameraRig (Node3D)            ← pivot for horizontal rotation
│   └── SpringArm3D               ← length=8, collision mask=terrain+buildings
│       └── Camera3D              ← fov=60
└── InteractHint (Label3D)        ← Billboard, offset (0, 1.8, 0), hidden
```

### Script: `src/world/local_player.gd`

Key behaviors:
- WASD movement on XZ plane, `move_and_slide()`
- Player speed: 24 m/s (240 px/s ÷ 10, matching web 4 px/frame at 60 fps)
- Player faces velocity direction (lerp, angular speed 10 rad/s)
- Camera horizontal: mouse X drag (sensitivity 0.004 rad/px) OR right-stick X
- Camera vertical: fixed at −60° tilt (no user control on vertical)
- SpringArm3D arm length: 8 m
- Mouse captured in-game, released on Escape / pause
- On `_ready`: reads `PlayerData.character_name` → sets `NameTag.text`
- Emits signal `portal_entered(direction: String)` when `Area3D` body overlaps
  (direction = "left" or "right"; handled by WorldScene)
- Emits signal `boss_range_entered()` and `store_range_entered()`

- [ ] **Step 1.1: Write `src/world/local_player.gd`**

  ```gdscript
  class_name LocalPlayer
  extends CharacterBody3D

  signal portal_entered(direction: String)
  signal boss_range_entered
  signal store_range_entered

  const SPEED: float = 24.0
  const ROTATION_SPEED: float = 10.0
  const MOUSE_SENSITIVITY: float = 0.004

  @onready var camera_rig: Node3D = $CameraRig
  @onready var name_tag: Label3D = $NameTag
  @onready var interact_hint: Label3D = $InteractHint

  func _ready() -> void:
      name_tag.text = PlayerData.character_name
      Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

  func _unhandled_input(event: InputEvent) -> void:
      if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
          camera_rig.rotate_y(-event.relative.x * MOUSE_SENSITIVITY)
      if event.is_action_pressed("ui_cancel"):
          if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
              Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
          else:
              Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

  func _physics_process(delta: float) -> void:
      var input_dir := Vector2(
          Input.get_axis("move_left", "move_right"),
          Input.get_axis("move_forward", "move_back")
      )
      var cam_basis: Basis = camera_rig.global_transform.basis
      var forward: Vector3 = -cam_basis.z
      forward.y = 0.0
      forward = forward.normalized()
      var right: Vector3 = cam_basis.x
      right.y = 0.0
      right = right.normalized()
      var move_dir: Vector3 = (forward * -input_dir.y + right * input_dir.x).normalized()
      velocity.x = move_dir.x * SPEED if input_dir.length() > 0.01 else 0.0
      velocity.z = move_dir.z * SPEED if input_dir.length() > 0.01 else 0.0
      velocity.y -= 9.8 * delta
      move_and_slide()
      if move_dir.length() > 0.01:
          var target_angle: float = atan2(move_dir.x, move_dir.z)
          var current_angle: float = rotation.y
          rotation.y = lerp_angle(current_angle, target_angle, ROTATION_SPEED * delta)

  func show_interact_hint(text: String) -> void:
      interact_hint.text = text
      interact_hint.visible = true

  func hide_interact_hint() -> void:
      interact_hint.visible = false
  ```

- [ ] **Step 1.2: Write `scenes/world/LocalPlayer.tscn`**

  Godot 4 text scene format (`format=3`). Nodes:
  - Root: `CharacterBody3D`, script = `res://src/world/local_player.gd`
  - `CollisionShape3D`: `CapsuleShape3D` radius=0.45, height=1.6
  - `MeshInstance3D`: `CapsuleMesh`, material = `StandardMaterial3D`
    with albedo_color `#7090c0` (placeholder blue)
  - `NameTag`: `Label3D`, billboard=`BILLBOARD_ENABLED` (enum value 1),
    position `(0, 1.2, 0)`, font_size=48, outline_size=8
  - `CameraRig`: `Node3D`, position `(0, 0, 0)`
    - `SpringArm3D`: length=8.0, rotation_degrees `(-60, 0, 0)`,
      spring_length=8.0, collision_mask=1 (layer 1 = terrain/buildings)
      - `Camera3D`: fov=60, position `(0, 0, 0)` (at spring tip)
  - `InteractHint`: `Label3D`, billboard=`BILLBOARD_ENABLED`,
    position `(0, 1.8, 0)`, font_size=36, modulate=#ffff00, visible=false

- [ ] **Step 1.3: Add Input Map entries**

  In `project.godot`, under `[input]`, add (if not already present):
  ```
  move_forward=...  (W key + up arrow)
  move_back=...     (S key + down arrow)
  move_left=...     (A key + left arrow)
  move_right=...    (D key + right arrow)
  interact=...      (E key)
  ```

  Check `project.godot` first — if WASD is already mapped, skip.

- [ ] **Step 1.4: Commit**

  ```bash
  git -C "C:/Users/Tianyang Liu/Desktop/Games/WS/desktop" add \
    src/world/local_player.gd \
    scenes/world/LocalPlayer.tscn \
    project.godot
  git -C "C:/Users/Tianyang Liu/Desktop/Games/WS/desktop" commit -m \
    "feat: LocalPlayer — CharacterBody3D, WASD, SpringArm3D camera"
  ```

---

## Task 2: WorldMap3D scene + script

### Node tree

```
WorldMap3D (Node3D)
├── Terrain (StaticBody3D)
│   ├── CollisionShape3D          ← BoxShape3D 240×0.5×160, position Y=−0.25
│   └── MeshInstance3D            ← PlaneMesh 240×160, toon material (tier color)
├── River (StaticBody3D)
│   └── CollisionShape3D          ← BoxShape3D 240×2×10, position (120, 1, 110)
├── RiverMesh (MeshInstance3D)    ← PlaneMesh 240×10, water material, Y=0.05
├── BridgeGap (StaticBody3D)      ← BoxShape3D 12×2×10 at (90, 1, 110) — EXCLUDED
│   └── CollisionShape3D          ← this body has disabled=true so bridge is passable
├── Bridge (MeshInstance3D)       ← BoxMesh 12×0.1×10 at (90, 0.05, 110)
├── Buildings (Node3D)            ← 6 town buildings as StaticBody3D children
├── Triggers (Node3D)
│   ├── PortalLeft (Area3D)       ← at (5, 0, 80), BoxShape 2×2×2
│   ├── PortalRight (Area3D)      ← at (235, 0, 80), BoxShape 2×2×2
│   ├── BossLair (Area3D)         ← at (205, 0, 45), SphereShape r=8
│   └── StoreZone (Area3D)        ← at (70, 0, 31), SphereShape r=8
├── PortalLeftMesh (MeshInstance3D)   ← TorusMesh 1.5, position (5, 0.1, 80)
├── PortalRightMesh (MeshInstance3D)  ← TorusMesh 1.5, position (235, 0.1, 80)
└── BossLairMesh (MeshInstance3D)     ← SphereMesh r=3 dark, position (205, 0.1, 45)
```

**River collision design:** The river `StaticBody3D` spans the full 240 m width
at Z=110. The `BridgeGap` StaticBody3D is `disabled = true` — it does nothing
physically, keeping the bridge passable. The `River` StaticBody excludes a 12 m
notch at X=84–96 (bridge gap) by using two side-by-side BoxShapes instead of one:
- West: BoxShape3D 84×2×10 at (42, 1, 110)
- East: BoxShape3D 144×2×10 at (168, 1, 110)  [center = 96 + 144/2 = 168]
This leaves a 12 m gap at X=84–96 that is walkable (bridge area).

### Script: `src/world/world_map_3d.gd`

Responsibilities:
- On `_ready`: apply tier theme colors (reads `PlayerData.tier`)
- Connect `Area3D` signals: `body_entered` → emit upward via WorldScene
- `apply_tier_theme(tier: String)`: swaps terrain material albedo to tier's
  ground color from the GDD §3.5 table
- Exports a signal `trigger_entered(trigger_name: String)` that WorldScene
  connects to handle portal/boss/store logic

- [ ] **Step 2.1: Write `src/world/world_map_3d.gd`**

  ```gdscript
  class_name WorldMap3D
  extends Node3D

  signal trigger_entered(trigger_name: String)

  ## Tier → ground color. From map-system.md §3.5.
  const TIER_COLORS: Dictionary = {
      "Apprentice":  Color("#3a3828"),
      "Initiate":    Color("#2e3a22"),
      "Acolyte":     Color("#1e3a20"),
      "Journeyman":  Color("#1e3828"),
      "Adept":       Color("#1e2e38"),
      "Scholar":     Color("#1e2240"),
      "Sage":        Color("#2a1e40"),
      "Arcanist":    Color("#30183a"),
      "Exemplar":    Color("#351a2a"),
      "Vanguard":    Color("#3a2210"),
      "Master":      Color("#3a2a10"),
      "Grandmaster": Color("#3a2808"),
      "Champion":    Color("#3a1010"),
      "Paragon":     Color("#3a0e0e"),
      "Legend":      Color("#200020"),
  }

  @onready var terrain_mesh: MeshInstance3D = $Terrain/MeshInstance3D
  @onready var portal_left: Area3D = $Triggers/PortalLeft
  @onready var portal_right: Area3D = $Triggers/PortalRight
  @onready var boss_lair: Area3D = $Triggers/BossLair
  @onready var store_zone: Area3D = $Triggers/StoreZone

  func _ready() -> void:
      apply_tier_theme(PlayerData.tier)
      portal_left.body_entered.connect(func(_b: Node3D) -> void: trigger_entered.emit("portal_left"))
      portal_right.body_entered.connect(func(_b: Node3D) -> void: trigger_entered.emit("portal_right"))
      boss_lair.body_entered.connect(func(_b: Node3D) -> void: trigger_entered.emit("boss_lair"))
      store_zone.body_entered.connect(func(_b: Node3D) -> void: trigger_entered.emit("store"))

  func apply_tier_theme(tier: String) -> void:
      if not TIER_COLORS.has(tier):
          return
      var mat := StandardMaterial3D.new()
      mat.albedo_color = TIER_COLORS[tier]
      mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
      terrain_mesh.set_surface_override_material(0, mat)
  ```

- [ ] **Step 2.2: Write `scenes/world/WorldMap3D.tscn`**

  Full Godot 4 text scene. All node positions use the coordinate table above.
  Key nodes and their properties:

  **Terrain (StaticBody3D)**
  - Child `CollisionShape3D`: shape = `BoxShape3D` size=(240, 0.5, 160), position=(120, -0.25, 80)
  - Child `MeshInstance3D`: mesh=`PlaneMesh` size=(240,160), rotated to lie flat
    (PlaneMesh is XZ by default), position=(120, 0, 80)

  **River (StaticBody3D)** — two CollisionShape3D children for the bank gap:
  - West bank shape: `BoxShape3D` size=(84, 2, 10), position=(42, 1, 110)
  - East bank shape: `BoxShape3D` size=(144, 2, 10), position=(168, 1, 110)
    (144 = 240 − 96; east bank starts at X=96, center = 96 + 72 = 168)

  **RiverMesh (MeshInstance3D)**: `PlaneMesh` size=(240, 10), position=(120, 0.05, 110),
  material albedo_color=`#2255aa`, transparency enabled (alpha=0.7)

  **Bridge (MeshInstance3D)**: `BoxMesh` size=(12, 0.1, 10), position=(90, 0.05, 110),
  material albedo_color=`#8b6914` (wood brown)

  **Buildings (Node3D)**: 6 children, each a `StaticBody3D` with:
  - `CollisionShape3D` (BoxShape3D matching building footprint, height=2)
  - `MeshInstance3D` (BoxMesh matching footprint, height=2), Y=1.0 (half height)
  - Positions from coordinate table (web→3D: divide by 10):

  | Building | 3D position (X, Z) | Size (X, Z) | Albedo |
  |---|---|---|---|
  | House1 | (38, 32) | (10, 8) | `#c87060` |
  | House2 | (52, 30) | (9, 7.5) | `#c09060` |
  | House3 | (44, 44) | (8.5, 7) | `#b08060` |
  | House4 | (31, 46) | (8, 7) | `#c07050` |
  | Tavern | (58, 42) | (12, 9.5) | `#905040` |
  | Store | (70, 31) | (11, 8.5) | `#6080a0` |

  **Triggers (Node3D)**: Area3D children with `CollisionShape3D`:
  - `PortalLeft`: `CylinderShape3D` radius=2, height=2, position=(5, 1, 80)
  - `PortalRight`: `CylinderShape3D` radius=2, height=2, position=(235, 1, 80)
  - `BossLair`: `SphereShape3D` radius=8, position=(205, 0, 45)
  - `StoreZone`: `SphereShape3D` radius=8, position=(70, 0, 31)

  **Portal meshes**: `TorusMesh` outer_radius=1.5, inner_radius=0.3, on Y=0.1
  - PortalLeftMesh: albedo=`#4040ff` (blue, tier below)
  - PortalRightMesh: albedo=`#ff4040` (red, tier above)

  **BossLairMesh**: `SphereMesh` radius=3, height=0.3 (flat disc), Y=0.02,
  albedo=`#200010`, shading=UNSHADED

  Script: `res://src/world/world_map_3d.gd`

- [ ] **Step 2.3: Commit**

  ```bash
  git -C "C:/Users/Tianyang Liu/Desktop/Games/WS/desktop" add \
    src/world/world_map_3d.gd \
    scenes/world/WorldMap3D.tscn
  git -C "C:/Users/Tianyang Liu/Desktop/Games/WS/desktop" commit -m \
    "feat: WorldMap3D — terrain, river, bridge, buildings, Area3D triggers"
  ```

---

## Task 3: WorldHUD

### Node tree

```
WorldHUD (CanvasLayer)
└── Panel (Control, full-rect anchor top-left)
    ├── TierLabel (Label)     ← top-left, "Tier: Apprentice"
    ├── GoldLabel (Label)     ← below tier, "Gold: 500"
    └── EscHint (Label)       ← bottom-left, "ESC — release mouse | E — interact"
```

### Script: `src/ui/world_hud.gd`

```gdscript
class_name WorldHUD
extends CanvasLayer

@onready var tier_label: Label = $Panel/TierLabel
@onready var gold_label: Label = $Panel/GoldLabel

func _ready() -> void:
    tier_label.text = "Tier: " + PlayerData.tier
    gold_label.text = "Gold: " + str(PlayerData.gold)
```

- [ ] **Step 3.1: Write `src/ui/world_hud.gd`**

  Write the script above verbatim.

- [ ] **Step 3.2: Write `scenes/world/WorldHUD.tscn`**

  `CanvasLayer` root with `Panel` child. `TierLabel` and `GoldLabel`
  positioned top-left (offset 16, 16 and 16, 48). `EscHint` anchored
  bottom-left, offset (16, -32).

- [ ] **Step 3.3: Commit**

  ```bash
  git -C "C:/Users/Tianyang Liu/Desktop/Games/WS/desktop" add \
    src/ui/world_hud.gd \
    scenes/world/WorldHUD.tscn
  git -C "C:/Users/Tianyang Liu/Desktop/Games/WS/desktop" commit -m \
    "feat: WorldHUD — tier name and gold overlay"
  ```

---

## Task 4: WorldScene rewrite

### Node tree

```
WorldScene (Node3D)
├── WorldEnvironment
│   └── Environment               ← sky color + ambient light
├── DirectionalLight3D            ← sun, rotation (-45, -30, 0)
├── WorldMap3D (instance)         ← WorldMap3D.tscn
├── PlayerSpawn (Marker3D)        ← default spawn (120, 0, 80)
└── HUD (instance)                ← WorldHUD.tscn
```

`LocalPlayer.tscn` is **not** instanced directly in the scene — it is
spawned at runtime by `WorldScene` after it reads the spawn position.
This allows future code to pass the spawn point cleanly.

### Script (inline in WorldScene or `src/world/world_scene.gd`)

```gdscript
extends Node3D

const LOCAL_PLAYER_SCENE = preload("res://scenes/world/LocalPlayer.tscn")

@onready var world_map: WorldMap3D = $WorldMap3D
@onready var player_spawn: Marker3D = $PlayerSpawn

var _local_player: LocalPlayer = null

func _ready() -> void:
    _spawn_player()
    world_map.trigger_entered.connect(_on_trigger_entered)

func _spawn_player() -> void:
    _local_player = LOCAL_PLAYER_SCENE.instantiate()
    add_child(_local_player)
    var jitter := Vector3(
        randf_range(-15.0, 15.0), 0.0, randf_range(-15.0, 15.0)
    )
    _local_player.global_position = player_spawn.global_position + jitter

func _on_trigger_entered(trigger_name: String) -> void:
    match trigger_name:
        "portal_left":
            _on_portal(−1)
        "portal_right":
            _on_portal(1)
        "boss_lair":
            _on_boss_lair()
        "store":
            _on_store()

func _on_portal(direction: int) -> void:
    ## Phase 3 will handle tier transition. For now, just log.
    print("Portal entered: direction=", direction)

func _on_boss_lair() -> void:
    print("Boss lair proximity entered")

func _on_store() -> void:
    _local_player.show_interact_hint("Press E to open store")
```

**WorldEnvironment / Environment settings:**
- Sky: `ProceduralSkyMaterial`, sky_top_color `#1a1a2e`, sky_horizon_color `#2a2a4a`,
  ground_bottom_color `#1a1a1a`
- Ambient light color `#303050`, energy 0.4
- No fog (Phase 8 polish)

**DirectionalLight3D:** rotation_degrees `(-45, -30, 0)`, energy=1.2,
shadow_enabled=true

- [ ] **Step 4.1: Write `scenes/world/WorldScene.tscn`**

  Rewrite the existing placeholder `WorldScene.tscn` with the node tree above.
  Instance `WorldMap3D.tscn` and `WorldHUD.tscn`. Include the inline script
  (or reference `res://src/world/world_scene.gd` — writer's choice).

  **Important:** `LocalPlayer` is NOT in the scene tree in the .tscn file.
  It is spawned at runtime via `preload` + `instantiate()`.

- [ ] **Step 4.2: Write `src/world/world_scene.gd`** (if using external script)

  Write the script above, with `_on_portal` direction corrected to integer
  (`-1` and `1`).

- [ ] **Step 4.3: Commit**

  ```bash
  git -C "C:/Users/Tianyang Liu/Desktop/Games/WS/desktop" add \
    scenes/world/WorldScene.tscn \
    src/world/world_scene.gd
  git -C "C:/Users/Tianyang Liu/Desktop/Games\WS/desktop" commit -m \
    "feat: WorldScene — 3D world root, spawns LocalPlayer, connects map triggers"
  ```

---

## Task 5: Wire collision layers

Godot physics layers used in this phase:

| Layer | Bit | Name | Used by |
|---|---|---|---|
| 1 | 1 | World | Terrain, buildings, river banks, bridge |
| 2 | 2 | Player | LocalPlayer CharacterBody3D |
| 3 | 4 | Trigger | Area3D trigger volumes |

Assignments:
- `Terrain` StaticBody3D: layer=1, mask=0
- `River` StaticBody3D: layer=1, mask=0
- Building StaticBody3Ds: layer=1, mask=0
- `LocalPlayer` CharacterBody3D: layer=2, mask=1 (collides with world layer)
- Area3Ds (portals, boss, store): layer=3, mask=2 (detects player layer)
- `SpringArm3D` collision mask: 1 (clips against world layer only)

These must be set correctly in the `.tscn` files or the player will fall
through the floor / Area3D triggers won't fire.

- [ ] **Step 5.1: Verify collision layer assignments**

  Read `LocalPlayer.tscn` and `WorldMap3D.tscn` after writing them.
  Confirm:
  - LocalPlayer's `CharacterBody3D` has `collision_layer = 2`, `collision_mask = 1`
  - Terrain's `StaticBody3D` has `collision_layer = 1`
  - Each Area3D has `collision_layer = 4`, `collision_mask = 2`
  - SpringArm3D has `collision_mask = 1`

  If any are wrong, Edit the .tscn file to fix before committing Task 4.

---

## Task 6: Smoke check (manual)

Since we cannot run Godot headlessly for 3D scene checks, trace the execution
path manually:

- [ ] **Step 6.1: Trace scene load**

  1. `GameManager.go_to_world()` calls `change_scene_to_file("res://scenes/world/WorldScene.tscn")`
  2. `WorldScene._ready()` calls `_spawn_player()` → `LocalPlayer` instantiated at `(120 ± 15, 0, 80 ± 15)`
  3. `LocalPlayer._ready()` reads `PlayerData.character_name` → sets `NameTag.text`
  4. `WorldMap3D._ready()` calls `apply_tier_theme(PlayerData.tier)` → terrain material updated
  5. Area3D signals connected to `_on_trigger_entered`

- [ ] **Step 6.2: Trace movement**

  1. W pressed → `Input.get_axis("move_forward", "move_back")` returns −1
  2. `move_dir` = camera forward projected onto XZ = roughly `(0, 0, -1)` at game start
  3. `velocity = (0, 0, -24)` → `move_and_slide()` moves player north
  4. Player rotation lerps to face `(0, 0, -1)`

- [ ] **Step 6.3: Trace river collision**

  1. Player walks south (Z increasing) toward Z=110
  2. `River` StaticBody3D west segment covers X=0–84, Z=105–115
  3. Player at X=120 is not in west (0–84) or east (96–240) segment
  4. Player is in bridge gap (X=84–96) — river is passable ✓ at X=90
  5. Player at X=50 hits west river segment — blocked ✓

- [ ] **Step 6.4: Commit plan**

  ```bash
  git -C "C:/Users/Tianyang Liu/Desktop/Games/WS/desktop" add \
    design/plans/2026-04-23-phase2-world-map-player.md
  git -C "C:/Users/Tianyang Liu/Desktop/Games/WS/desktop" commit -m \
    "docs: Phase 2 implementation plan — WorldMap3D, LocalPlayer, WorldScene"
  ```

---

## Phase 2 Deliverable

At the end of this phase:

- Player completes TitleScreen → lands in a 3D world
- WASD moves the player on the XZ plane at 24 m/s (web-equivalent speed)
- SpringArm3D camera follows at 8 m, 60° down, rotates with mouse
- World has a flat terrain colored to the player's tier
- River blocks movement except at the bridge gap (X=84–96)
- 6 town buildings block movement (solid collision)
- Portal Area3Ds at west and east edges log to console (wired for Phase 3)
- Boss lair and store Area3Ds log proximity (wired for Phase 3)
- WorldHUD shows tier name and gold
- Player name tag floats above character

**Not in Phase 2 (deferred):**
- Tier transitions (portal fade + scene reload) — Phase 3
- Remote players — Phase 3
- Visual polish (toon shader, outlines, VFX) — Phase 8
- Boss modal, store UI — Phase 5/6
- Landmark mesh diversity — Phase 8
- Sound effects — Phase 7
