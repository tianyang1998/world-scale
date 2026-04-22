# Phase 1: Project Scaffold + Autoloads + Title Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a working Godot 4.6 project where a player can launch the game, enter their credentials, receive computed stats from the scoring API, enter a character name, save the character to Supabase, and land in an empty placeholder world scene — with audio, networking, and player data autoloads running.

**Architecture:** Hybrid scene structure (Option C from architecture spec). Four GDScript autoloads registered in `project.godot`. TitleScreen is a 2D scene with native Godot UI (no WebView) that calls the backend API via `HTTPRequest`. PlayerData autoload holds the in-memory character state after login.

**Tech Stack:** Godot 4.6 · GDScript · Supabase REST API · HTTPRequest node · ConfigFile for settings persistence

---

## Godot 4.6 Notes

> Your LLM knowledge cuts off before Godot 4.4. Key facts for this plan:
> - `FileAccess.open()` now returns `null` on failure (not an error code) — always null-check
> - Jolt physics is now the default — use `CharacterBody3D` as before, no change needed for 2D scenes
> - `@abstract` keyword exists but is not used in this plan
> - All GDScript APIs used here (`HTTPRequest`, `ConfigFile`, `LineEdit`, `Label`, `Button`, `VBoxContainer`) are unchanged from 4.3

---

## File Map

```
desktop/                          ← Godot project root
├── project.godot                 ← engine settings, autoload registrations, renderer
├── src/
│   └── core/
│       ├── game_manager.gd       ← state machine, scene transitions
│       ├── audio_manager.gd      ← BGM/SFX stub (wired up in Phase 7)
│       ├── network_manager.gd    ← Supabase WebSocket stub (wired up in Phase 3)
│       └── player_data.gd        ← in-memory character cache, JWT storage
├── scenes/
│   ├── ui/
│   │   ├── TitleScreen.tscn      ← realm picker → credential form → name entry → save
│   │   └── TitleScreen.gd        ← UI logic, HTTPRequest calls
│   └── world/
│       └── WorldScene.tscn       ← empty placeholder (gray box + "World placeholder" label)
├── assets/
│   └── audio/
│       └── bgm/                  ← landing.mp3, map.mp3, pvp.mp3, pve.mp3, win.mp3, lose.mp3 (copied here)
└── tests/
    └── unit/
        └── test_scoring.gd       ← GDScript unit tests for scoring formulas
```

---

## Task 1: Initialize the Godot Project

**Files:**
- Create: `desktop/project.godot`
- Create: `desktop/.gitignore`

- [ ] **Step 1.1: Create the project directory and initialize Godot project**

  Open Godot 4.6. Click **New Project**. Set:
  - Project name: `WorldScale`
  - Project path: `C:\Users\Tianyang Liu\Desktop\Games\WS\desktop`
  - Renderer: **Forward+** (required for toon shading in Phase 8)
  - Click **Create & Edit**

  Godot creates `project.godot`, `icon.svg`, and `.godot/` folder.

- [ ] **Step 1.2: Set rendering and window settings in Project Settings**

  Go to **Project → Project Settings**:
  - `Display/Window/Size/Viewport Width`: `1280`
  - `Display/Window/Size/Viewport Height`: `720`
  - `Display/Window/Stretch/Mode`: `canvas_items`
  - `Rendering/Renderer/Rendering Method`: `forward_plus`

- [ ] **Step 1.3: Create .gitignore**

  Create `desktop/.gitignore`:
  ```
  # Godot cache
  .godot/

  # Export artifacts
  *.exe
  *.x86_64
  *.apk

  # OS
  .DS_Store
  Thumbs.db
  ```

- [ ] **Step 1.4: Commit**

  ```bash
  cd "C:\Users\Tianyang Liu\Desktop\Games\WS"
  git add desktop/project.godot desktop/.gitignore desktop/icon.svg
  git commit -m "feat: initialize Godot 4.6 project (Forward+ renderer, 1280×720)"
  ```

---

## Task 2: Create Directory Structure and Autoload Stubs

**Files:**
- Create: `desktop/src/core/game_manager.gd`
- Create: `desktop/src/core/audio_manager.gd`
- Create: `desktop/src/core/network_manager.gd`
- Create: `desktop/src/core/player_data.gd`

- [ ] **Step 2.1: Create `player_data.gd`**

  Create `desktop/src/core/player_data.gd`:
  ```gdscript
  extends Node

  var jwt: String = ""
  var user_id: String = ""
  var character_name: String = ""
  var realm: String = ""
  var total_power: int = 0
  var tier: String = ""
  var gold: int = 0
  var realm_skill: String = ""

  # Five stats (0–100 each)
  var expertise: float = 0.0
  var prestige: float = 0.0
  var impact: float = 0.0
  var credentials: float = 0.0
  var network: float = 0.0

  # Battle-allocated stats (set on PrepScreen)
  var battle_hp: int = 0
  var battle_attack: int = 0
  var battle_defence: int = 0

  var is_authenticated: bool = false

  func load_from_dict(data: Dictionary) -> void:
      character_name = data.get("name", "")
      realm = data.get("realm", "")
      total_power = data.get("total_power", 0)
      tier = data.get("tier", "Apprentice")
      gold = data.get("gold", 0)
      realm_skill = data.get("realm_skill", "")

  func clear() -> void:
      jwt = ""
      user_id = ""
      character_name = ""
      realm = ""
      total_power = 0
      tier = ""
      gold = 0
      realm_skill = ""
      expertise = 0.0
      prestige = 0.0
      impact = 0.0
      credentials = 0.0
      network = 0.0
      is_authenticated = false
  ```

