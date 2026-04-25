class_name TitleScreen
extends Control

# Talks directly to Supabase — no Next.js server needed.
#
# Auth:      POST {supabase_url}/auth/v1/token?grant_type=password   (login)
#            POST {supabase_url}/auth/v1/signup                       (signup)
# Character: GET/POST {supabase_url}/rest/v1/characters               (REST API)
# Scoring:   done locally in GDScript using Scorer static methods

const PROFANITY_BLOCKLIST: Array[String] = [
	"fuck", "shit", "ass", "bitch", "cunt", "dick", "pussy",
	"bastard", "damn", "crap", "piss", "slut", "whore", "nigger",
	"faggot", "retard", "idiot", "moron", "anus", "cock"
]

var _pending_entries: Dictionary = {}  # realm → field dict
var _editing_realm: String = ""

enum HttpState { NONE, LOGIN, SIGNUP, LOAD_CHARACTER, SAVE_CHARACTER }
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

# ── Panel visibility ──────────────────────────────────────────────────────────

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

# ── Auth — direct Supabase REST ───────────────────────────────────────────────

func _supabase_headers() -> PackedStringArray:
	return PackedStringArray([
		"Content-Type: application/json",
		"apikey: " + SupabaseConfig.anon_key,
	])

func _supabase_headers_authed() -> PackedStringArray:
	return PackedStringArray([
		"Content-Type: application/json",
		"apikey: " + SupabaseConfig.anon_key,
		"Authorization: Bearer " + PlayerData.jwt,
	])

