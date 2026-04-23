# Phase 1: Project Scaffold + Autoloads + Title Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a working Godot 4.6 project where a player can launch the game, authenticate with email + password, enter credentials for one or more realms (multi-realm accumulation), receive a combined power score from the API, enter a character name, save the character to Supabase, and land in an empty placeholder world scene — with audio, networking, and player data autoloads running.

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

## Multi-Realm Design

Players may submit credentials for **multiple realms**. Key rules:

- A player can enter any subset of the 5 realms (academia, tech, medicine, creative, law)
- Submitting the same realm twice **overwrites** the previous entry (update, not stack)
- `total_power` = sum of all per-realm power scores
- `dominant_realm` = the realm with the highest individual power contribution (used as battle realm skill)
- On `POST /api/score` the client sends all realm entries as an array; the server returns `total_power`, `tier`, `dominant_realm`, per-stat aggregates, and `realm_scores` (per-realm breakdown)
- Returning players: their saved `realm_scores` are pre-populated from DB on login so they can review/update

---

## Panel Flow

```
AUTH
 └─[new user / no character]──► REALM_ACCUMULATOR
 │                                  ├─[Add/Edit realm]──► CREDENTIALS ──► REALM_ACCUMULATOR
 │                                  └─[Proceed, ≥1 realm]──► NAME_ENTRY ──► WORLD
 └─[returning user, has character]──► REALM_ACCUMULATOR (pre-populated)
                                         ├─[Add/Edit realm]──► CREDENTIALS ──► REALM_ACCUMULATOR
                                         └─[Proceed]──► WORLD (skip name entry)
```

**Panel enum:**
```gdscript
enum Panel { AUTH, REALM_ACCUMULATOR, CREDENTIALS, NAME_ENTRY }
```

---

## File Map

```
desktop/
├── project.godot
├── src/
│   └── core/
│       ├── game_manager.gd         ← unchanged
│       ├── audio_manager.gd        ← unchanged
│       ├── network_manager.gd      ← unchanged
│       └── player_data.gd          ← UPDATED: realm_scores dict, dominant_realm
├── scenes/
│   ├── ui/
│   │   ├── TitleScreen.tscn        ← REWRITTEN: 4-panel layout
│   │   └── TitleScreen.gd          ← REWRITTEN: auth, accumulator, multi-realm flow
│   └── world/
│       └── WorldScene.tscn         ← unchanged
├── assets/
│   └── audio/bgm/                  ← unchanged
└── tests/
    └── unit/
        ├── test_scoring.gd         ← unchanged (11 tests)
        └── test_name_validation.gd ← unchanged (8 tests)
```

---

## API Contract (Backend — Out of Godot Scope)

### Auth
```
POST /api/auth/login
Body: { "email": "...", "password": "..." }
Response 200: {
  "jwt": "...",
  "user_id": "...",
  "character": null | {
    "name": "...",
    "total_power": 4200,
    "tier": "Scholar",
    "gold": 1500,
    "dominant_realm": "academia",
    "realm_scores": { "academia": 3200, "tech": 1000 },
    "realm_skill": "..."
  }
}
Response 401: { "error": "Invalid credentials" }
Response 404: { "error": "No account found" }  ← prompt signup
```

### Score (multi-realm)
```
POST /api/score
Headers: Authorization: Bearer <jwt>
Body: {
  "entries": [
    { "realm": "academia", "years": 10, "h_index": 12, "citations": 500, "publications": 30, "i10": 20 },
    { "realm": "tech", "years": 5, "followers": 200, "stars": 800, "repos": 40, "commits": 3000 }
  ]
}
Response 200: {
  "total_power": 4200,
  "tier": "Scholar",
  "dominant_realm": "academia",
  "realm_scores": { "academia": 3200, "tech": 1000 },
  "expertise": 0.72,
  "prestige": 0.45,
  "impact": 0.61,
  "credentials": 0.58,
  "network": 0.39,
  "realm_skill": "Deep Research"
}
```

### Character Save
```
POST /api/character/save
Headers: Authorization: Bearer <jwt>
Body: {
  "name": "...",
  "dominant_realm": "academia",
  "realm_scores": { "academia": 3200, "tech": 1000 },
  "total_power": 4200,
  "tier": "Scholar"
}
Response 200: { "gold": 500 }
```

---

## Tasks 1–4: Already Complete

Tasks 1 (project init), 2 (autoload stubs), 3 (placeholder WorldScene), and 4 (Scorer + unit tests) are done and committed. Do not re-implement them.

---

## Task 5 (REVISED): Update PlayerData for Multi-Realm

**Status:** Needs update — current `player_data.gd` has `realm: String` (single realm); must become `realm_scores: Dictionary` + `dominant_realm: String`.

**Files:**
- Modify: `desktop/src/core/player_data.gd`

- [ ] **Step 5.1: Read current player_data.gd**

  Read `desktop/src/core/player_data.gd` to understand the current state.