- [ ] **Step 2.2: Create `game_manager.gd`**

  Create `desktop/src/core/game_manager.gd`:
  ```gdscript
  extends Node

  enum State { TITLE, WORLD, PVP_PREP, PVP_ARENA, PVE_PREP, PVE_ARENA, RESULT }

  var current_state: State = State.TITLE

  const TITLE_SCENE = "res://scenes/ui/TitleScreen.tscn"
  const WORLD_SCENE = "res://scenes/world/WorldScene.tscn"

  func go_to_world() -> void:
      current_state = State.WORLD
      get_tree().change_scene_to_file(WORLD_SCENE)

  func go_to_title() -> void:
      current_state = State.TITLE
      PlayerData.clear()
      get_tree().change_scene_to_file(TITLE_SCENE)
  ```

- [ ] **Step 2.3: Create `audio_manager.gd` stub**

  Create `desktop/src/core/audio_manager.gd`:
  ```gdscript
  extends Node

  # Stub — fully implemented in Phase 7
  func play_bgm(_track: String) -> void:
      pass

  func stop_bgm() -> void:
      pass

  func play_sfx(_effect: String) -> void:
      pass
  ```

- [ ] **Step 2.4: Create `network_manager.gd` stub**

  Create `desktop/src/core/network_manager.gd`:
  ```gdscript
  extends Node

  # Stub — fully implemented in Phase 3
  # Will hold Supabase WebSocket connection, Presence, and Broadcast logic

  signal connected
  signal disconnected

  func connect_to_supabase() -> void:
      pass

  func disconnect_from_supabase() -> void:
      pass
  ```

- [ ] **Step 2.5: Register autoloads in Project Settings**

  Go to **Project → Project Settings → Autoload** tab. Add four entries:

  | Name | Path |
  |---|---|
  | `PlayerData` | `res://src/core/player_data.gd` |
  | `GameManager` | `res://src/core/game_manager.gd` |
  | `AudioManager` | `res://src/core/audio_manager.gd` |
  | `NetworkManager` | `res://src/core/network_manager.gd` |

  Order matters: `PlayerData` must be first (others may reference it).

- [ ] **Step 2.6: Commit**

  ```bash
  git add desktop/src/ desktop/project.godot
  git commit -m "feat: add four autoload stubs (PlayerData, GameManager, AudioManager, NetworkManager)"
  ```

---

## Task 3: Placeholder World Scene

**Files:**
- Create: `desktop/scenes/world/WorldScene.tscn`

- [ ] **Step 3.1: Create WorldScene in Godot editor**

  In the Godot editor:
  1. **Scene → New Scene**
  2. Root node: `Node3D` — rename to `WorldScene`
  3. Add child: `Label` (2D) — set text to `"World — placeholder"`, anchors to center
  4. Save as `res://scenes/world/WorldScene.tscn`

- [ ] **Step 3.2: Set WorldScene as the project's main scene**

  **Project → Project Settings → Application/Run/Main Scene** → pick `WorldScene.tscn`.

  This lets you press F5 to verify the project launches cleanly before TitleScreen exists.

- [ ] **Step 3.3: Run the project (F5) and verify it opens without errors**

  Expected: gray window with "World — placeholder" label. No errors in Output panel.

- [ ] **Step 3.4: Commit**

  ```bash
  git add desktop/scenes/world/WorldScene.tscn
  git commit -m "feat: add placeholder WorldScene so project launches cleanly"
  ```

---

## Task 4: Scoring Logic in GDScript

**Files:**
- Create: `desktop/src/core/scorer.gd`
- Create: `desktop/tests/unit/test_scoring.gd`

> The web server runs `POST /api/score` which calls the TypeScript scorer. For the desktop, the score endpoint is called via HTTP — Godot does NOT re-implement scoring locally. However, we port the formulas to GDScript for **unit testing** to verify our API call parses responses correctly, and to support offline validation in future.

- [ ] **Step 4.1: Write the failing tests first**

  Create `desktop/tests/unit/test_scoring.gd`:
  ```gdscript
  extends GdUnitTestSuite

  # Test percentile scoring formula
  func test_percentile_score_at_p50_returns_50() -> void:
      var dist := {"p25": 4.0, "p50": 9.0, "p75": 18.0, "p90": 32.0, "p99": 60.0}
      var result := Scorer.percentile_score(9.0, dist)
      assert_float(result).is_equal_approx(50.0, 0.1)

  func test_percentile_score_at_zero_returns_zero() -> void:
      var dist := {"p25": 4.0, "p50": 9.0, "p75": 18.0, "p90": 32.0, "p99": 60.0}
      var result := Scorer.percentile_score(0.0, dist)
      assert_float(result).is_equal_approx(0.0, 0.1)

  func test_percentile_score_above_p99x3_returns_100() -> void:
      var dist := {"p25": 4.0, "p50": 9.0, "p75": 18.0, "p90": 32.0, "p99": 60.0}
      var result := Scorer.percentile_score(200.0, dist)  # well above p99×3=180
      assert_float(result).is_equal_approx(100.0, 0.1)

  func test_log_years_at_zero_returns_zero() -> void:
      var result := Scorer.log_years(0.0)
      assert_float(result).is_equal_approx(0.0, 0.1)

  func test_log_years_at_41_returns_near_100() -> void:
      # log(42)/log(42) = 1.0 → ×100 = 100
      var result := Scorer.log_years(41.0)
      assert_float(result).is_equal_approx(100.0, 0.1)

  func test_power_formula_all_stats_at_50_gives_expected_range() -> void:
      # raw = 50×0.20 + 50×0.25 + 50×0.30 + 50×0.15 + 50×0.10 = 50
      # power = round(50 × 120) = 6000
      var result := Scorer.compute_power(50.0, 50.0, 50.0, 50.0, 50.0)
      assert_int(result).is_equal(6000)

  func test_get_tier_power_0_returns_apprentice() -> void:
      assert_str(Scorer.get_tier(0)).is_equal("Apprentice")

  func test_get_tier_power_11200_returns_legend() -> void:
      assert_str(Scorer.get_tier(11200)).is_equal("Legend")

  func test_get_tier_power_4000_returns_scholar() -> void:
      assert_str(Scorer.get_tier(4000)).is_equal("Scholar")
  ```

