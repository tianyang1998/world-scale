class_name TitleScreen
extends Control

enum Panel { AUTH, REALM_ACCUMULATOR, CREDENTIALS, NAME_ENTRY }

# API base is read from SupabaseConfig (user://supabase.cfg) at call time.
var _api_base: String:
	get: return SupabaseConfig.api_base

const PROFANITY_BLOCKLIST: Array[String] = [
	"fuck", "shit", "ass", "bitch", "cunt", "dick", "pussy",
	"bastard", "damn", "crap", "piss", "slut", "whore", "nigger",
	"faggot", "retard", "idiot", "moron", "anus", "cock"
]

## Realm credentials accumulated locally before submitting.
## Key = realm string, value = per-field Dictionary of raw inputs.
## Loaded-from-DB entries carry "_loaded_from_db": true and "_power": int.
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
	if not SupabaseConfig.is_configured:
		set_status("supabase.cfg missing — see docs/supabase-setup.md", true)
		btn_login.disabled = true
		btn_signup.disabled = true

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
		func() -> void: _show_accumulator()
	)
	btn_submit.pressed.connect(_on_submit_realm)
	btn_cred_back.pressed.connect(func() -> void: _show_accumulator())
	name_input.text_changed.connect(_on_name_changed)
	btn_save_char.pressed.connect(_on_save_character)
	$MainContainer/NameContainer/BtnBackToAccum2.pressed.connect(
		func() -> void: _show_accumulator()
	)
	http.request_completed.connect(_on_http_response)
	AudioManager.play_bgm("landing")

# ── Panel visibility helpers ──────────────────────────────────────────────────

func _hide_all() -> void:
	auth_container.visible = false
	accum_container.visible = false
	realm_picker_container.visible = false
	credential_container.visible = false
	name_container.visible = false
	status_label.text = ""

func _show_accumulator() -> void:
	_editing_realm = ""
	_rebuild_realm_list()
	_update_total_power_label()
	btn_proceed.disabled = _pending_entries.is_empty()
	_hide_all()
	accum_container.visible = true

func _show_realm_picker() -> void:
	_hide_all()
	realm_picker_container.visible = true

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
	_hide_all()
	credential_container.visible = true

func _show_name_entry() -> void:
	_hide_all()
	name_container.visible = true

# ── Auth ──────────────────────────────────────────────────────────────────────