- [ ] **Step 5.2: Rewrite player_data.gd**

  Replace the full file:
  ```gdscript
  class_name PlayerData
  extends Node

  var jwt: String = ""
  var user_id: String = ""
  var character_name: String = ""
  var dominant_realm: String = ""
  var realm_scores: Dictionary = {}
  var total_power: int = 0
  var tier: String = ""
  var gold: int = 0
  var realm_skill: String = ""

  ## Aggregate stats derived from all realm submissions combined
  var expertise: float = 0.0
  var prestige: float = 0.0
  var impact: float = 0.0
  var credentials: float = 0.0
  var network: float = 0.0

  ## Battle-allocated stats (set on PrepScreen)
  var battle_hp: int = 0
  var battle_attack: int = 0
  var battle_defence: int = 0

  var is_authenticated: bool = false

  ## Populate from a character dict returned by the auth or save API.
  func load_from_dict(data: Dictionary) -> void:
      character_name = data.get("name", "")
      dominant_realm = data.get("dominant_realm", "")
      realm_scores = data.get("realm_scores", {})
      total_power = data.get("total_power", 0)
      tier = data.get("tier", "Apprentice")
      gold = data.get("gold", 0)
      realm_skill = data.get("realm_skill", "")

  func clear() -> void:
      jwt = ""
      user_id = ""
      character_name = ""
      dominant_realm = ""
      realm_scores = {}
      total_power = 0
      tier = ""
      gold = 0
      realm_skill = ""
      expertise = 0.0
      prestige = 0.0
      impact = 0.0
      credentials = 0.0
      network = 0.0
      battle_hp = 0
      battle_attack = 0
      battle_defence = 0
      is_authenticated = false
  ```

- [ ] **Step 5.3: Commit**

  ```bash
  git add desktop/src/core/player_data.gd
  git commit -m "feat: update PlayerData for multi-realm (realm_scores dict + dominant_realm)"
  ```

---

## Task 6 (REVISED): Rewrite TitleScreen — Scene Structure

**Status:** Current TitleScreen.tscn has old single-realm layout. Rewrite from scratch.

**Files:**
- Rewrite: `desktop/scenes/ui/TitleScreen.tscn`

The scene must have these top-level containers inside `MainContainer` (a centered `VBoxContainer`), all initially `visible = false` except `AuthContainer`:

```
TitleScreen (Control, full-rect)
├── Background (ColorRect, #0d0d1a, full-rect)
├── MainContainer (VBoxContainer, centered 640×560)
│   ├── TitleLabel (Label, "World Scale", font 48, centered)
│   ├── StatusLabel (Label, "", centered — for errors/info)
│   │
│   ├── AuthContainer (VBoxContainer, visible=true)
│   │   ├── EmailInput (LineEdit, placeholder="Email")
│   │   ├── PasswordInput (LineEdit, placeholder="Password", secret=true)
│   │   ├── BtnLogin (Button, "Login")
│   │   └── BtnSignup (Button, "Create Account")
│   │
│   ├── AccumulatorContainer (VBoxContainer, visible=false)
│   │   ├── AccumTitle (Label, "Your Realm Scores", font 20, centered)
│   │   ├── RealmList (VBoxContainer)   ← realm score rows added/removed at runtime
│   │   ├── TotalPowerLabel (Label, "Total Power: 0", centered)
│   │   ├── BtnAddRealm (Button, "Add / Update a Realm")
│   │   └── BtnProceed (Button, "Proceed →", disabled=true)
│   │
│   ├── RealmPickerContainer (VBoxContainer, visible=false)
│   │   ├── PickerTitle (Label, "Choose a realm to add or update", centered)
│   │   ├── RealmGrid (GridContainer, columns=3)
│   │   │   ├── BtnAcademia (Button, "Academia", min 160×60)
│   │   │   ├── BtnTech (Button, "Tech", min 160×60)
│   │   │   ├── BtnMedicine (Button, "Medicine", min 160×60)
│   │   │   ├── BtnCreative (Button, "Creative", min 160×60)
│   │   │   └── BtnLaw (Button, "Law", min 160×60)
│   │   └── BtnBackToAccum (Button, "← Back")
│   │
│   ├── CredentialContainer (VBoxContainer, visible=false)
│   │   ├── FormTitle (Label, "")
│   │   ├── AcademiaForm (VBoxContainer, visible=false)
│   │   │   ├── Row/Label "Years active" + SpinBox YearsActive (0–60)
│   │   │   ├── Row/Label "H-index" + SpinBox HIndex (0–500)
│   │   │   ├── Row/Label "Citations" + SpinBox Citations (0–100000)
│   │   │   ├── Row/Label "Publications" + SpinBox Publications (0–2000)
│   │   │   └── Row/Label "i10-index" + SpinBox I10Index (0–1000)
│   │   ├── TechForm (VBoxContainer, visible=false)
│   │   │   ├── Row/Label "Years active" + SpinBox YearsActive (0–60)
│   │   │   ├── Row/Label "GitHub followers" + SpinBox Followers (0–1000000)
│   │   │   ├── Row/Label "Stars (total)" + SpinBox Stars (0–500000)
│   │   │   ├── Row/Label "Repositories" + SpinBox Repos (0–5000)
│   │   │   └── Row/Label "Commits (total)" + SpinBox Commits (0–100000)
│   │   ├── MedicineForm (VBoxContainer, visible=false)
│   │   │   ├── Row/Label "Years practicing" + SpinBox YearsPracticing (0–60)
│   │   │   ├── Row/Label "Papers published" + SpinBox Papers (0–1000)
│   │   │   ├── Row/Label "Citations" + SpinBox Citations (0–50000)
│   │   │   └── Row/Label "Patients treated" + SpinBox Patients (0–100000)
│   │   ├── CreativeForm (VBoxContainer, visible=false)
│   │   │   ├── Row/Label "Years active" + SpinBox YearsActive (0–60)
│   │   │   ├── Row/Label "Major works" + SpinBox Works (0–1000)
│   │   │   ├── Row/Label "Awards" + SpinBox Awards (0–200)
│   │   │   └── Row/Label "Audience size" + SpinBox Audience (0–10000000, step 1000)
│   │   ├── LawForm (VBoxContainer, visible=false)
│   │   │   ├── Row/Label "Years practicing" + SpinBox YearsPracticing (0–60)
│   │   │   ├── Row/Label "Cases handled" + SpinBox Cases (0–5000)
│   │   │   ├── Row/Label "Cases won" + SpinBox Wins (0–5000)
│   │   │   └── Row/Label "Bar admissions" + SpinBox Admissions (0–30)
│   │   ├── BtnBack (Button, "← Back")
│   │   └── BtnSubmit (Button, "Add to Profile")
│   │
│   └── NameContainer (VBoxContainer, visible=false)
│       ├── NamePrompt (Label, "Choose your character name", font 20, centered)
│       ├── NameInput (LineEdit, placeholder="e.g. Dr. Jane Smith", max_length=30)
│       ├── NameHint (Label, "2–30 chars · letters, numbers, spaces, - ' .", font 13, gray)
│       ├── NameError (Label, "", red)
│       ├── BtnSaveChar (Button, "Enter the World")
│       └── BtnBackToAccum2 (Button, "← Back")
│
└── Http (HTTPRequest)
```