- [ ] **Step 4.2: Run tests — expect FAIL (Scorer not defined yet)**

  In Godot editor: install **GdUnit4** plugin from AssetLib if not present.
  Run tests via **GdUnit4 → Run All Tests**.
  Expected: all 8 tests fail with "Identifier 'Scorer' not declared".

- [ ] **Step 4.3: Create `scorer.gd`**

  Create `desktop/src/core/scorer.gd`:
  ```gdscript
  class_name Scorer
  extends RefCounted

  # Tier boundaries — must match gdd/scoring-system.md §3.6
  const TIERS: Array[Dictionary] = [
      {"name": "Apprentice",  "min": 0,     "max": 799},
      {"name": "Initiate",    "min": 800,   "max": 1599},
      {"name": "Acolyte",     "min": 1600,  "max": 2399},
      {"name": "Journeyman",  "min": 2400,  "max": 3199},
      {"name": "Adept",       "min": 3200,  "max": 3999},
      {"name": "Scholar",     "min": 4000,  "max": 4799},
      {"name": "Sage",        "min": 4800,  "max": 5599},
      {"name": "Arcanist",    "min": 5600,  "max": 6399},
      {"name": "Exemplar",    "min": 6400,  "max": 7199},
      {"name": "Vanguard",    "min": 7200,  "max": 7999},
      {"name": "Master",      "min": 8000,  "max": 8799},
      {"name": "Grandmaster", "min": 8800,  "max": 9599},
      {"name": "Champion",    "min": 9600,  "max": 10399},
      {"name": "Paragon",     "min": 10400, "max": 11199},
      {"name": "Legend",      "min": 11200, "max": 99999},
  ]

  # percentile_score: maps value onto 0–100 using breakpoints
  # dist must have keys: p25, p50, p75, p90, p99 (all floats)
  static func percentile_score(value: float, dist: Dictionary) -> float:
      var breakpoints: Array = [
          [0.0,             0.0],
          [dist["p25"],    25.0],
          [dist["p50"],    50.0],
          [dist["p75"],    75.0],
          [dist["p90"],    90.0],
          [dist["p99"],    99.0],
          [dist["p99"] * 3.0, 100.0],
      ]
      for i in range(1, breakpoints.size()):
          var lo_val: float = breakpoints[i - 1][0]
          var lo_pct: float = breakpoints[i - 1][1]
          var hi_val: float = breakpoints[i][0]
          var hi_pct: float = breakpoints[i][1]
          if value <= hi_val:
              if hi_val == lo_val:
                  return lo_pct
              var t: float = (value - lo_val) / (hi_val - lo_val)
              return lo_pct + t * (hi_pct - lo_pct)
      return 100.0

  # log_years: expertise from years active (log scale, base 42)
  static func log_years(years: float) -> float:
      return minf(log(years + 1.0) / log(42.0), 1.0) * 100.0

  # compute_power: weighted sum → scaled to 0–12000 range
  static func compute_power(
      expertise: float, prestige: float, impact: float,
      credentials: float, network: float
  ) -> int:
      var raw: float = (
          expertise   * 0.20 +
          prestige    * 0.25 +
          impact      * 0.30 +
          credentials * 0.15 +
          network     * 0.10
      )
      return roundi(raw * 120.0)

  # get_tier: maps power to tier name
  static func get_tier(power: int) -> String:
      for t in TIERS:
          if power >= t["min"] and power <= t["max"]:
              return t["name"]
      return "Apprentice"
  ```

- [ ] **Step 4.4: Run tests — expect all 8 PASS**

  Run via **GdUnit4 → Run All Tests**.
  Expected output:
  ```
  [PASSED] test_percentile_score_at_p50_returns_50
  [PASSED] test_percentile_score_at_zero_returns_zero
  [PASSED] test_percentile_score_above_p99x3_returns_100
  [PASSED] test_log_years_at_zero_returns_zero
  [PASSED] test_log_years_at_41_returns_near_100
  [PASSED] test_power_formula_all_stats_at_50_gives_expected_range
  [PASSED] test_get_tier_power_0_returns_apprentice
  [PASSED] test_get_tier_power_11200_returns_legend
  [PASSED] test_get_tier_power_4000_returns_scholar
  ```

- [ ] **Step 4.5: Commit**

  ```bash
  git add desktop/src/core/scorer.gd desktop/tests/unit/test_scoring.gd
  git commit -m "feat: add Scorer GDScript class with unit tests (percentile, log years, power, tier)"
  ```

---

## Task 5: TitleScreen — Realm Picker UI

**Files:**
- Create: `desktop/scenes/ui/TitleScreen.tscn`
- Create: `desktop/scenes/ui/TitleScreen.gd`

> The TitleScreen has three sequential panels shown one at a time:
> 1. **Realm picker** — choose one of 5 realms
> 2. **Credential form** — realm-specific inputs (built in Task 6)
> 3. **Name entry** — character name + save (built in Task 7)

