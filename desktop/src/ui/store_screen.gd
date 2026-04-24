class_name StoreScreen
extends CanvasLayer

signal close_requested

@onready var gold_label: Label = $Panel/VBox/TitleRow/GoldLabel
@onready var tab_bar: TabBar = $Panel/VBox/TabBar
@onready var item_list: VBoxContainer = $Panel/VBox/ScrollContainer/ItemList
@onready var error_label: Label = $Panel/VBox/ErrorLabel
@onready var close_btn: Button = $Panel/VBox/CloseBtn

# tab index → catalog key ("title" or "border")
const TAB_CATALOGS: Array[String] = ["title", "border"]

var _current_tab: int = 0


func _ready() -> void:
	tab_bar.add_tab("Titles")
	tab_bar.add_tab("Borders")
	tab_bar.tab_changed.connect(_on_tab_changed)
	close_btn.pressed.connect(_on_close_btn_pressed)
	_refresh()


func _refresh() -> void:
	gold_label.text = "Gold: %d" % PlayerData.gold
	error_label.text = ""
	_populate_items()


func _populate_items() -> void:
	for child in item_list.get_children():
		child.queue_free()

	var category: String = TAB_CATALOGS[_current_tab]
	var catalog: Dictionary = EconomyManager.TITLES if category == "title" else EconomyManager.BORDERS

	for id: String in catalog:
		var data: Dictionary = catalog[id]
		var row: HBoxContainer = HBoxContainer.new()
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL

		var name_lbl: Label = Label.new()
		name_lbl.text = data["name"]
		name_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(name_lbl)

		var cost_lbl: Label = Label.new()
		cost_lbl.text = "%dg" % data["cost"]
		cost_lbl.custom_minimum_size = Vector2(60, 0)
		cost_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		row.add_child(cost_lbl)

		var status_lbl: Label = Label.new()
		status_lbl.custom_minimum_size = Vector2(70, 0)
		status_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		row.add_child(status_lbl)

		var owned: bool = PlayerData.owned_cosmetics.has(id)
		var equipped: bool = (PlayerData.equipped_title == id or PlayerData.equipped_border == id)

		if equipped:
			status_lbl.text = "Equipped"
			status_lbl.modulate = Color("#66ff88")
		elif owned:
			status_lbl.text = "Owned"
			status_lbl.modulate = Color.WHITE

		var btn: Button = Button.new()
		btn.custom_minimum_size = Vector2(80, 0)

		if owned:
			if equipped:
				btn.text = "Unequip"
				btn.pressed.connect(_on_unequip.bind(category))
			else:
				btn.text = "Equip"
				btn.pressed.connect(_on_equip.bind(id))
		else:
			btn.text = "Buy"
			btn.disabled = PlayerData.gold < int(data["cost"])
			btn.pressed.connect(_on_buy.bind(id))

		row.add_child(btn)
		item_list.add_child(row)


func _on_tab_changed(tab: int) -> void:
	_current_tab = tab
	_populate_items()


func _on_buy(cosmetic_id: String) -> void:
	var err: String = EconomyManager.buy_cosmetic(cosmetic_id, true)
	if err != "":
		error_label.text = err
	else:
		_refresh()


func _on_equip(cosmetic_id: String) -> void:
	var err: String = EconomyManager.equip_cosmetic(cosmetic_id)
	if err != "":
		error_label.text = err
	else:
		_refresh()


func _on_unequip(category: String) -> void:
	var slot: String = "title" if category == "title" else "border"
	EconomyManager.unequip_slot(slot)
	_refresh()


func _on_close_btn_pressed() -> void:
	close_requested.emit()
