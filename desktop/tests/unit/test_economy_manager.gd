extends GdUnitTestSuite

## Unit tests for EconomyManager.
## Each test resets PlayerData to a clean baseline before running.

func _reset_player(gold: int = 500) -> void:
	PlayerData.gold = gold
	PlayerData.active_insurance = "none"
	PlayerData.owned_cosmetics = []
	PlayerData.equipped_title = ""
	PlayerData.equipped_border = ""
	PlayerData.pending_broadcast = "basic"


# ─── Insurance buy ────────────────────────────────────────────────────────────

func test_insurance_premium_deducted_on_buy() -> void:
	_reset_player(500)
	var err: String = EconomyManager.buy_insurance("bronze")
	assert_str(err).is_equal("")
	assert_int(PlayerData.gold).is_equal(470)  # 500 - 30
	assert_str(PlayerData.active_insurance).is_equal("bronze")


func test_insurance_cannot_buy_if_insufficient_gold() -> void:
	_reset_player(20)
	var err: String = EconomyManager.buy_insurance("bronze")
	assert_str(err).is_not_equal("")
	assert_int(PlayerData.gold).is_equal(20)
	assert_str(PlayerData.active_insurance).is_equal("none")


func test_insurance_cannot_stack() -> void:
	_reset_player(500)
	EconomyManager.buy_insurance("bronze")
	var err: String = EconomyManager.buy_insurance("silver")
	assert_str(err).is_not_equal("")
	assert_str(PlayerData.active_insurance).is_equal("bronze")


func test_insurance_none_is_free_and_valid() -> void:
	_reset_player(0)
	var err: String = EconomyManager.buy_insurance("none")
	assert_str(err).is_equal("")
	assert_int(PlayerData.gold).is_equal(0)


# ─── Insurance refund calc ────────────────────────────────────────────────────

func test_calc_refund_bronze_25_percent() -> void:
	var refund: int = EconomyManager.calc_refund(100, "bronze")
	assert_int(refund).is_equal(25)


func test_calc_refund_silver_50_percent() -> void:
	var refund: int = EconomyManager.calc_refund(100, "silver")
	assert_int(refund).is_equal(50)


func test_calc_refund_gold_75_percent() -> void:
	var refund: int = EconomyManager.calc_refund(100, "gold")
	assert_int(refund).is_equal(75)


func test_calc_refund_none_zero() -> void:
	var refund: int = EconomyManager.calc_refund(100, "none")
	assert_int(refund).is_equal(0)


func test_calc_refund_floors_fractional() -> void:
	# 33 × 0.25 = 8.25 → floor → 8
	var refund: int = EconomyManager.calc_refund(33, "bronze")
	assert_int(refund).is_equal(8)


# ─── Broadcast buy ────────────────────────────────────────────────────────────

func test_broadcast_free_basic() -> void:
	_reset_player(0)
	var err: String = EconomyManager.buy_broadcast("basic")
	assert_str(err).is_equal("")
	assert_int(PlayerData.gold).is_equal(0)


func test_broadcast_cost_deducted() -> void:
	_reset_player(500)
	var err: String = EconomyManager.buy_broadcast("extended")
	assert_str(err).is_equal("")
	assert_int(PlayerData.gold).is_equal(400)  # 500 - 100
	assert_str(PlayerData.pending_broadcast).is_equal("extended")


func test_broadcast_insufficient_gold() -> void:
	_reset_player(50)
	var err: String = EconomyManager.buy_broadcast("global")
	assert_str(err).is_not_equal("")
	assert_int(PlayerData.gold).is_equal(50)


# ─── Cosmetics buy ────────────────────────────────────────────────────────────

func test_buy_cosmetic_deducts_gold() -> void:
	_reset_player(500)
	EconomyManager.buy_cosmetic("title_boss_slayer", false)
	assert_int(PlayerData.gold).is_equal(350)  # 500 - 150


func test_buy_cosmetic_adds_to_owned() -> void:
	_reset_player(500)
	EconomyManager.buy_cosmetic("title_boss_slayer", false)
	assert_bool(PlayerData.owned_cosmetics.has("title_boss_slayer")).is_true()


func test_buy_cosmetic_auto_equips() -> void:
	_reset_player(500)
	EconomyManager.buy_cosmetic("title_boss_slayer", true)
	assert_str(PlayerData.equipped_title).is_equal("title_boss_slayer")


func test_buy_cosmetic_already_owned_no_charge() -> void:
	_reset_player(500)
	EconomyManager.buy_cosmetic("title_boss_slayer", false)
	var gold_after_first: int = PlayerData.gold
	EconomyManager.buy_cosmetic("title_boss_slayer", false)
	assert_int(PlayerData.gold).is_equal(gold_after_first)


func test_buy_cosmetic_insufficient_gold_returns_error() -> void:
	_reset_player(10)
	var err: String = EconomyManager.buy_cosmetic("title_boss_slayer", false)
	assert_str(err).is_not_equal("")
	assert_bool(PlayerData.owned_cosmetics.has("title_boss_slayer")).is_false()


# ─── Cosmetics equip ─────────────────────────────────────────────────────────

func test_equip_cosmetic_not_owned_returns_error() -> void:
	_reset_player(500)
	var err: String = EconomyManager.equip_cosmetic("title_boss_slayer")
	assert_str(err).is_not_equal("")
	assert_str(PlayerData.equipped_title).is_equal("")


func test_equip_title_sets_equipped_title() -> void:
	_reset_player(500)
	EconomyManager.buy_cosmetic("title_boss_slayer", false)
	var err: String = EconomyManager.equip_cosmetic("title_boss_slayer")
	assert_str(err).is_equal("")
	assert_str(PlayerData.equipped_title).is_equal("title_boss_slayer")


func test_equip_border_sets_equipped_border() -> void:
	_reset_player(500)
	EconomyManager.buy_cosmetic("border_academia", false)
	var err: String = EconomyManager.equip_cosmetic("border_academia")
	assert_str(err).is_equal("")
	assert_str(PlayerData.equipped_border).is_equal("border_academia")