- [ ] **Step 6.1: Write TitleScreen.tscn**

  Write the full `.tscn` file to `desktop/scenes/ui/TitleScreen.tscn`. Preserve the Godot 4 text format (`format=3`). Generate realistic UIDs. The `PasswordInput` LineEdit must have `secret = true` so the text is hidden. All containers except `AuthContainer` start with `visible = false`.

- [ ] **Step 6.2: Commit**

  ```bash
  git add desktop/scenes/ui/TitleScreen.tscn
  git commit -m "feat: rewrite TitleScreen scene — 4-panel layout (auth, accumulator, realm picker, credentials, name entry)"
  ```

---

## Task 7 (REVISED): Rewrite TitleScreen.gd — Full Multi-Realm Logic

**Files:**
- Rewrite: `desktop/scenes/ui/TitleScreen.gd`

- [ ] **Step 7.1: Write the full TitleScreen.gd**

  Write this complete file to `desktop/scenes/ui/TitleScreen.gd`:

  ```gdscript
  class_name TitleScreen
  extends Control

  enum Panel { AUTH, REALM_ACCUMULATOR, CREDENTIALS, NAME_ENTRY }

  const API_BASE := "https://YOUR_API_BASE_URL"

  const PROFANITY_BLOCKLIST: Array[String] = [
      "fuck", "shit", "ass", "bitch", "cunt", "dick", "pussy",
      "bastard", "damn", "crap", "piss", "slut", "whore", "nigger",
      "faggot", "retard", "idiot", "moron", "anus", "cock"
  ]

  ## Realm scores accumulated locally before submitting.
  ## Key = realm string, value = per-field Dictionary of raw inputs.
  ## e.g. {"academia": {"years": 10, "h_index": 12, ...}}
  var _pending_entries: Dictionary = {}

  ## Which realm is currently being edited in the credential form.
  var _editing_realm: String = ""

  ## Tracks which HTTP response we are waiting for.
  enum HttpState { NONE, AUTH, SCORE, SAVE }
  var _http_state: HttpState = HttpState.NONE

  static var _name_regex: RegEx = null
  static var _profanity_regex: RegEx = null

  # ── Node references ───────────────────────────────────────────────────────────

  @onready var status_label: Label = $MainContainer/StatusLabel

  @onready var auth_container: VBoxContainer = $MainContainer/AuthContainer
  @onready var email_input: LineEdit = $MainContainer/AuthContainer/EmailInput
  @onready var password_input: LineEdit = $MainContainer/AuthContainer/PasswordInput
  @onready var btn_login: Button = $MainContainer/AuthContainer/BtnLogin
  @onready var btn_signup: Button = $MainContainer/AuthContainer/BtnSignup

  @onready var accum_container: VBoxContainer = $MainContainer/AccumulatorContainer
  @onready var realm_list: VBoxContainer = $MainContainer/AccumulatorContainer/RealmList
  @onready var total_power_label: Label = $MainContainer/AccumulatorContainer/TotalPowerLabel
  @onready var btn_add_realm: Button = $MainContainer/AccumulatorContainer/BtnAddRealm
  @onready var btn_proceed: Button = $MainContainer/AccumulatorContainer/BtnProceed

  @onready var realm_picker_container: VBoxContainer = $MainContainer/RealmPickerContainer
  @onready var realm_grid: GridContainer = $MainContainer/RealmPickerContainer/RealmGrid

  @onready var credential_container: VBoxContainer = $MainContainer/CredentialContainer
  @onready var form_title: Label = $MainContainer/CredentialContainer/FormTitle
  @onready var btn_submit: Button = $MainContainer/CredentialContainer/BtnSubmit
  @onready var btn_cred_back: Button = $MainContainer/CredentialContainer/BtnBack

  @onready var name_container: VBoxContainer = $MainContainer/NameContainer
  @onready var name_input: LineEdit = $MainContainer/NameContainer/NameInput
  @onready var name_error: Label = $MainContainer/NameContainer/NameError
  @onready var btn_save_char: Button = $MainContainer/NameContainer/BtnSaveChar

  @onready var http: HTTPRequest = $Http

  # ── Lifecycle ─────────────────────────────────────────────────────────────────

  func _ready() -> void:
      btn_login.pressed.connect(_on_login_pressed)
      btn_signup.pressed.connect(_on_signup_pressed)
      btn_add_realm.pressed.connect(func() -> void: _show_panel(Panel.REALM_ACCUMULATOR.REALM_PICKER if false else Panel.CREDENTIALS))
      btn_add_realm.pressed.connect(_on_add_realm_pressed)
      btn_proceed.pressed.connect(_on_proceed_pressed)
      realm_grid.get_node("BtnAcademia").pressed.connect(_on_realm_picked.bind("academia"))
      realm_grid.get_node("BtnTech").pressed.connect(_on_realm_picked.bind("tech"))
      realm_grid.get_node("BtnMedicine").pressed.connect(_on_realm_picked.bind("medicine"))
      realm_grid.get_node("BtnCreative").pressed.connect(_on_realm_picked.bind("creative"))
      realm_grid.get_node("BtnLaw").pressed.connect(_on_realm_picked.bind("law"))
      $MainContainer/RealmPickerContainer/BtnBackToAccum.pressed.connect(
          func() -> void: _show_panel(Panel.REALM_ACCUMULATOR)
      )
      btn_submit.pressed.connect(_on_submit_realm)
      btn_cred_back.pressed.connect(func() -> void: _show_panel(Panel.REALM_ACCUMULATOR))
      name_input.text_changed.connect(_on_name_changed)
      btn_save_char.pressed.connect(_on_save_character)
      $MainContainer/NameContainer/BtnBackToAccum2.pressed.connect(
          func() -> void: _show_panel(Panel.REALM_ACCUMULATOR)
      )
      http.request_completed.connect(_on_http_response)
      AudioManager.play_bgm("landing")

  # ── Panel switching ───────────────────────────────────────────────────────────

  func _show_panel(panel: Panel) -> void:
      auth_container.visible = (panel == Panel.AUTH)
      accum_container.visible = (panel == Panel.REALM_ACCUMULATOR)
      realm_picker_container.visible = (panel == Panel.CREDENTIALS and _editing_realm.is_empty())
      credential_container.visible = (panel == Panel.CREDENTIALS and not _editing_realm.is_empty())
      name_container.visible = (panel == Panel.NAME_ENTRY)
      status_label.text = ""

  func _show_realm_picker() -> void:
      auth_container.visible = false
      accum_container.visible = false
      realm_picker_container.visible = true
      credential_container.visible = false
      name_container.visible = false
      status_label.text = ""

  func _show_credential_form(realm: String) -> void:
      _editing_realm = realm
      form_title.text = realm.capitalize() + " — Enter your metrics"
      for form_name: String in ["AcademiaForm", "TechForm", "MedicineForm", "CreativeForm", "LawForm"]:
          credential_container.get_node(form_name).visible = false
      var target_form: String
      match realm:
          "academia":  target_form = "AcademiaForm"
          "tech":      target_form = "TechForm"
          "medicine":  target_form = "MedicineForm"
          "creative":  target_form = "CreativeForm"
          "law":       target_form = "LawForm"
          _:
              push_error("TitleScreen: unknown realm '%s'" % realm)
              return
      credential_container.get_node(target_form).visible = true
      _prefill_form(realm)
      auth_container.visible = false
      accum_container.visible = false
      realm_picker_container.visible = false
      credential_container.visible = true
      name_container.visible = false
      status_label.text = ""

  # ── Auth ──────────────────────────────────────────────────────────────────────

  func _on_login_pressed() -> void:
      var email := email_input.text.strip_edges()
      var password := password_input.text
      if email.is_empty() or password.is_empty():
          set_status("Please enter your email and password.")
          return
      btn_login.disabled = true
      btn_signup.disabled = true
      set_status("Logging in...", false)
      var payload: Dictionary = {"email": email, "password": password}
      var headers: PackedStringArray = ["Content-Type: application/json"]
      _http_state = HttpState.AUTH
      var err := http.request(
          API_BASE + "/api/auth/login",
          headers,
          HTTPClient.METHOD_POST,
          JSON.stringify(payload)
      )
      if err != OK:
          set_status("Network error: " + str(err))
          btn_login.disabled = false
          btn_signup.disabled = false
          _http_state = HttpState.NONE

  func _on_signup_pressed() -> void:
      var email := email_input.text.strip_edges()
      var password := password_input.text
      if email.is_empty() or password.is_empty():
          set_status("Please enter your email and password.")
          return
      btn_login.disabled = true
      btn_signup.disabled = true
      set_status("Creating account...", false)
      var payload: Dictionary = {"email": email, "password": password}
      var headers: PackedStringArray = ["Content-Type: application/json"]
      _http_state = HttpState.AUTH
      var err := http.request(
          API_BASE + "/api/auth/signup",
          headers,
          HTTPClient.METHOD_POST,
          JSON.stringify(payload)
      )
      if err != OK:
          set_status("Network error: " + str(err))
          btn_login.disabled = false
          btn_signup.disabled = false
          _http_state = HttpState.NONE

  func _on_auth_response(response_code: int, body: PackedByteArray) -> void:
      btn_login.disabled = false
      btn_signup.disabled = false
      if response_code == 404:
          set_status("No account found. Use Create Account.")
          return
      if response_code == 401:
          set_status("Incorrect email or password.")
          return
      if response_code != 200:
          set_status("Auth error (HTTP " + str(response_code) + ")")
          return
      var json := JSON.new()
      if json.parse(body.get_string_from_utf8()) != OK:
          set_status("Invalid response from server")
          return
      var raw: Variant = json.get_data()
      if not raw is Dictionary:
          set_status("Unexpected response format")
          return
      var data: Dictionary = raw
      PlayerData.jwt = data.get("jwt", "")
      PlayerData.user_id = data.get("user_id", "")
      var character: Variant = data.get("character", null)
      if character is Dictionary:
          PlayerData.load_from_dict(character)
          _pending_entries = _realm_scores_to_pending(PlayerData.realm_scores)
          PlayerData.is_authenticated = true
      _show_accumulator()

  func _realm_scores_to_pending(scores: Dictionary) -> Dictionary:
      ## Convert {realm: power} from DB into a local pending structure.
      ## Since we only have the aggregate score (not raw inputs) from DB,
      ## we store a sentinel so the form shows as "already submitted".
      var result: Dictionary = {}
      for realm: String in scores:
          result[realm] = {"_loaded_from_db": true, "_power": scores[realm]}
      return result

  # ── Realm accumulator ─────────────────────────────────────────────────────────

  func _show_accumulator() -> void:
      _rebuild_realm_list()
      _update_total_power_label()
      btn_proceed.disabled = _pending_entries.is_empty()
      auth_container.visible = false
      accum_container.visible = true
      realm_picker_container.visible = false
      credential_container.visible = false
      name_container.visible = false
      status_label.text = ""

  func _rebuild_realm_list() -> void:
      for child: Node in realm_list.get_children():
          child.queue_free()
      if _pending_entries.is_empty():
          var empty_label := Label.new()
          empty_label.text = "No realms added yet."
          empty_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
          realm_list.add_child(empty_label)
          return
      for realm: String in _pending_entries:
          var entry: Dictionary = _pending_entries[realm]
          var row := HBoxContainer.new()
          var lbl := Label.new()
          if entry.get("_loaded_from_db", false):
              lbl.text = realm.capitalize() + "  —  " + str(entry.get("_power", 0)) + " pts (from profile)"
          else:
              lbl.text = realm.capitalize() + "  —  (pending submit)"
          lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
          var btn_edit := Button.new()
          btn_edit.text = "Edit"
          btn_edit.pressed.connect(_on_realm_picked.bind(realm))
          var btn_remove := Button.new()
          btn_remove.text = "Remove"
          btn_remove.pressed.connect(_on_remove_realm.bind(realm))
          row.add_child(lbl)
          row.add_child(btn_edit)
          row.add_child(btn_remove)
          realm_list.add_child(row)

  func _update_total_power_label() -> void:
      var known_power: int = 0
      for realm: String in _pending_entries:
          var entry: Dictionary = _pending_entries[realm]
          if entry.get("_loaded_from_db", false):
              known_power += int(entry.get("_power", 0))
      if known_power > 0:
          total_power_label.text = "Known total: " + str(known_power) + " pts (recalculated on Proceed)"
      else:
          total_power_label.text = "Submit credentials to calculate power."

  func _on_add_realm_pressed() -> void:
      _show_realm_picker()

  func _on_remove_realm(realm: String) -> void:
      _pending_entries.erase(realm)
      _rebuild_realm_list()
      _update_total_power_label()
      btn_proceed.disabled = _pending_entries.is_empty()

  # ── Realm picker → credential form ───────────────────────────────────────────

  func _on_realm_picked(realm: String) -> void:
      _show_credential_form(realm)

  func _prefill_form(realm: String) -> void:
      if not _pending_entries.has(realm):
          return
      var entry: Dictionary = _pending_entries[realm]
      if entry.get("_loaded_from_db", false):
          return
      var f: Node
      match realm:
          "academia":
              f = credential_container.get_node("AcademiaForm")
              f.get_node("YearsActive").value = entry.get("years", 0)
              f.get_node("HIndex").value = entry.get("h_index", 0)
              f.get_node("Citations").value = entry.get("citations", 0)
              f.get_node("Publications").value = entry.get("publications", 0)
              f.get_node("I10Index").value = entry.get("i10", 0)
          "tech":
              f = credential_container.get_node("TechForm")
              f.get_node("YearsActive").value = entry.get("years", 0)
              f.get_node("Followers").value = entry.get("followers", 0)
              f.get_node("Stars").value = entry.get("stars", 0)
              f.get_node("Repos").value = entry.get("repos", 0)
              f.get_node("Commits").value = entry.get("commits", 0)
          "medicine":
              f = credential_container.get_node("MedicineForm")
              f.get_node("YearsPracticing").value = entry.get("years", 0)
              f.get_node("Papers").value = entry.get("papers", 0)
              f.get_node("Citations").value = entry.get("citations", 0)
              f.get_node("Patients").value = entry.get("patients", 0)
          "creative":
              f = credential_container.get_node("CreativeForm")
              f.get_node("YearsActive").value = entry.get("years", 0)
              f.get_node("Works").value = entry.get("works", 0)
              f.get_node("Awards").value = entry.get("awards", 0)
              f.get_node("Audience").value = entry.get("audience", 0)
          "law":
              f = credential_container.get_node("LawForm")
              f.get_node("YearsPracticing").value = entry.get("years", 0)
              f.get_node("Cases").value = entry.get("cases", 0)
              f.get_node("Wins").value = entry.get("wins", 0)
              f.get_node("Admissions").value = entry.get("admissions", 0)

  func _on_submit_realm() -> void:
      var fields := _read_form_fields(_editing_realm)
      _pending_entries[_editing_realm] = fields
      _editing_realm = ""
      _show_accumulator()

  func _read_form_fields(realm: String) -> Dictionary:
      var fields: Dictionary = {}
      match realm:
          "academia":
              var f := credential_container.get_node("AcademiaForm")
              fields["years"] = f.get_node("YearsActive").value
              fields["h_index"] = f.get_node("HIndex").value
              fields["citations"] = f.get_node("Citations").value
              fields["publications"] = f.get_node("Publications").value
              fields["i10"] = f.get_node("I10Index").value
          "tech":
              var f := credential_container.get_node("TechForm")
              fields["years"] = f.get_node("YearsActive").value
              fields["followers"] = f.get_node("Followers").value
              fields["stars"] = f.get_node("Stars").value
              fields["repos"] = f.get_node("Repos").value
              fields["commits"] = f.get_node("Commits").value
          "medicine":
              var f := credential_container.get_node("MedicineForm")
              fields["years"] = f.get_node("YearsPracticing").value
              fields["papers"] = f.get_node("Papers").value
              fields["citations"] = f.get_node("Citations").value
              fields["patients"] = f.get_node("Patients").value
          "creative":
              var f := credential_container.get_node("CreativeForm")
              fields["years"] = f.get_node("YearsActive").value
              fields["works"] = f.get_node("Works").value
              fields["awards"] = f.get_node("Awards").value
              fields["audience"] = f.get_node("Audience").value
          "law":
              var f := credential_container.get_node("LawForm")
              fields["years"] = f.get_node("YearsPracticing").value
              fields["cases"] = f.get_node("Cases").value
              fields["wins"] = f.get_node("Wins").value
              fields["admissions"] = f.get_node("Admissions").value
          _:
              push_error("TitleScreen: _read_form_fields unknown realm '%s'" % realm)
      return fields

  # ── Proceed → POST /api/score ─────────────────────────────────────────────────

  func _on_proceed_pressed() -> void:
      btn_proceed.disabled = true
      set_status("Calculating power...", false)
      var entries: Array = []
      for realm: String in _pending_entries:
          var entry: Dictionary = _pending_entries[realm].duplicate()
          entry["realm"] = realm
          entry.erase("_loaded_from_db")
          entry.erase("_power")
          entries.append(entry)
      var payload: Dictionary = {"entries": entries}
      var headers: PackedStringArray = [
          "Content-Type: application/json",
          "Authorization: Bearer " + PlayerData.jwt
      ]
      _http_state = HttpState.SCORE
      var err := http.request(
          API_BASE + "/api/score",
          headers,
          HTTPClient.METHOD_POST,
          JSON.stringify(payload)
      )
      if err != OK:
          set_status("Network error: " + str(err))
          btn_proceed.disabled = false
          _http_state = HttpState.NONE

  func _on_score_response(response_code: int, body: PackedByteArray) -> void:
      btn_proceed.disabled = false
      if response_code != 200:
          set_status("Score API error (HTTP " + str(response_code) + ")")
          return
      var json := JSON.new()
      if json.parse(body.get_string_from_utf8()) != OK:
          set_status("Invalid response from server")
          return
      var raw: Variant = json.get_data()
      if not raw is Dictionary:
          set_status("Unexpected response format")
          return
      var data: Dictionary = raw
      PlayerData.total_power = data.get("total_power", 0)
      PlayerData.tier = data.get("tier", "Apprentice")
      PlayerData.dominant_realm = data.get("dominant_realm", "")
      PlayerData.realm_scores = data.get("realm_scores", {})
      PlayerData.expertise = data.get("expertise", 0.0)
      PlayerData.prestige = data.get("prestige", 0.0)
      PlayerData.impact = data.get("impact", 0.0)
      PlayerData.credentials = data.get("credentials", 0.0)
      PlayerData.network = data.get("network", 0.0)
      PlayerData.realm_skill = data.get("realm_skill", "")
      set_status("Power: " + str(PlayerData.total_power) + " — Tier: " + PlayerData.tier, false)
      if PlayerData.character_name.is_empty():
          _show_panel(Panel.NAME_ENTRY)
      else:
          _call_save_character()

  # ── Name entry ────────────────────────────────────────────────────────────────

  static func is_valid_name(name: String) -> bool:
      if name.length() < 2 or name.length() > 30:
          return false
      if _name_regex == null:
          _name_regex = RegEx.new()
          _name_regex.compile("^[a-zA-Z0-9 \\-'.]+$")
      if not _name_regex.search(name):
          return false
      return true

  func _contains_profanity(name: String) -> bool:
      if _profanity_regex == null:
          _profanity_regex = RegEx.new()
          var pattern := "\\b(" + "|".join(PROFANITY_BLOCKLIST) + ")\\b"
          _profanity_regex.compile(pattern)
      return _profanity_regex.search(name.to_lower()) != null

  func _on_name_changed(new_text: String) -> void:
      if new_text.is_empty():
          name_error.text = ""
          return
      name_error.text = "" if is_valid_name(new_text) else "2–30 chars: letters, numbers, spaces, - ' ."

  func _on_save_character() -> void:
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
      btn_save_char.disabled = true
      set_status("Saving...", false)
      var payload: Dictionary = {
          "name": PlayerData.character_name,
          "dominant_realm": PlayerData.dominant_realm,
          "realm_scores": PlayerData.realm_scores,
          "total_power": PlayerData.total_power,
          "tier": PlayerData.tier,
      }
      var headers: PackedStringArray = [
          "Content-Type: application/json",
          "Authorization: Bearer " + PlayerData.jwt
      ]
      _http_state = HttpState.SAVE
      var err := http.request(
          API_BASE + "/api/character/save",
          headers,
          HTTPClient.METHOD_POST,
          JSON.stringify(payload)
      )
      if err != OK:
          set_status("Network error saving character")
          btn_save_char.disabled = false
          _http_state = HttpState.NONE

  func _on_save_response(response_code: int, body: PackedByteArray) -> void:
      btn_save_char.disabled = false
      if response_code != 200:
          var msg := body.get_string_from_utf8()
          if "already taken" in msg or "duplicate" in msg.to_lower():
              set_status("Name already taken — try another.")
          else:
              set_status("Save failed (HTTP " + str(response_code) + ")")
          return
      var json := JSON.new()
      if json.parse(body.get_string_from_utf8()) != OK:
          set_status("Invalid response from server")
          return
      var raw: Variant = json.get_data()
      if not raw is Dictionary:
          set_status("Unexpected response format")
          return
      var data: Dictionary = raw
      PlayerData.gold = data.get("gold", 500)
      PlayerData.is_authenticated = true
      GameManager.go_to_world()

  # ── HTTP routing ──────────────────────────────────────────────────────────────

  func _on_http_response(
      result: int, response_code: int,
      _headers: PackedStringArray, body: PackedByteArray
  ) -> void:
      if result != HTTPRequest.RESULT_SUCCESS:
          set_status("Connection failed (result " + str(result) + ")")
          btn_login.disabled = false
          btn_signup.disabled = false
          btn_proceed.disabled = _pending_entries.is_empty()
          btn_save_char.disabled = false
          _http_state = HttpState.NONE
          return
      var state := _http_state
      _http_state = HttpState.NONE
      match state:
          HttpState.AUTH:  _on_auth_response(response_code, body)
          HttpState.SCORE: _on_score_response(response_code, body)
          HttpState.SAVE:  _on_save_response(response_code, body)
          _: push_error("TitleScreen: HTTP response with no matching state")

  # ── Status ────────────────────────────────────────────────────────────────────

  func set_status(msg: String, is_error: bool = true) -> void:
      status_label.text = msg
      status_label.modulate = Color.RED if is_error else Color.GREEN
  ```

