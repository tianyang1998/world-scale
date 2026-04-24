class_name WorldHUD
extends CanvasLayer

@onready var tier_label: Label = $Panel/TierLabel
@onready var gold_label: Label = $Panel/GoldLabel

func _ready() -> void:
	tier_label.text = "Tier: " + PlayerData.tier
	gold_label.text = "Gold: " + str(PlayerData.gold)

## Refreshes the gold display. Call after any gold-changing transaction.
func refresh_gold() -> void:
	gold_label.text = "Gold: " + str(PlayerData.gold)
