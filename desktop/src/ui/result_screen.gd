class_name ResultScreen
extends CanvasLayer

signal continue_pressed

@onready var outcome_label: Label = $Panel/VBox/OutcomeLabel
@onready var gold_delta_label: Label = $Panel/VBox/GoldDeltaLabel
@onready var new_gold_label: Label = $Panel/VBox/NewGoldLabel
@onready var insurance_label: Label = $Panel/VBox/InsuranceLabel
@onready var continue_btn: Button = $Panel/VBox/ContinueBtn


func show_result(won: bool, gold_delta: int, new_gold: int, refund: int = 0) -> void:
	outcome_label.text = "Victory!" if won else "Defeat"
	outcome_label.modulate = Color("#ffdd44") if won else Color("#ff4444")

	var sign: String = "+" if gold_delta >= 0 else ""
	gold_delta_label.text = sign + str(gold_delta) + " gold"
	gold_delta_label.modulate = Color("#44ff88") if gold_delta >= 0 else Color("#ff6644")

	new_gold_label.text = "Gold: " + str(new_gold)

	if refund > 0:
		insurance_label.text = "Insurance refund: +%d gold" % refund
		insurance_label.visible = true
	else:
		insurance_label.visible = false

	continue_btn.pressed.connect(_on_continue_btn_pressed)


func _on_continue_btn_pressed() -> void:
	continue_pressed.emit()
