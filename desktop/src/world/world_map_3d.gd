class_name WorldMap3D
extends Node3D

## Emitted when the player's CharacterBody3D enters a named trigger zone.
## trigger_name is one of: "portal_left", "portal_right", "boss_lair", "store"
signal trigger_entered(trigger_name: String)

## Tier → ground color. From map-system.md §3.5.
const TIER_COLORS: Dictionary[String, Color] = {
    "Apprentice":  Color("#3a3828"),
    "Initiate":    Color("#2e3a22"),
    "Acolyte":     Color("#1e3a20"),
    "Journeyman":  Color("#1e3828"),
    "Adept":       Color("#1e2e38"),
    "Scholar":     Color("#1e2240"),
    "Sage":        Color("#2a1e40"),
    "Arcanist":    Color("#30183a"),
    "Exemplar":    Color("#351a2a"),
    "Vanguard":    Color("#3a2210"),
    "Master":      Color("#3a2a10"),
    "Grandmaster": Color("#3a2808"),
    "Champion":    Color("#3a1010"),
    "Paragon":     Color("#3a0e0e"),
    "Legend":      Color("#200020"),
}

@onready var terrain_mesh: MeshInstance3D = $Terrain/MeshInstance3D
@onready var portal_left: Area3D = $Triggers/PortalLeft
@onready var portal_right: Area3D = $Triggers/PortalRight
@onready var boss_lair: Area3D = $Triggers/BossLair
@onready var store_zone: Area3D = $Triggers/StoreZone

var _terrain_mat: StandardMaterial3D = null

func _ready() -> void:
    apply_tier_theme(PlayerData.tier)
    portal_left.body_entered.connect(func(_b: Node3D) -> void: trigger_entered.emit("portal_left"))
    portal_right.body_entered.connect(func(_b: Node3D) -> void: trigger_entered.emit("portal_right"))
    boss_lair.body_entered.connect(func(_b: Node3D) -> void: trigger_entered.emit("boss_lair"))
    store_zone.body_entered.connect(func(_b: Node3D) -> void: trigger_entered.emit("store"))

## Swaps the terrain albedo to the tier's ground color. Reuses the cached material on repeated calls.
func apply_tier_theme(tier: String) -> void:
    if not TIER_COLORS.has(tier):
        push_warning("WorldMap3D: unknown tier '%s', terrain theme not applied" % tier)
        return
    if _terrain_mat == null:
        _terrain_mat = StandardMaterial3D.new()
        _terrain_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
        # Checkerboard grid: alternate between base color and a slightly lighter shade
        # uv1_scale tiles the UVs so each tile = 10m × 10m on the 240×160m terrain
        _terrain_mat.uv1_scale = Vector3(24.0, 16.0, 1.0)
        terrain_mesh.set_surface_override_material(0, _terrain_mat)
    var base: Color = TIER_COLORS[tier]
    # Slightly lighter shade for the checker — keeps the palette but adds contrast
    var light: Color = base.lightened(0.12)
    var image := Image.create(2, 2, false, Image.FORMAT_RGB8)
    image.set_pixel(0, 0, base)
    image.set_pixel(1, 1, base)
    image.set_pixel(1, 0, light)
    image.set_pixel(0, 1, light)
    var tex := ImageTexture.create_from_image(image)
    _terrain_mat.albedo_texture = tex
    _terrain_mat.albedo_color = Color.WHITE
