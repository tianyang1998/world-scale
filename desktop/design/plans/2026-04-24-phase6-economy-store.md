# Phase 6: Economy — Store, Insurance, Broadcast

> **Goal:** Full gold economy playable offline. Store sells titles and borders.
> PrepScreen has insurance (PvP) and broadcast (PvE) pickers. Insurance refund
> applied on PvP loss. Broadcast cost deducted on boss raid entry.

**Scope boundary:** All gold changes happen in-process (PlayerData). Server-side
atomicity (Supabase RPC) is deferred until credentials are live. All economy
logic is in EconomyManager (stateless static) — verifiable by unit tests.

---

## File Map

```
desktop/
├── src/
│   ├── core/
│   │   ├── player_data.gd        ← UPDATE: active_insurance, owned_cosmetics,
│   │   │                                    equipped_title, equipped_border
│   │   └── economy_manager.gd    ← NEW: all economy statics
│   ├── ui/
│   │   ├── prep_screen.gd        ← UPDATE: insurance + broadcast pickers
│   │   ├── store_screen.gd       ← NEW: cosmetics catalog
│   │   └── result_screen.gd      ← UPDATE: show insurance refund
│   └── world/
│       ├── pvp_arena.gd          ← UPDATE: pass insurance to _end_battle
│       ├── boss_arena.gd         ← UPDATE: deduct broadcast cost on _ready
│       └── world_scene.gd        ← UPDATE: store trigger opens StoreScreen
├── scenes/
│   └── ui/
│       ├── PrepScreen.tscn       ← UPDATE: add InsuranceRow + BroadcastRow
│       ├── StoreScreen.tscn      ← NEW
│       └── ResultScreen.tscn     ← UPDATE: add InsuranceLabel
└── tests/unit/
    └── test_economy_manager.gd   ← NEW
```

---

## Task 1 — PlayerData additions

```gdscript
var active_insurance: String = "none"   # "none" | "bronze" | "silver" | "gold"
var owned_cosmetics: Array[String] = []
var equipped_title: String = ""         # cosmetic ID or ""
var equipped_border: String = ""        # cosmetic ID or ""
```

Update `load_from_dict` and `clear` accordingly.

---

## Task 2 — EconomyManager

Stateless static class. All formulas from GDD §3–4.

### Insurance catalog
```gdscript
const INSURANCE: Dictionary = {
    "none":   { "name": "None",   "premium": 0,   "refund_pct": 0.0  },
    "bronze": { "name": "Bronze", "premium": 30,  "refund_pct": 0.25 },
    "silver": { "name": "Silver", "premium": 60,  "refund_pct": 0.50 },
    "gold":   { "name": "Gold",   "premium": 100, "refund_pct": 0.75 },
}
```

### Broadcast catalog
```gdscript
const BROADCAST: Dictionary = {
    "basic":    { "name": "Basic",    "cost": 0   },
    "extended": { "name": "Extended", "cost": 100 },
    "global":   { "name": "Global",   "cost": 300 },
}
```

### Cosmetics catalog
```gdscript
const TITLES: Dictionary = {
    "title_boss_slayer":    { "name": "Boss Slayer",    "cost": 150 },
    "title_the_unyielding": { "name": "The Unyielding", "cost": 200 },
    "title_realm_champion": { "name": "Realm Champion", "cost": 350 },
    "title_gold_hoarder":   { "name": "Gold Hoarder",   "cost": 500 },
}
const BORDERS: Dictionary = {
    "border_academia": { "name": "Scholar's Frame",  "cost": 300 },
    "border_tech":     { "name": "Circuit Frame",    "cost": 300 },
    "border_medicine": { "name": "Healer's Frame",   "cost": 300 },
    "border_creative": { "name": "Artist's Frame",   "cost": 300 },
    "border_law":      { "name": "Justice Frame",    "cost": 300 },
    "border_gilded":   { "name": "Gilded Frame",     "cost": 800 },
}
```

### Key static methods

```gdscript
# Buy insurance: deduct premium, set active_insurance.
# Returns error string or "" on success.
static func buy_insurance(tier_id: String) -> String

# Calc insurance refund for a given gold loss amount.
static func calc_refund(gold_lost: int, insurance_id: String) -> int:
    var refund_pct: float = INSURANCE.get(insurance_id, INSURANCE["none"])["refund_pct"]
    return int(floor(gold_lost * refund_pct))

# Deduct broadcast cost. Returns error string or "".
static func buy_broadcast(tier_id: String) -> String

# Buy cosmetic. Returns error string or "".
static func buy_cosmetic(cosmetic_id: String, auto_equip: bool) -> String

# Equip cosmetic (no cost). Returns error string or "".
static func equip_cosmetic(cosmetic_id: String) -> String
```

---

## Task 3 — PrepScreen updates

### PvP mode (GameManager.current_state == PVP_PREP)
Add `InsuranceRow` below the sliders:
```
InsuranceRow (HBoxContainer)
├── Label "Insurance:"
└── InsuranceOption (OptionButton)  — None / Bronze (+30g) / Silver (+60g) / Gold (+100g)
```
- Grey out options where `premium > PlayerData.gold`
- On Confirm: call `EconomyManager.buy_insurance(selected_id)`, then emit `confirmed`

