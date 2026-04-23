extends Control

enum Panel { REALM, CREDENTIALS, NAME_ENTRY }

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
	realm_grid.get_node("BtnAcademia").pressed.connect(_on_realm_selected.bind("academia"))
	realm_grid.get_node("BtnTech").pressed.connect(_on_realm_selected.bind("tech"))
	realm_grid.get_node("BtnMedicine").pressed.connect(_on_realm_selected.bind("medicine"))
	realm_grid.get_node("BtnCreative").pressed.connect(_on_realm_selected.bind("creative"))
	realm_grid.get_node("BtnLaw").pressed.connect(_on_realm_selected.bind("law"))
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
	for form_name: String in ["AcademiaForm", "TechForm", "MedicineForm", "CreativeForm", "LawForm"]:
		credential_container.get_node(form_name).visible = false
	var form_map: Dictionary = {
		"academia": "AcademiaForm", "tech": "TechForm",
		"medicine": "MedicineForm", "creative": "CreativeForm", "law": "LawForm"
	}
	credential_container.get_node(form_map[realm]).visible = true

func _show_panel(panel: Panel) -> void:
	current_panel = panel
	realm_grid.visible = (panel == Panel.REALM)
	credential_container.visible = (panel == Panel.CREDENTIALS)
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