func _on_login_pressed() -> void:
	var email := email_input.text.strip_edges()
	var password := password_input.text
	if email.is_empty() or password.is_empty():
		set_status("Please enter your email and password.")
		return
	_set_auth_buttons_disabled(true)
	set_status("Logging in...", false)
	_http_state = HttpState.AUTH
	var err := http.request(
		_api_base + "/api/auth/login",
		["Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		JSON.stringify({"email": email, "password": password})
	)
	if err != OK:
		set_status("Network error: " + str(err))
		_set_auth_buttons_disabled(false)
		_http_state = HttpState.NONE

func _on_signup_pressed() -> void:
	var email := email_input.text.strip_edges()
	var password := password_input.text
	if email.is_empty() or password.is_empty():
		set_status("Please enter your email and password.")
		return
	_set_auth_buttons_disabled(true)
	set_status("Creating account...", false)
	_http_state = HttpState.AUTH
	var err := http.request(
		_api_base + "/api/auth/signup",
		["Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		JSON.stringify({"email": email, "password": password})
	)
	if err != OK:
		set_status("Network error: " + str(err))
		_set_auth_buttons_disabled(false)
		_http_state = HttpState.NONE

func _set_auth_buttons_disabled(disabled: bool) -> void:
	btn_login.disabled = disabled
	btn_signup.disabled = disabled

func _on_auth_response(response_code: int, body: PackedByteArray) -> void:
	_set_auth_buttons_disabled(false)
	match response_code:
		404:
			set_status("No account found. Use Create Account.")
			return
		401:
			set_status("Incorrect email or password.")
			return
		200:
			pass
		_:
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
	var result: Dictionary = {}
	for realm: String in scores:
		result[realm] = {"_loaded_from_db": true, "_power": scores[realm]}
	return result

# ── Realm accumulator ─────────────────────────────────────────────────────────

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
			lbl.text = realm.capitalize() + "  —  " + str(entry.get("_power", 0)) + " pts"
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
	match realm:
		"academia":
			var f := credential_container.get_node("AcademiaForm")
			f.get_node("YearsActive").value = entry.get("years", 0)
			f.get_node("HIndex").value = entry.get("h_index", 0)
			f.get_node("Citations").value = entry.get("citations", 0)
			f.get_node("Publications").value = entry.get("publications", 0)
			f.get_node("I10Index").value = entry.get("i10", 0)
		"tech":
			var f := credential_container.get_node("TechForm")
			f.get_node("YearsActive").value = entry.get("years", 0)
			f.get_node("Followers").value = entry.get("followers", 0)
			f.get_node("Stars").value = entry.get("stars", 0)
			f.get_node("Repos").value = entry.get("repos", 0)
			f.get_node("Commits").value = entry.get("commits", 0)
		"medicine":
			var f := credential_container.get_node("MedicineForm")
			f.get_node("YearsPracticing").value = entry.get("years", 0)
			f.get_node("Papers").value = entry.get("papers", 0)
			f.get_node("Citations").value = entry.get("citations", 0)
			f.get_node("Patients").value = entry.get("patients", 0)
		"creative":
			var f := credential_container.get_node("CreativeForm")
			f.get_node("YearsActive").value = entry.get("years", 0)
			f.get_node("Works").value = entry.get("works", 0)
			f.get_node("Awards").value = entry.get("awards", 0)
			f.get_node("Audience").value = entry.get("audience", 0)
		"law":
			var f := credential_container.get_node("LawForm")
			f.get_node("YearsPracticing").value = entry.get("years", 0)
			f.get_node("Cases").value = entry.get("cases", 0)
			f.get_node("Wins").value = entry.get("wins", 0)
			f.get_node("Admissions").value = entry.get("admissions", 0)

func _on_submit_realm() -> void:
	var fields := _read_form_fields(_editing_realm)
	_pending_entries[_editing_realm] = fields
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
	# Only send realms the user actually filled in this session (not DB-only sentinels).
	var entries: Array = []
	for realm: String in _pending_entries:
		var entry: Dictionary = _pending_entries[realm]
		if entry.get("_loaded_from_db", false):
			continue
		var payload := entry.duplicate()
		payload["realm"] = realm
		entries.append(payload)
	# If no new entries, all realms are DB-loaded — scores are current; skip re-score.
	if entries.is_empty():
		if PlayerData.character_name.is_empty():
			_show_name_entry()
		else:
			_call_save_character()
		btn_proceed.disabled = false
		return
	set_status("Calculating power...", false)
	_http_state = HttpState.SCORE
	var err := http.request(
		_api_base + "/api/score",
		["Content-Type: application/json", "Authorization: Bearer " + PlayerData.jwt],
		HTTPClient.METHOD_POST,
		JSON.stringify({"entries": entries})
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
		_show_name_entry()
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
	_http_state = HttpState.SAVE
	var err := http.request(
		_api_base + "/api/character/save",
		["Content-Type: application/json", "Authorization: Bearer " + PlayerData.jwt],
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
	PlayerData.gold = (raw as Dictionary).get("gold", 500)
	PlayerData.is_authenticated = true
	GameManager.go_to_world()

# ── HTTP routing ──────────────────────────────────────────────────────────────

func _on_http_response(
	result: int, response_code: int,
	_headers: PackedStringArray, body: PackedByteArray
) -> void:
	if result != HTTPRequest.RESULT_SUCCESS:
		set_status("Connection failed (result " + str(result) + ")")
		_set_auth_buttons_disabled(false)
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