- [ ] **Step 5.1: Create TitleScreen scene in editor**

  In Godot editor:
  1. **Scene → New Scene** → root: `Control` → rename `TitleScreen`
  2. Set anchors: full-rect (Ctrl+Alt+F in 2D editor)
  3. Add `ColorRect` child → color `#0d0d1a` → full-rect anchor (background)
  4. Add `VBoxContainer` child → name `MainContainer` → anchors centered, size 600×500
  5. Inside `MainContainer`:
     - `Label` named `TitleLabel` → text `"World Scale"` → theme font size 48
     - `Label` named `SubtitleLabel` → text `"Choose your realm"` → font size 18, color gray
     - `GridContainer` named `RealmGrid` → columns 3, separation 12
     - `Label` named `StatusLabel` → text `""` → color red (for errors)
  6. Save as `res://scenes/ui/TitleScreen.tscn`

- [ ] **Step 5.2: Add realm buttons to RealmGrid**

  In `RealmGrid`, add 5 `Button` nodes:
  - Name: `BtnAcademia`  · Text: `"📖 Academia"`
  - Name: `BtnTech`      · Text: `"⚡ Tech"`
  - Name: `BtnMedicine`  · Text: `"⚕️ Medicine"`
  - Name: `BtnCreative`  · Text: `"🎨 Creative"`
  - Name: `BtnLaw`       · Text: `"⚖️ Law"`

  Set each button: minimum size 160×60, custom font size 16.

- [ ] **Step 5.3: Create `TitleScreen.gd` with realm selection logic**

  Create `desktop/scenes/ui/TitleScreen.gd`:
  ```gdscript
  extends Control

  enum Panel { REALM, CREDENTIALS, NAME_ENTRY }

  var current_panel: Panel = Panel.REALM
  var selected_realm: String = ""

  # Populated in Task 6 — credential form nodes
  var credential_container: VBoxContainer

  @onready var realm_grid: GridContainer = $MainContainer/RealmGrid
  @onready var status_label: Label = $MainContainer/StatusLabel

  func _ready() -> void:
      $MainContainer/RealmGrid/BtnAcademia.pressed.connect(_on_realm_selected.bind("academia"))
      $MainContainer/RealmGrid/BtnTech.pressed.connect(_on_realm_selected.bind("tech"))
      $MainContainer/RealmGrid/BtnMedicine.pressed.connect(_on_realm_selected.bind("medicine"))
      $MainContainer/RealmGrid/BtnCreative.pressed.connect(_on_realm_selected.bind("creative"))
      $MainContainer/RealmGrid/BtnLaw.pressed.connect(_on_realm_selected.bind("law"))

  func _on_realm_selected(realm: String) -> void:
      selected_realm = realm
      PlayerData.realm = realm
      _show_panel(Panel.CREDENTIALS)

  func _show_panel(panel: Panel) -> void:
      current_panel = panel
      realm_grid.visible = (panel == Panel.REALM)
      # credential_container and name_container visibility set in Tasks 6 & 7
      status_label.text = ""

  func set_status(msg: String, is_error: bool = true) -> void:
      status_label.text = msg
      status_label.modulate = Color.RED if is_error else Color.GREEN
  ```

- [ ] **Step 5.4: Set TitleScreen as main scene**

  **Project → Project Settings → Application/Run/Main Scene** → `TitleScreen.tscn`

- [ ] **Step 5.5: Run (F5) and verify realm buttons appear and are clickable**

  Expected: dark background, "World Scale" title, 5 realm buttons. Clicking any shows no error (just hides the grid — credential form not built yet).

- [ ] **Step 5.6: Commit**

  ```bash
  git add desktop/scenes/ui/TitleScreen.tscn desktop/scenes/ui/TitleScreen.gd
  git commit -m "feat: TitleScreen realm picker UI — 5 realm buttons, panel switching"
  ```

---

## Task 6: TitleScreen — Credential Forms + API Score Call

**Files:**
- Modify: `desktop/scenes/ui/TitleScreen.tscn`
- Modify: `desktop/scenes/ui/TitleScreen.gd`

> Each realm has different input fields. We build all 5 forms but only show the selected realm's form. After filling in, player clicks Submit → Godot calls `POST /api/score` → response populates PlayerData.

- [ ] **Step 6.1: Add HTTPRequest node to TitleScreen scene**

  In editor, add `HTTPRequest` child to `TitleScreen` root. Name it `Http`.