func _on_login_pressed() -> void:
	var email := email_input.text.strip_edges()
	var password := password_input.text
	if email.is_empty() or password.is_empty():
		set_status("Please enter your email and password.")
		return
	_set_auth_buttons_disabled(true)
	set_status("Logging in...", false)
	_http_state = HttpState.LOGIN
	var url: String = SupabaseConfig.supabase_url + "/auth/v1/token?grant_type=password"
	var err := http.request(
		url, _supabase_headers(), HTTPClient.METHOD_POST,
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
	_http_state = HttpState.SIGNUP
	var url: String = SupabaseConfig.supabase_url + "/auth/v1/signup"
	var err := http.request(
		url, _supabase_headers(), HTTPClient.METHOD_POST,
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
	var json := JSON.new()
	if json.parse(body.get_string_from_utf8()) != OK:
		set_status("Invalid response from server")
		return
	var data: Variant = json.get_data()
	if not data is Dictionary:
		set_status("Unexpected response format")
		return
	var d: Dictionary = data

	# Supabase returns error_code on failure
	if d.has("error_code") or d.has("error"):
		var msg: String = d.get("message", d.get("error", "Auth failed"))
		set_status(msg)
		return

	PlayerData.jwt     = d.get("access_token", "")
	PlayerData.user_id = d.get("user", {}).get("id", "")

	if PlayerData.jwt.is_empty() or PlayerData.user_id.is_empty():
		set_status("Auth failed — no token received")
		return

	PlayerData.is_authenticated = true
	_load_character()

# ── Character load — GET /rest/v1/characters ──────────────────────────────────

func _load_character() -> void:
	set_status("Loading character...", false)
	_http_state = HttpState.LOAD_CHARACTER
	var url: String = SupabaseConfig.supabase_url + \
		"/rest/v1/characters?user_id=eq." + PlayerData.user_id + "&select=*"
	var err := http.request(url, _supabase_headers_authed(), HTTPClient.METHOD_GET)
	if err != OK:
		set_status("Failed to load character")
		_http_state = HttpState.NONE

func _on_load_character_response(response_code: int, body: PackedByteArray) -> void:
	var json := JSON.new()
	if json.parse(body.get_string_from_utf8()) != OK or response_code != 200:
		set_status("Failed to load character (HTTP %d)" % response_code)
		return
	var rows: Variant = json.get_data()
	if rows is Array and (rows as Array).size() > 0:
		var character: Dictionary = (rows as Array)[0]
		PlayerData.load_from_dict(character)
		# Rebuild pending entries from existing realm_scores so user sees their history
		_pending_entries = _realm_scores_to_pending(PlayerData.realm_scores)
	_show_accumulator()

func _realm_scores_to_pending(scores: Dictionary) -> Dictionary:
	var result: Dictionary = {}
	for realm: String in scores:
		var entry: Variant = scores[realm]
		if entry is Dictionary:
			result[realm] = {"_loaded_from_db": true, "_power": int(entry.get("power", 0))}
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
			lbl.text = realm.capitalize() + "  —  (pending)"
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
		known_power += int(entry.get("_power", 0))
	if known_power > 0:
		total_power_label.text = "Known total: %d pts" % known_power
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
			f.get_node("YearsActive").value   = entry.get("years", 0)
			f.get_node("HIndex").value         = entry.get("h_index", 0)
			f.get_node("Citations").value      = entry.get("citations", 0)
			f.get_node("Publications").value   = entry.get("publications", 0)
			f.get_node("I10Index").value       = entry.get("i10", 0)
		"tech":
			var f := credential_container.get_node("TechForm")
			f.get_node("YearsActive").value = entry.get("years", 0)
			f.get_node("Followers").value   = entry.get("followers", 0)
			f.get_node("Stars").value       = entry.get("stars", 0)
			f.get_node("Repos").value       = entry.get("repos", 0)
			f.get_node("Commits").value     = entry.get("commits", 0)
		"medicine":
			var f := credential_container.get_node("MedicineForm")
			f.get_node("YearsPracticing").value = entry.get("years", 0)
			f.get_node("Papers").value          = entry.get("papers", 0)
			f.get_node("Citations").value       = entry.get("citations", 0)
			f.get_node("Patients").value        = entry.get("patients", 0)
		"creative":
			var f := credential_container.get_node("CreativeForm")
			f.get_node("YearsActive").value = entry.get("years", 0)
			f.get_node("Works").value       = entry.get("works", 0)
			f.get_node("Awards").value      = entry.get("awards", 0)
			f.get_node("Audience").value    = entry.get("audience", 0)
		"law":
			var f := credential_container.get_node("LawForm")
			f.get_node("YearsPracticing").value = entry.get("years", 0)
			f.get_node("Cases").value           = entry.get("cases", 0)
			f.get_node("Wins").value            = entry.get("wins", 0)
			f.get_node("Admissions").value      = entry.get("admissions", 0)

func _on_submit_realm() -> void:
	var fields := _read_form_fields(_editing_realm)
	_pending_entries[_editing_realm] = fields
	_show_accumulator()

func _read_form_fields(realm: String) -> Dictionary:
	var fields: Dictionary = {}
	match realm:
		"academia":
			var f := credential_container.get_node("AcademiaForm")
			fields["years"]        = f.get_node("YearsActive").value
			fields["h_index"]      = f.get_node("HIndex").value
			fields["citations"]    = f.get_node("Citations").value
			fields["publications"] = f.get_node("Publications").value
			fields["i10"]          = f.get_node("I10Index").value
		"tech":
			var f := credential_container.get_node("TechForm")
			fields["years"]     = f.get_node("YearsActive").value
			fields["followers"] = f.get_node("Followers").value
			fields["stars"]     = f.get_node("Stars").value
			fields["repos"]     = f.get_node("Repos").value
			fields["commits"]   = f.get_node("Commits").value
		"medicine":
			var f := credential_container.get_node("MedicineForm")
			fields["years"]    = f.get_node("YearsPracticing").value
			fields["papers"]   = f.get_node("Papers").value
			fields["citations"]= f.get_node("Citations").value
			fields["patients"] = f.get_node("Patients").value
		"creative":
			var f := credential_container.get_node("CreativeForm")
			fields["years"]    = f.get_node("YearsActive").value
			fields["works"]    = f.get_node("Works").value
			fields["awards"]   = f.get_node("Awards").value
			fields["audience"] = f.get_node("Audience").value
		"law":
			var f := credential_container.get_node("LawForm")
			fields["years"]      = f.get_node("YearsPracticing").value
			fields["cases"]      = f.get_node("Cases").value
			fields["wins"]       = f.get_node("Wins").value
			fields["admissions"] = f.get_node("Admissions").value
		_:
			push_error("TitleScreen: _read_form_fields unknown realm '%s'" % realm)
	return fields

# ── Proceed — score locally + save ───────────────────────────────────────────

func _on_proceed_pressed() -> void:
	btn_proceed.disabled = true
	set_status("Calculating power...", false)

	# Score each newly-entered realm locally
	var realm_scores: Dictionary = {}
	var total_power: int = 0
	var dominant_realm: String = ""
	var dominant_power: int = 0

	for realm: String in _pending_entries:
		var entry: Dictionary = _pending_entries[realm]
		var result: Dictionary

		if entry.get("_loaded_from_db", false):
			# Keep existing DB score as-is
			var existing: Variant = PlayerData.realm_scores.get(realm, {})
			if existing is Dictionary:
				result = {
					"power": int(existing.get("power", 0)),
					"expertise":   float(existing.get("expertise", 0)),
					"prestige":    float(existing.get("prestige", 0)),
					"impact":      float(existing.get("impact", 0)),
					"credentials": float(existing.get("credentials", 0)),
					"network":     float(existing.get("network", 0)),
				}
			else:
				result = {"power": entry.get("_power", 0), "expertise": 0.0, "prestige": 0.0,
					"impact": 0.0, "credentials": 0.0, "network": 0.0}
		else:
			result = _score_realm(realm, entry)

		realm_scores[realm] = result
		total_power += int(result["power"])
		if int(result["power"]) > dominant_power:
			dominant_power = int(result["power"])
			dominant_realm = realm

	PlayerData.total_power   = total_power
	PlayerData.dominant_realm = dominant_realm
	PlayerData.realm_scores  = realm_scores
	PlayerData.tier          = Scorer.get_tier(total_power)

	set_status("Power: %d — Tier: %s" % [total_power, PlayerData.tier], false)

	if PlayerData.character_name.is_empty():
		_show_name_entry()
	else:
		_call_save_character()

	btn_proceed.disabled = false


func _score_realm(realm: String, fields: Dictionary) -> Dictionary:
	match realm:
		"academia":
			return Scorer.score_academia(
				float(fields.get("h_index", 0)),
				float(fields.get("citations", 0)),
				float(fields.get("years", 0)),
				float(fields.get("publications", 0)),
				float(fields.get("i10", 0))
			)
		"tech":
			return Scorer.score_tech(
				float(fields.get("repos", 0)),
				float(fields.get("stars", 0)),
				float(fields.get("followers", 0)),
				float(fields.get("commits", 0)),
				float(fields.get("years", 0))
			)
		"medicine":
			return Scorer.score_medicine(
				float(fields.get("years", 0)),
				float(fields.get("papers", 0)),
				float(fields.get("citations", 0)),
				float(fields.get("patients", 0))
			)
		"creative":
			return Scorer.score_creative(
				float(fields.get("years", 0)),
				float(fields.get("works", 0)),
				float(fields.get("awards", 0)),
				float(fields.get("audience", 0)),
				0.0
			)
		"law":
			return Scorer.score_law(
				float(fields.get("years", 0)),
				float(fields.get("cases", 0)),
				float(fields.get("wins", 0)),
				float(fields.get("admissions", 0))
			)
	return {"power": 0, "expertise": 0.0, "prestige": 0.0, "impact": 0.0, "credentials": 0.0, "network": 0.0}

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

# ── Character save — UPSERT /rest/v1/characters ───────────────────────────────

func _call_save_character() -> void:
	btn_save_char.disabled = true
	set_status("Saving...", false)

	# Only give signup bonus for truly new accounts (no existing character loaded)
	# Only give realm bonus for realms entered this session (not DB-loaded ones)
	var is_new_account: bool = PlayerData.character_name.is_empty() or PlayerData.gold == 0
	var realm_bonus: int = 0
	for realm: String in _pending_entries:
		var entry: Dictionary = _pending_entries[realm]
		if not entry.get("_loaded_from_db", false):
			realm_bonus += Scorer.calc_realm_gold_bonus(int(PlayerData.realm_scores.get(realm, {}).get("power", 0)))
	var new_gold: int = PlayerData.gold
	if is_new_account:
		new_gold = 500
	new_gold += realm_bonus

	var payload: Dictionary = {
		"user_id":     PlayerData.user_id,
		"name":        PlayerData.character_name,
		"realms":      PlayerData.realm_scores,
		"total_power": PlayerData.total_power,
		"gold":        new_gold,
		"updated_at":  Time.get_datetime_string_from_system(false, true),
	}

	_http_state = HttpState.SAVE_CHARACTER
	var headers: PackedStringArray = _supabase_headers_authed()
	headers.append("Prefer: resolution=merge-duplicates,return=representation")
	var url: String = SupabaseConfig.supabase_url + "/rest/v1/characters"
	var err := http.request(url, headers, HTTPClient.METHOD_POST, JSON.stringify(payload))
	if err != OK:
		set_status("Network error saving character")
		btn_save_char.disabled = false
		_http_state = HttpState.NONE

func _on_save_character_response(response_code: int, body: PackedByteArray) -> void:
	btn_save_char.disabled = false
	if response_code != 200 and response_code != 201:
		var msg: String = body.get_string_from_utf8()
		if "duplicate" in msg.to_lower() or "unique" in msg.to_lower():
			set_status("Name already taken — try another.")
		else:
			set_status("Save failed (HTTP %d)" % response_code)
		return

	var json := JSON.new()
	if json.parse(body.get_string_from_utf8()) != OK:
		set_status("Invalid response from server")
		return
	var raw: Variant = json.get_data()
	var saved: Dictionary = {}
	if raw is Array and (raw as Array).size() > 0:
		saved = (raw as Array)[0]
	elif raw is Dictionary:
		saved = raw

	PlayerData.gold = int(saved.get("gold", PlayerData.gold))
	PlayerData.is_authenticated = true
	GameManager.go_to_world()

# ── HTTP router ───────────────────────────────────────────────────────────────

func _on_http_response(
	result: int, response_code: int,
	_headers: PackedStringArray, body: PackedByteArray
) -> void:
	if result != HTTPRequest.RESULT_SUCCESS:
		set_status("Connection failed (result %d)" % result)
		_set_auth_buttons_disabled(false)
		btn_proceed.disabled = _pending_entries.is_empty()
		btn_save_char.disabled = false
		_http_state = HttpState.NONE
		return
	var state := _http_state
	_http_state = HttpState.NONE
	match state:
		HttpState.LOGIN, HttpState.SIGNUP:
			_on_auth_response(response_code, body)
		HttpState.LOAD_CHARACTER:
			_on_load_character_response(response_code, body)
		HttpState.SAVE_CHARACTER:
			_on_save_character_response(response_code, body)
		_:
			push_error("TitleScreen: HTTP response with no matching state")

# ── Status ────────────────────────────────────────────────────────────────────

func set_status(msg: String, is_error: bool = true) -> void:
	status_label.text = msg
	status_label.modulate = Color.RED if is_error else Color.GREEN