- [ ] **Step 7.2: Verify the _ready() signal wiring**

  The `_ready()` function above has a leftover duplicate connection for `btn_add_realm`. Remove the first (incorrect) line and keep only `btn_add_realm.pressed.connect(_on_add_realm_pressed)`. The correct `_ready()` should be:

  ```gdscript
  func _ready() -> void:
      btn_login.pressed.connect(_on_login_pressed)
      btn_signup.pressed.connect(_on_signup_pressed)
      btn_add_realm.pressed.connect(_on_add_realm_pressed)
      btn_proceed.pressed.connect(_on_proceed_pressed)
      realm_grid.get_node("BtnAcademia").pressed.connect(_on_realm_picked.bind("academia"))
      realm_grid.get_node("BtnTech").pressed.connect(_on_realm_picked.bind("tech"))
      realm_grid.get_node("BtnMedicine").pressed.connect(_on_realm_picked.bind("medicine"))
      realm_grid.get_node("BtnCreative").pressed.connect(_on_realm_picked.bind("creative"))
      realm_grid.get_node("BtnLaw").pressed.connect(_on_realm_picked.bind("law"))
      $MainContainer/RealmPickerContainer/BtnBackToAccum.pressed.connect(
          func() -> void: _show_panel(Panel.REALM_ACCUMULATOR)
      )
      btn_submit.pressed.connect(_on_submit_realm)
      btn_cred_back.pressed.connect(func() -> void: _show_panel(Panel.REALM_ACCUMULATOR))
      name_input.text_changed.connect(_on_name_changed)
      btn_save_char.pressed.connect(_on_save_character)
      $MainContainer/NameContainer/BtnBackToAccum2.pressed.connect(
          func() -> void: _show_panel(Panel.REALM_ACCUMULATOR)
      )
      http.request_completed.connect(_on_http_response)
      AudioManager.play_bgm("landing")
  ```

