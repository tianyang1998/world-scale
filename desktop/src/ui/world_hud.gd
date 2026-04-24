class_name WorldHUD
extends CanvasLayer

@onready var tier_label: Label = $Panel/TierLabel
@onready var gold_label: Label = $Panel/GoldLabel
@onready var online_label: Label = $Panel/OnlineLabel


func _ready() -> void:
	tier_label.text = "Tier: " + PlayerData.tier
	gold_label.text = "Gold: " + str(PlayerData.gold)
	online_label.text = "Online: 1"


func refresh_gold() -> void:
	gold_label.text = "Gold: " + str(PlayerData.gold)


func update_tier(tier: String) -> void:
	tier_label.text = "Tier: " + tier


func update_online_count(count: int) -> void:
	online_label.text = "Online: " + str(count)
