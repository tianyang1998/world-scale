extends Control

enum Panel { REALM, CREDENTIALS, NAME_ENTRY }

const API_BASE := "https://YOUR_API_BASE_URL"

const PROFANITY_BLOCKLIST: Array[String] = [
    "fuck", "shit", "ass", "bitch", "cunt", "dick", "pussy",
    "bastard", "damn", "crap", "piss", "slut", "whore", "nigger",
    "faggot", "retard", "idiot", "moron", "anus", "cock"
]

var current_panel: Panel = Panel.REALM
var selected_realm: String = ""

@onready var realm_grid: GridContainer = $MainContainer/RealmGrid
@onready var status_label: Label = $MainContainer/StatusLabel
@onready var credential_container: VBoxContainer = $MainContainer/CredentialContainer
@onready var form_title: Label = $MainContainer/CredentialContainer/FormTitle
@onready var btn_submit: Button = $MainContainer/CredentialContainer/BtnSubmit
@onready var btn_back: Button = $MainContainer/CredentialContainer/BtnBack
@onready var http: HTTPRequest = $Http
@onready var name_container: VBoxContainer = $MainContainer/NameContainer
@onready var name_input: LineEdit = $MainContainer/NameContainer/NameInput
@onready var name_error: Label = $MainContainer/NameContainer/NameError
@onready var btn_save_char: Button = $MainContainer/NameContainer/BtnSaveChar

static var _name_regex: RegEx = null
static var _profanity_regex: RegEx = null

func _ready() -> void:
	realm_grid.get_node("BtnAcademia").pressed.connect(_on_realm_selected.bind("academia"))
	realm_grid.get_node("BtnTech").pressed.connect(_on_realm_selected.bind("tech"))
	realm_grid.get_node("BtnMedicine").pressed.connect(_on_realm_selected.bind("medicine"))
	realm_grid.get_node("BtnCreative").pressed.connect(_on_realm_selected.bind("creative"))
	realm_grid.get_node("BtnLaw").pressed.connect(_on_realm_selected.bind("law"))
	btn_submit.pressed.connect(_on_submit_pressed)
	btn_back.pressed.connect(_on_back_pressed)
	http.request_completed.connect(_on_score_response)
	name_input.text_changed.connect(_on_name_changed)
	btn_save_char.pressed.connect(_on_save_character)
	$MainContainer/NameContainer/BtnBackToCredentials.pressed.connect(
		func() -> void: _show_panel(Panel.CREDENTIALS)
	)

func _on_realm_selected(realm: String) -> void:
	selected_realm = realm
	PlayerData.realm = realm
	_show_credential_form(realm)
	_show_panel(Panel.CREDENTIALS)

func _show_credential_form(realm: String) -> void:
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

func _show_panel(panel: Panel) -> void:
	current_panel = panel
	realm_grid.visible = (panel == Panel.REALM)
	credential_container.visible = (panel == Panel.CREDENTIALS)
	name_container.visible = (panel == Panel.NAME_ENTRY)
	status_label.text = ""

func _on_back_pressed() -> void:
	_show_panel(Panel.REALM)

func _on_submit_pressed() -> void:
	btn_submit.disabled = true
	set_status("Calculating...", false)
	var payload := _build_payload()
	var body := JSON.stringify(payload)
	var headers: PackedStringArray = ["Content-Type: application/json"]
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
	var payload: Dictionary = {"realm": selected_realm}
	match selected_realm:
		"academia":
			var f := credential_container.get_node("AcademiaForm")
			payload["years"] = f.get_node("YearsActive").value
			payload["h_index"] = f.get_node("HIndex").value
			payload["citations"] = f.get_node("Citations").value
			payload["publications"] = f.get_node("Publications").value
			payload["i10"] = f.get_node("I10Index").value
		"tech":
			var f := credential_container.get_node("TechForm")
			payload["years"] = f.get_node("YearsActive").value
			payload["followers"] = f.get_node("Followers").value
			payload["stars"] = f.get_node("Stars").value
			payload["repos"] = f.get_node("Repos").value
			payload["commits"] = f.get_node("Commits").value
		"medicine":
			var f := credential_container.get_node("MedicineForm")
			payload["years"] = f.get_node("YearsPracticing").value
			payload["papers"] = f.get_node("Papers").value
			payload["citations"] = f.get_node("Citations").value
			payload["patients"] = f.get_node("Patients").value
		"creative":
			var f := credential_container.get_node("CreativeForm")
			payload["years"] = f.get_node("YearsActive").value
			payload["works"] = f.get_node("Works").value
			payload["awards"] = f.get_node("Awards").value
			payload["audience"] = f.get_node("Audience").value
		"law":
			var f := credential_container.get_node("LawForm")
			payload["years"] = f.get_node("YearsPracticing").value
			payload["cases"] = f.get_node("Cases").value
			payload["wins"] = f.get_node("Wins").value
			payload["admissions"] = f.get_node("Admissions").value
		_:
			push_error("TitleScreen: _build_payload called with unknown realm '%s'" % selected_realm)
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
	var raw: Variant = json.get_data()
	if not raw is Dictionary:
		set_status("Unexpected response format from server")
		return
	var data: Dictionary = raw
	PlayerData.total_power = data.get("total_power", 0)
	PlayerData.tier = data.get("tier", "Apprentice")
	PlayerData.expertise = data.get("expertise", 0.0)
	PlayerData.prestige = data.get("prestige", 0.0)
	PlayerData.impact = data.get("impact", 0.0)
	PlayerData.credentials = data.get("credentials", 0.0)
	PlayerData.network = data.get("network", 0.0)
	PlayerData.realm_skill = data.get("realm_skill", "")
	http.request_completed.disconnect(_on_score_response)
	http.request_completed.connect(_on_save_response)
	set_status("Power: " + str(PlayerData.total_power) + " — Tier: " + PlayerData.tier, false)
	_show_panel(Panel.NAME_ENTRY)

# ── Name validation ───────────────────────────────────────────────────────────

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
	if not is_valid_name(new_text):
		name_error.text = "2-30 chars: letters, numbers, spaces, - ' ."
	else:
		name_error.text = ""

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
		"realm": PlayerData.realm,
		"total_power": PlayerData.total_power,
		"tier": PlayerData.tier,
	}
	var headers: PackedStringArray = [
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
		btn_save_char.disabled = false

func _on_save_response(
	result: int, response_code: int,
	_headers: PackedStringArray, body: PackedByteArray
) -> void:
	btn_save_char.disabled = false
	if result != HTTPRequest.RESULT_SUCCESS or response_code != 200:
		var msg := body.get_string_from_utf8()
		if "already taken" in msg or "duplicate" in msg.to_lower():
			set_status("Name already taken — try another.")
		else:
			set_status("Save failed (HTTP " + str(response_code) + ")")
		return
	var json := JSON.new()
	if json.parse(body.get_string_from_utf8()) != OK:
		set_status("Invalid response from server")
		btn_save_char.disabled = false
		return
	var raw: Variant = json.get_data()
	if not raw is Dictionary:
		set_status("Unexpected response format from server")
		btn_save_char.disabled = false
		return
	var data: Dictionary = raw
	PlayerData.gold = data.get("gold", 500)
	PlayerData.is_authenticated = true
	GameManager.go_to_world()

func set_status(msg: String, is_error: bool = true) -> void:
	status_label.text = msg
	status_label.modulate = Color.RED if is_error else Color.GREEN