- [ ] **Step 6.2: Add credential VBoxContainer with per-realm sub-containers**

  In `MainContainer`, add after `RealmGrid`:
  ```
  VBoxContainer (name: CredentialContainer, visible: false)
  ├── Label (name: FormTitle)             ← e.g. "Academia — Enter your metrics"
  ├── VBoxContainer (name: AcademiaForm, visible: false)
  │   ├── HBoxContainer: Label "Years active" + SpinBox (name: YearsActive, min:0, max:60)
  │   ├── HBoxContainer: Label "H-index" + SpinBox (name: HIndex, min:0, max:500)
  │   ├── HBoxContainer: Label "Citations" + SpinBox (name: Citations, min:0, max:100000)
  │   ├── HBoxContainer: Label "Publications" + SpinBox (name: Publications, min:0, max:2000)
  │   └── HBoxContainer: Label "i10-index" + SpinBox (name: I10Index, min:0, max:1000)
  ├── VBoxContainer (name: TechForm, visible: false)
  │   ├── HBoxContainer: Label "Years active" + SpinBox (name: YearsActive, min:0, max:60)
  │   ├── HBoxContainer: Label "GitHub followers" + SpinBox (name: Followers, min:0, max:1000000)
  │   ├── HBoxContainer: Label "Stars (total)" + SpinBox (name: Stars, min:0, max:500000)
  │   ├── HBoxContainer: Label "Repositories" + SpinBox (name: Repos, min:0, max:5000)
  │   └── HBoxContainer: Label "Commits (total)" + SpinBox (name: Commits, min:0, max:100000)
  ├── VBoxContainer (name: MedicineForm, visible: false)
  │   ├── HBoxContainer: Label "Years practicing" + SpinBox (name: YearsPracticing, min:0, max:60)
  │   ├── HBoxContainer: Label "Papers published" + SpinBox (name: Papers, min:0, max:1000)
  │   ├── HBoxContainer: Label "Citations" + SpinBox (name: Citations, min:0, max:50000)
  │   └── HBoxContainer: Label "Patients treated" + SpinBox (name: Patients, min:0, max:100000)
  ├── VBoxContainer (name: CreativeForm, visible: false)
  │   ├── HBoxContainer: Label "Years active" + SpinBox (name: YearsActive, min:0, max:60)
  │   ├── HBoxContainer: Label "Major works" + SpinBox (name: Works, min:0, max:1000)
  │   ├── HBoxContainer: Label "Awards" + SpinBox (name: Awards, min:0, max:200)
  │   └── HBoxContainer: Label "Audience size" + SpinBox (name: Audience, min:0, max:10000000, step:1000)
  ├── VBoxContainer (name: LawForm, visible: false)
  │   ├── HBoxContainer: Label "Years practicing" + SpinBox (name: YearsPracticing, min:0, max:60)
  │   ├── HBoxContainer: Label "Cases handled" + SpinBox (name: Cases, min:0, max:5000)
  │   ├── HBoxContainer: Label "Cases won" + SpinBox (name: Wins, min:0, max:5000)
  │   └── HBoxContainer: Label "Bar admissions" + SpinBox (name: Admissions, min:0, max:30)
  ├── Button (name: BtnBack, text: "← Back")
  └── Button (name: BtnSubmit, text: "Calculate Power →")
  ```

- [ ] **Step 6.3: Update `TitleScreen.gd` with credential form and API call**

  Replace the full contents of `desktop/scenes/ui/TitleScreen.gd`:
  ```gdscript
  extends Control

  enum Panel { REALM, CREDENTIALS, NAME_ENTRY }

  # Replace with your desktop Supabase project's deployed API base URL
  # e.g. "https://your-project.supabase.co/functions/v1" or your Next.js server
  const API_BASE := "https://YOUR_API_BASE_URL"

  var current_panel: Panel = Panel.REALM
  var selected_realm: String = ""

  @onready var realm_grid: GridContainer = $MainContainer/RealmGrid
  @onready var status_label: Label = $MainContainer/StatusLabel
  @onready var credential_container: VBoxContainer = $MainContainer/CredentialContainer
  @onready var form_title: Label = $MainContainer/CredentialContainer/FormTitle
  @onready var btn_submit: Button = $MainContainer/CredentialContainer/BtnSubmit
  @onready var btn_back: Button = $MainContainer/CredentialContainer/BtnBack
  @onready var http: HTTPRequest = $Http

  func _ready() -> void:
      $MainContainer/RealmGrid/BtnAcademia.pressed.connect(_on_realm_selected.bind("academia"))
      $MainContainer/RealmGrid/BtnTech.pressed.connect(_on_realm_selected.bind("tech"))
      $MainContainer/RealmGrid/BtnMedicine.pressed.connect(_on_realm_selected.bind("medicine"))
      $MainContainer/RealmGrid/BtnCreative.pressed.connect(_on_realm_selected.bind("creative"))
      $MainContainer/RealmGrid/BtnLaw.pressed.connect(_on_realm_selected.bind("law"))
      btn_submit.pressed.connect(_on_submit_pressed)
      btn_back.pressed.connect(_on_back_pressed)
      http.request_completed.connect(_on_score_response)

  func _on_realm_selected(realm: String) -> void:
      selected_realm = realm
      PlayerData.realm = realm
      _show_credential_form(realm)
      _show_panel(Panel.CREDENTIALS)

  func _show_credential_form(realm: String) -> void:
      form_title.text = realm.capitalize() + " — Enter your metrics"
      for form_name in ["AcademiaForm", "TechForm", "MedicineForm", "CreativeForm", "LawForm"]:
          credential_container.get_node(form_name).visible = false
      var form_map := {
          "academia": "AcademiaForm", "tech": "TechForm",
          "medicine": "MedicineForm", "creative": "CreativeForm", "law": "LawForm"
      }
      credential_container.get_node(form_map[realm]).visible = true

  func _show_panel(panel: Panel) -> void:
      current_panel = panel
      realm_grid.visible = (panel == Panel.REALM)
      credential_container.visible = (panel == Panel.CREDENTIALS)
      # name_container set visible in Task 7
      status_label.text = ""

  func _on_back_pressed() -> void:
      _show_panel(Panel.REALM)

  func _on_submit_pressed() -> void:
      btn_submit.disabled = true
      set_status("Calculating...", false)
      var payload := _build_payload()
      var body := JSON.stringify(payload)
      var headers := ["Content-Type: application/json"]
      var err := http.request(
          API_BASE + "/api/score",
          headers,
          HTTPClient.METHOD_POST,
          body
      )
      if err != OK:
          set_status("Network error: " + str(err))
          btn_submit.disabled = false

  func _build_payload() -> Dictionary:
      var payload := {"realm": selected_realm}
      match selected_realm:
          "academia":
              var f := $MainContainer/CredentialContainer/AcademiaForm
              payload["years"] = f.get_node("YearsActive").value
              payload["h_index"] = f.get_node("HIndex").value
              payload["citations"] = f.get_node("Citations").value
              payload["publications"] = f.get_node("Publications").value
              payload["i10"] = f.get_node("I10Index").value
          "tech":
              var f := $MainContainer/CredentialContainer/TechForm
              payload["years"] = f.get_node("YearsActive").value
              payload["followers"] = f.get_node("Followers").value
              payload["stars"] = f.get_node("Stars").value
              payload["repos"] = f.get_node("Repos").value
              payload["commits"] = f.get_node("Commits").value
          "medicine":
              var f := $MainContainer/CredentialContainer/MedicineForm
              payload["years"] = f.get_node("YearsPracticing").value
              payload["papers"] = f.get_node("Papers").value
              payload["citations"] = f.get_node("Citations").value
              payload["patients"] = f.get_node("Patients").value
          "creative":
              var f := $MainContainer/CredentialContainer/CreativeForm
              payload["years"] = f.get_node("YearsActive").value
              payload["works"] = f.get_node("Works").value
              payload["awards"] = f.get_node("Awards").value
              payload["audience"] = f.get_node("Audience").value
          "law":
              var f := $MainContainer/CredentialContainer/LawForm
              payload["years"] = f.get_node("YearsPracticing").value
              payload["cases"] = f.get_node("Cases").value
              payload["wins"] = f.get_node("Wins").value
              payload["admissions"] = f.get_node("Admissions").value
      return payload

  func _on_score_response(
      result: int, response_code: int,
      _headers: PackedStringArray, body: PackedByteArray
  ) -> void:
      btn_submit.disabled = false
      if result != HTTPRequest.RESULT_SUCCESS or response_code != 200:
          set_status("Score API error (HTTP " + str(response_code) + ")")
          return
      var json := JSON.new()
      if json.parse(body.get_string_from_utf8()) != OK:
          set_status("Invalid response from server")
          return
      var data: Dictionary = json.get_data()
      PlayerData.total_power = data.get("total_power", 0)
      PlayerData.tier = data.get("tier", "Apprentice")
      PlayerData.expertise = data.get("expertise", 0.0)
      PlayerData.prestige = data.get("prestige", 0.0)
      PlayerData.impact = data.get("impact", 0.0)
      PlayerData.credentials = data.get("credentials", 0.0)
      PlayerData.network = data.get("network", 0.0)
      PlayerData.realm_skill = data.get("realm_skill", "")
      set_status("Power: " + str(PlayerData.total_power) + " — Tier: " + PlayerData.tier, false)
      _show_panel(Panel.NAME_ENTRY)

  func set_status(msg: String, is_error: bool = true) -> void:
      status_label.text = msg
      status_label.modulate = Color.RED if is_error else Color.GREEN
  ```