### PvE mode (GameManager.current_state == PVE_PREP or entered from boss lair)
Add `BroadcastRow`:
```
BroadcastRow (HBoxContainer)
├── Label "Broadcast:"
└── BroadcastOption (OptionButton)  — Basic (free) / Extended (100g) / Global (300g)
```
- Grey out options where `cost > PlayerData.gold`
- On Confirm: store selection in `PlayerData` (deducted later in BossArena._ready)

PrepScreen needs a `mode` property set by WorldScene before adding as child:
`prep_screen.mode = "pvp"` or `prep_screen.mode = "pve"`

---

## Task 4 — StoreScreen

CanvasLayer (layer=15). Two tabs: Titles | Borders.

### Node tree
```
StoreScreen (CanvasLayer, layer=15)
└── Panel (Control, centered, 640×480)
    ├── Title (Label)  "Store"
    ├── GoldLabel (Label)  "Gold: 500"
    ├── TabBar (TabBar)  [Titles | Borders]
    ├── ItemList (VBoxContainer)
    │   └── (ItemRow × N per tab)
    │       ├── NameLabel
    │       ├── CostLabel
    │       ├── StatusLabel   "Owned" / "Equipped" / ""
    │       └── BuyBtn / EquipBtn
    ├── ErrorLabel (Label)
    └── CloseBtn (Button)  "Close"
```

### Script behavior
- `_ready`: populate item rows from `EconomyManager.TITLES` + `EconomyManager.BORDERS`
- Per row: if `owned_cosmetics.has(id)` → show EquipBtn (free); else BuyBtn with cost
- BuyBtn pressed: `EconomyManager.buy_cosmetic(id, true)` → refresh gold label + rows
- EquipBtn pressed: `EconomyManager.equip_cosmetic(id)` → update status labels
- CloseBtn: `close_requested` signal → WorldScene removes it

Signal: `close_requested`

---

## Task 5 — ResultScreen update

Add `InsuranceLabel` showing refund if active:
```
"Insurance refund: +50 gold" (shown only when refund > 0)
```

`show_result(won, gold_delta, new_gold, refund)` — add `refund: int = 0` param.

---

## Task 6 — PvPArena update

In `_end_battle(won)`:
```gdscript
var refund: int = 0
if not won:
    var transfer: int = BattleManager.calc_gold_transfer(PlayerData.gold)
    refund = EconomyManager.calc_refund(transfer, PlayerData.active_insurance)
    gold_delta = -(transfer - refund)
    PlayerData.gold = max(0, PlayerData.gold - transfer + refund)
    PlayerData.active_insurance = "none"   # consume policy
else:
    gold_delta = BattleManager.calc_gold_transfer(_opponent.max_hp)
    PlayerData.gold += gold_delta
    PlayerData.active_insurance = "none"   # consume on win too
battle_ended.emit(won, gold_delta, PlayerData.gold, refund)
```

`battle_ended` signal gains a 4th param: `refund: int`.

---

## Task 7 — BossArena update

In `_ready`, after battle data loaded:
```gdscript
var broadcast_id: String = PlayerData.pending_broadcast
var cost: int = EconomyManager.BROADCAST.get(broadcast_id, {}).get("cost", 0)
if cost > 0:
    PlayerData.gold = max(0, PlayerData.gold - cost)
    PlayerData.pending_broadcast = "basic"
```

Add `pending_broadcast: String = "basic"` to PlayerData.

---

## Task 8 — WorldScene store trigger

```gdscript
const STORE_SCREEN_SCENE: PackedScene = preload("res://scenes/ui/StoreScreen.tscn")
var _store_screen: StoreScreen = null

func _on_store() -> void:
    if _store_screen != null:
        return
    _store_screen = STORE_SCREEN_SCENE.instantiate()
    add_child(_store_screen)
    _local_player.hide_interact_hint()
    _store_screen.close_requested.connect(_on_store_closed)

func _on_store_closed() -> void:
    _store_screen.queue_free()
    _store_screen = null
    hud.refresh_gold()
```

---

## Task 9 — Unit tests

`tests/unit/test_economy_manager.gd`:
- `test_insurance_premium_deducted_on_buy`
- `test_insurance_cannot_buy_if_insufficient_gold`
- `test_insurance_cannot_stack` (already active → error)
- `test_calc_refund_bronze_25_percent`
- `test_calc_refund_silver_50_percent`
- `test_calc_refund_gold_75_percent`
- `test_calc_refund_none_zero`
- `test_broadcast_cost_deducted`
- `test_broadcast_free_basic`
- `test_broadcast_insufficient_gold`
- `test_buy_cosmetic_deducts_gold`
- `test_buy_cosmetic_adds_to_owned`
- `test_buy_cosmetic_auto_equips`
- `test_buy_cosmetic_already_owned_no_charge`
- `test_equip_cosmetic_not_owned_returns_error`
- `test_equip_title_sets_equipped_title`
- `test_equip_border_sets_equipped_border`
