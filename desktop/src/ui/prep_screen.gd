class_name PrepScreen
extends CanvasLayer

signal confirmed

# Set by WorldScene before adding as child: "pvp" or "pve"
var mode: String = "pvp"

@onready var power_label: Label = $Panel/VBox/PowerLabel
@onready var hp_slider: HSlider = $Panel/VBox/HPRow/HPSlider
@onready var hp_value: Label = $Panel/VBox/HPRow/HPValue
@onready var attack_slider: HSlider = $Panel/VBox/AttackRow/AttackSlider
@onready var attack_value: Label = $Panel/VBox/AttackRow/AttackValue
@onready var defence_slider: HSlider = $Panel/VBox/DefenceRow/DefenceSlider
@onready var defence_value: Label = $Panel/VBox/DefenceRow/DefenceValue
@onready var remaining_label: Label = $Panel/VBox/RemainingLabel
@onready var error_label: Label = $Panel/VBox/ErrorLabel
@onready var insurance_row: HBoxContainer = $Panel/VBox/InsuranceRow
@onready var insurance_option: OptionButton = $Panel/VBox/InsuranceRow/InsuranceOption
@onready var broadcast_row: HBoxContainer = $Panel/VBox/BroadcastRow
@onready var broadcast_option: OptionButton = $Panel/VBox/BroadcastRow/BroadcastOption
@onready var confirm_btn: Button = $Panel/VBox/ConfirmBtn

var _power: int = 0
var _minimum: int = 0


func _ready() -> void:
	_power = PlayerData.total_power
	_minimum = int(floor(_power * 0.10))

	power_label.text = "Power: %d  (min per stat: %d)" % [_power, _minimum]

	for slider: HSlider in [hp_slider, attack_slider, defence_slider]:
		slider.min_value = _minimum
		slider.max_value = _power - _minimum * 2
		slider.step = 1

	var base: int = _power / 3
	var leftover: int = _power - base * 3
	hp_slider.value = base + leftover
	attack_slider.value = base
	defence_slider.value = base

	hp_slider.value_changed.connect(_on_slider_changed.unbind(1))
	attack_slider.value_changed.connect(_on_slider_changed.unbind(1))
	defence_slider.value_changed.connect(_on_slider_changed.unbind(1))

	_setup_economy_rows()
	_refresh()


func _setup_economy_rows() -> void:
	if mode == "pvp":
		insurance_row.visible = true
		broadcast_row.visible = false
		_populate_insurance_options()
	else:
		insurance_row.visible = false
		broadcast_row.visible = true
		_populate_broadcast_options()


func _populate_insurance_options() -> void:
	insurance_option.clear()
	var order: Array[String] = ["none", "bronze", "silver", "gold"]
	for id: String in order:
		var data: Dictionary = EconomyManager.INSURANCE[id]
		var premium: int = int(data["premium"])
		var label: String = data["name"]
		if premium > 0:
			label += "  (-%dg)" % premium
		insurance_option.add_item(label)
		insurance_option.set_item_metadata(insurance_option.item_count - 1, id)
		if premium > PlayerData.gold:
			insurance_option.set_item_disabled(insurance_option.item_count - 1, true)


func _populate_broadcast_options() -> void:
	broadcast_option.clear()
	var order: Array[String] = ["basic", "extended", "global"]
	for id: String in order:
		var data: Dictionary = EconomyManager.BROADCAST[id]
		var cost: int = int(data["cost"])
		var label: String = data["name"]
		if cost > 0:
			label += "  (-%dg)" % cost
		broadcast_option.add_item(label)
		broadcast_option.set_item_metadata(broadcast_option.item_count - 1, id)
		if cost > PlayerData.gold:
			broadcast_option.set_item_disabled(broadcast_option.item_count - 1, true)


func _on_slider_changed() -> void:
	_refresh()


func _refresh() -> void:
	var hp: int = int(hp_slider.value)
	var atk: int = int(attack_slider.value)
	var def: int = int(defence_slider.value)
	var remaining: int = _power - hp - atk - def

	hp_value.text = str(hp)
	attack_value.text = str(atk)
	defence_value.text = str(def)
	remaining_label.text = "Remaining: %d" % remaining
	remaining_label.modulate = Color.RED if remaining != 0 else Color.WHITE

	var valid: bool = (remaining == 0 and hp >= _minimum
			and atk >= _minimum and def >= _minimum)
	confirm_btn.disabled = not valid
	error_label.text = "" if valid else (
		"Stats must sum to %d (each ≥ %d)" % [_power, _minimum]
	)


func _on_confirm_btn_pressed() -> void:
	PlayerData.battle_hp = int(hp_slider.value)
	PlayerData.battle_attack = int(attack_slider.value)
	PlayerData.battle_defence = int(defence_slider.value)

	if mode == "pvp" and insurance_option.selected >= 0:
		var ins_id: String = insurance_option.get_item_metadata(insurance_option.selected)
		var err: String = EconomyManager.buy_insurance(ins_id)
		if err != "":
			error_label.text = err
			return
	elif mode == "pve" and broadcast_option.selected >= 0:
		var bc_id: String = broadcast_option.get_item_metadata(broadcast_option.selected)
		PlayerData.pending_broadcast = bc_id

	confirmed.emit()