- [ ] **Step 6.4: Commit**

  ```bash
  git add desktop/scenes/ui/TitleScreen.tscn desktop/scenes/ui/TitleScreen.gd
  git commit -m "feat: TitleScreen credential forms + POST /api/score integration (5 realms)"
  ```

---

## Task 7: TitleScreen — Name Entry + Character Save

**Files:**
- Modify: `desktop/scenes/ui/TitleScreen.tscn`
- Modify: `desktop/scenes/ui/TitleScreen.gd`
- Create: `desktop/tests/unit/test_name_validation.gd`

- [ ] **Step 7.1: Write failing name validation tests**

  Create `desktop/tests/unit/test_name_validation.gd`:
  ```gdscript
  extends GdUnitTestSuite

  func test_valid_name_plain() -> void:
      assert_bool(TitleScreen.is_valid_name("Tianyang")).is_true()

  func test_valid_name_with_hyphen_apostrophe_dot() -> void:
      assert_bool(TitleScreen.is_valid_name("O'Brien-Jr.")).is_true()

  func test_invalid_name_too_short() -> void:
      assert_bool(TitleScreen.is_valid_name("A")).is_false()

  func test_invalid_name_too_long() -> void:
      assert_bool(TitleScreen.is_valid_name("A".repeat(31))).is_false()

  func test_invalid_name_disallowed_chars() -> void:
      assert_bool(TitleScreen.is_valid_name("name@domain")).is_false()

  func test_invalid_name_empty() -> void:
      assert_bool(TitleScreen.is_valid_name("")).is_false()
  ```

- [ ] **Step 7.2: Run tests — expect FAIL**

  Run GdUnit4. Expected: 6 failures — `TitleScreen.is_valid_name` not defined as static.

- [ ] **Step 7.3: Add Name Entry panel nodes to TitleScreen.tscn**

  In editor, inside `MainContainer` add after `CredentialContainer`:
  ```
  VBoxContainer (name: NameContainer, visible: false)
  ├── Label — text: "Choose your character name"
  ├── LineEdit (name: NameInput, placeholder: "e.g. Dr. Jane Smith", max_length: 30)
  ├── Label (name: NameHint, text: "2–30 chars · Letters, numbers, spaces, - ' .")
  ├── Label (name: NameError, text: "", color: red)
  ├── Button (name: BtnSaveChar, text: "Enter the World →")
  └── Button (name: BtnBackToCredentials, text: "← Back")
  ```