- [ ] **Step 7.3: Commit**

  ```bash
  git add desktop/scenes/ui/TitleScreen.gd
  git commit -m "feat: rewrite TitleScreen.gd — multi-realm accumulator, email/pw auth, HttpState routing"
  ```

---

## Task 8: AudioManager (Already Complete)

AudioManager was implemented and committed in the prior session. No changes needed.

---

## Task 9: Final Verification + Push

- [ ] **Step 9.1: Verify test_name_validation.gd still passes**

  The `is_valid_name` static function signature is unchanged. All 8 tests should still be valid. Manually trace each test case against the current implementation to confirm.

- [ ] **Step 9.2: Verify panel flow logic by reading TitleScreen.gd**

  Trace these scenarios mentally:
  1. New user: LOGIN → auth response has no character → accumulator (empty) → add academia → credential form → submit → accumulator (1 entry) → Proceed → score API → name entry → save → world
  2. Returning user: LOGIN → auth response has character → accumulator (pre-populated) → Proceed → score API → world (skips name entry since `character_name` not empty)
  3. Update: accumulator → Edit on existing entry → credential form pre-filled → submit → accumulator updated

- [ ] **Step 9.3: Commit plan update**

  ```bash
  git add desktop/design/plans/2026-04-22-phase1-scaffold-auth-scoring.md
  git commit -m "docs: update Phase 1 plan for multi-realm accumulator + email/pw auth"
  ```

- [ ] **Step 9.4: Push**

  ```bash
  git push -u origin feature/phase1-scaffold
  ```

---

## Phase 1 Deliverable (Updated)

At the end of this phase you have:

- Godot 4.6 project that launches cleanly
- 4 autoloads registered and running (PlayerData with multi-realm fields)
- TitleScreen with:
  - Email + password auth (login + signup)
  - Realm accumulator: add/edit/remove any of 5 realms, pre-populated for returning users
  - Credential forms for all 5 realms with pre-fill support
  - `POST /api/score` with multi-realm `entries` array payload
  - `POST /api/character/save` with `dominant_realm` + `realm_scores`
  - Name entry (skipped for returning users who already have a name)
- Scoring formulas unit-tested (11 tests)
- Name validation unit-tested (8 tests)
- Landing BGM plays on startup
- WorldScene placeholder loads after successful character save

**Next:** Phase 2 — 3D WorldMap, LocalPlayer (CharacterBody3D), SpringArm3D camera.
