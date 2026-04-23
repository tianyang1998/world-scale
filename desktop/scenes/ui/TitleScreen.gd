extends Control

enum Panel { REALM, CREDENTIALS, NAME_ENTRY }

var current_panel: Panel = Panel.REALM
var selected_realm: String = ""

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
	status_label.text = ""

func set_status(msg: String, is_error: bool = true) -> void:
	status_label.text = msg
	status_label.modulate = Color.RED if is_error else Color.GREEN