- [ ] **Step 7.4: Add name validation + save logic to `TitleScreen.gd`**

  Add these additions to `TitleScreen.gd` (append to existing file — do not replace):
  ```gdscript
  # ── Name validation ──────────────────────────────────────────────────────────

  # Profanity blocklist — whole-word, case-insensitive (abbreviated sample)
  const PROFANITY_BLOCKLIST: Array[String] = [
      "fuck", "shit", "ass", "bitch", "cunt", "dick", "pussy",
      "bastard", "damn", "crap", "piss", "slut", "whore", "nigger",
      "faggot", "retard", "idiot", "moron", "anus", "cock"
  ]

  static func is_valid_name(name: String) -> bool:
      if name.length() < 2 or name.length() > 30:
          return false
      var allowed := RegEx.new()
      allowed.compile("^[a-zA-Z0-9 \\-''.]+$")
      if not allowed.search(name):
          return false
      return true

  func _contains_profanity(name: String) -> bool:
      var lower := name.to_lower()
      for word in PROFANITY_BLOCKLIST:
          # whole-word match using word boundaries
          var re := RegEx.new()
          re.compile("\\b" + word + "\\b")
          if re.search(lower):
              return true
      return false

  # ── Wiring for name panel (call this from _ready) ────────────────────────────

  func _wire_name_panel() -> void:
      $MainContainer/NameContainer/NameInput.text_changed.connect(_on_name_changed)
      $MainContainer/NameContainer/BtnSaveChar.pressed.connect(_on_save_character)
      $MainContainer/NameContainer/BtnBackToCredentials.pressed.connect(
          func(): _show_panel(Panel.CREDENTIALS)
      )

  func _on_name_changed(new_text: String) -> void:
      var error_label: Label = $MainContainer/NameContainer/NameError
      if new_text.is_empty():
          error_label.text = ""
          return
      if not is_valid_name(new_text):
          error_label.text = "Name must be 2–30 chars: letters, numbers, spaces, - ' ."
      else:
          error_label.text = ""

  func _on_save_character() -> void:
      var name_input: LineEdit = $MainContainer/NameContainer/NameInput
      var char_name := name_input.text.strip_edges()
      if not is_valid_name(char_name):
          set_status("Invalid name format.")
          return
      if _contains_profanity(char_name):
          set_status("Name contains disallowed words.")
          return
      PlayerData.character_name = char_name
      _call_save_character()

  func _call_save_character() -> void:
      var save_btn: Button = $MainContainer/NameContainer/BtnSaveChar
      save_btn.disabled = true
      set_status("Saving...", false)
      var payload := {
          "name": PlayerData.character_name,
          "realm": PlayerData.realm,
          "total_power": PlayerData.total_power,
          "tier": PlayerData.tier,
      }
      var headers := [
          "Content-Type: application/json",
          "Authorization: Bearer " + PlayerData.jwt
      ]
      var err := http.request(
          API_BASE + "/api/character/save",
          headers,
          HTTPClient.METHOD_POST,
          JSON.stringify(payload)
      )
      if err != OK:
          set_status("Network error saving character")
          save_btn.disabled = false

  func _on_save_response(
      result: int, response_code: int,
      _headers: PackedStringArray, body: PackedByteArray
  ) -> void:
      var save_btn: Button = $MainContainer/NameContainer/BtnSaveChar
      save_btn.disabled = false
      if result != HTTPRequest.RESULT_SUCCESS or response_code != 200:
          var msg := body.get_string_from_utf8()
          # Surface uniqueness error from server
          if "already taken" in msg or "duplicate" in msg.to_lower():
              set_status("Name already taken — try another.")
          else:
              set_status("Save failed (HTTP " + str(response_code) + ")")
          return
      # Success — load gold from response
      var json := JSON.new()
      if json.parse(body.get_string_from_utf8()) == OK:
          var data: Dictionary = json.get_data()
          PlayerData.gold = data.get("gold", 500)
      PlayerData.is_authenticated = true
      GameManager.go_to_world()
  ```

  Also update `_ready()` to call `_wire_name_panel()`, and update `_show_panel()` to set `$MainContainer/NameContainer.visible = (panel == Panel.NAME_ENTRY)`.

  Update `_on_score_response` to connect `http.request_completed` to `_on_save_response` after score succeeds:
  ```gdscript
  # In _on_score_response, after setting PlayerData fields and before _show_panel:
  http.request_completed.disconnect(_on_score_response)
  http.request_completed.connect(_on_save_response)
  ```

- [ ] **Step 7.5: Run name validation tests — expect all 6 PASS**

  Run GdUnit4. Expected: all 6 pass.

- [ ] **Step 7.6: Run full flow manually**

  Press F5. Select a realm → fill in credentials → click Submit (will fail if API not configured yet, which is expected — verify UI shows error message cleanly, not a crash). Proceed to name entry → type a name → verify inline validation fires on each keystroke.

- [ ] **Step 7.7: Commit**

  ```bash
  git add desktop/scenes/ui/TitleScreen.tscn desktop/scenes/ui/TitleScreen.gd \
          desktop/tests/unit/test_name_validation.gd
  git commit -m "feat: name entry panel with inline validation, profanity check, character save API call"
  ```

---

## Task 8: Copy MP3 Assets and Wire AudioManager

**Files:**
- Create: `desktop/assets/audio/bgm/` (directory + 6 MP3s)
- Modify: `desktop/src/core/audio_manager.gd`

- [ ] **Step 8.1: Copy MP3 files from web project**

  ```bash
  mkdir -p "/c/Users/Tianyang Liu/Desktop/Games/WS/desktop/assets/audio/bgm"
  cp "/c/Users/Tianyang Liu/Desktop/Games/WS/web/public/audio/bgm/"*.mp3 \
     "/c/Users/Tianyang Liu/Desktop/Games/WS/desktop/assets/audio/bgm/"
  ```

  Verify 6 files copied: `landing.mp3`, `map.mp3`, `pvp.mp3`, `pve.mp3`, `win.mp3`, `lose.mp3`.

- [ ] **Step 8.2: Import MP3s in Godot editor**

  In Godot's FileSystem panel, navigate to `assets/audio/bgm/`. Godot auto-imports MP3 files as `AudioStreamMP3`. No manual action needed — just verify no import errors in the Output panel.

- [ ] **Step 8.3: Implement AudioManager BGM**

  Replace `desktop/src/core/audio_manager.gd`:
  ```gdscript
  extends Node

  const BGM_PATH := "res://assets/audio/bgm/"
  const CROSSFADE_DURATION := 1.0

  var _players: Array[AudioStreamPlayer] = []
  var _active_idx: int = 0
  var _current_track: String = ""
  var _bgm_volume: float = 0.5
  var _sfx_volume: float = 0.5
  var _bgm_muted_prev: float = -1.0
  var _sfx_muted_prev: float = -1.0

  const LOOPS := {"landing": true, "map": true, "pvp": true, "pve": true, "win": false, "lose": false}

  func _ready() -> void:
      for i in 2:
          var p := AudioStreamPlayer.new()
          add_child(p)
          _players.append(p)
      _load_volume_settings()

  func play_bgm(track: String) -> void:
      if track == _current_track:
          return
      _current_track = track
      var next_idx := 1 - _active_idx
      var stream: AudioStream = load(BGM_PATH + track + ".mp3")
      _players[next_idx].stream = stream
      _players[next_idx].volume_db = linear_to_db(0.0)
      _players[next_idx].play()

      var tween := create_tween()
      tween.set_parallel(true)
      tween.tween_property(
          _players[_active_idx], "volume_db",
          linear_to_db(0.0), CROSSFADE_DURATION
      ).from(linear_to_db(_bgm_volume))
      tween.tween_property(
          _players[next_idx], "volume_db",
          linear_to_db(_bgm_volume), CROSSFADE_DURATION
      ).from(linear_to_db(0.0))
      tween.chain().tween_callback(_players[_active_idx].stop)

      _active_idx = next_idx

      if not LOOPS[track]:
          # Stop after stream finishes — no loop
          _players[_active_idx].finished.connect(stop_bgm, CONNECT_ONE_SHOT)

  func stop_bgm() -> void:
      for p in _players:
          p.stop()
      _current_track = ""

  func play_sfx(_effect: String) -> void:
      pass  # SFX implemented in Phase 7

  func set_bgm_volume(vol: float) -> void:
      _bgm_volume = clampf(vol, 0.0, 1.0)
      _players[_active_idx].volume_db = linear_to_db(_bgm_volume)
      _save_volume_settings()

  func set_sfx_volume(vol: float) -> void:
      _sfx_volume = clampf(vol, 0.0, 1.0)
      _save_volume_settings()

  func toggle_bgm_mute() -> void:
      if _bgm_muted_prev >= 0.0:
          set_bgm_volume(_bgm_muted_prev)
          _bgm_muted_prev = -1.0
      else:
          _bgm_muted_prev = _bgm_volume
          set_bgm_volume(0.0)

  func _load_volume_settings() -> void:
      var cfg := ConfigFile.new()
      if cfg.load("user://settings.cfg") == OK:
          _bgm_volume = cfg.get_value("audio", "bgm_volume", 0.5)
          _sfx_volume = cfg.get_value("audio", "sfx_volume", 0.5)

  func _save_volume_settings() -> void:
      var cfg := ConfigFile.new()
      cfg.set_value("audio", "bgm_volume", _bgm_volume)
      cfg.set_value("audio", "sfx_volume", _sfx_volume)
      cfg.save("user://settings.cfg")
  ```

- [ ] **Step 8.4: Play landing BGM from TitleScreen**

  In `TitleScreen.gd`, add to `_ready()`:
  ```gdscript
  AudioManager.play_bgm("landing")
  ```

- [ ] **Step 8.5: Run (F5) and verify landing music plays on startup**

  Expected: `landing.mp3` plays when TitleScreen opens. No errors in Output.

- [ ] **Step 8.6: Commit**

  ```bash
  git add desktop/assets/audio/bgm/ desktop/src/core/audio_manager.gd \
          desktop/scenes/ui/TitleScreen.gd
  git commit -m "feat: copy BGM assets, implement AudioManager crossfade, play landing music on title"
  ```

---

## Task 9: Push and Phase 1 Done

- [ ] **Step 9.1: Run all tests one final time**

  Run GdUnit4 → Run All Tests.
  Expected: all tests in `tests/unit/` pass (scoring + name validation).

- [ ] **Step 9.2: Manually verify end-to-end flow**

  1. Press F5 → `landing.mp3` plays, realm picker visible
  2. Click a realm → credential form appears with correct fields
  3. Fill in numbers → click Submit → (with API configured) score loads and name entry appears; (without API) error message shows cleanly — no crash
  4. Type a name → `A` shows format error; `ValidName` clears error; `fuck` passes format but would be caught on submit
  5. Click Back → returns to credential form

- [ ] **Step 9.3: Push**

  ```bash
  cd "/c/Users/Tianyang Liu/Desktop/Games/WS"
  git push
  ```

---

## Phase 1 Deliverable

At the end of this phase you have:
- Godot 4.6 project that launches cleanly
- 4 autoloads registered and running
- TitleScreen with realm picker → credential forms → name entry
- `POST /api/score` wired up (shows error gracefully if API not live yet)
- `POST /api/character/save` wired up (same)
- Scoring formulas unit-tested in GDScript
- Name validation unit-tested
- Landing BGM plays on startup with crossfade system ready
- WorldScene placeholder loads after successful character save

**Next:** Phase 2 — 3D WorldMap, LocalPlayer (CharacterBody3D), SpringArm3D camera.
