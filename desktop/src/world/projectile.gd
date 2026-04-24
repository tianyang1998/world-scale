class_name Projectile
extends Node2D

signal hit_landed(target_id: String, damage: int, kind: String)

const BASE_SPEED_PX_MS: float = 0.25

# Per-kind static data: speed_mult, draw_size, hit_radius, no_dodge, color hex
const KIND_DATA: Dictionary = {
	"sword":      {"sm": 1.3,  "sz": 8.0,  "hr": 16.0, "nd": false, "col": "#e8e0f0"},
	"orb":        {"sm": 1.0,  "sz": 9.0,  "hr": 14.0, "nd": false, "col": "#9b72cf"},
	"lightning":  {"sm": 1.4,  "sz": 7.0,  "hr": 14.0, "nd": false, "col": "#EF9F27"},
	"heal_pulse": {"sm": 1.0,  "sz": 10.0, "hr": 20.0, "nd": true,  "col": "#1D9E75"},
	"paint":      {"sm": 1.0,  "sz": 11.0, "hr": 16.0, "nd": false, "col": "#cf7272"},
	"verdict":    {"sm": 1.2,  "sz": 7.0,  "hr": 12.0, "nd": false, "col": "#BA7517"},
	"tentacle":   {"sm": 0.9,  "sz": 12.0, "hr": 18.0, "nd": false, "col": "#cf3333"},
	"beam_pulse": {"sm": 1.0,  "sz": 10.0, "hr": 16.0, "nd": false, "col": "#b44cf0"},
	"missile":    {"sm": 1.4,  "sz": 8.0,  "hr": 14.0, "nd": false, "col": "#EF9F27"},
	"dark_orb":   {"sm": 0.8,  "sz": 11.0, "hr": 16.0, "nd": false, "col": "#6b2fa0"},
	"spiral":     {"sm": 0.85, "sz": 13.0, "hr": 18.0, "nd": false, "col": "#e85d5d"},
	"gavel":      {"sm": 1.1,  "sz": 14.0, "hr": 20.0, "nd": false, "col": "#d4a017"},
}

var kind: String = "orb"
var origin: Vector2 = Vector2.ZERO
var target_pos: Vector2 = Vector2.ZERO
var target_id: String = ""
var damage: int = 0
var speed_px_ms: float = BASE_SPEED_PX_MS
var draw_size: float = 8.0
var hit_radius: float = 14.0
var no_dodge: bool = false
var proj_color: Color = Color.WHITE
var trail_color: Color = Color.GRAY

var age_ms: float = 0.0
var max_age_ms: float = 0.0
var total_dist: float = 0.0
var _hit: bool = false
var _dir: Vector2 = Vector2.RIGHT

# Flash state (kept after projectile arrives so flash can finish)
var _flash_age_ms: float = -1.0
var _flash_pos: Vector2 = Vector2.ZERO


func init(p_kind: String, p_origin: Vector2, p_target: Vector2,
		p_target_id: String, p_damage: int) -> void:
	kind = p_kind
	origin = p_origin
	target_pos = p_target
	target_id = p_target_id
	damage = p_damage
	position = origin

	var data: Dictionary = KIND_DATA.get(kind, KIND_DATA["orb"])
	speed_px_ms = BASE_SPEED_PX_MS * float(data["sm"])
	draw_size = float(data["sz"])
	hit_radius = float(data["hr"])
	no_dodge = bool(data["nd"])
	proj_color = Color(data["col"])
	trail_color = proj_color.darkened(0.4)

	total_dist = origin.distance_to(target_pos)
	if total_dist < 0.001:
		_hit = true
		hit_landed.emit(target_id, damage, kind)
		queue_free()
		return

	_dir = (target_pos - origin).normalized()
	max_age_ms = (total_dist / speed_px_ms) * 1.2


func _process(delta: float) -> void:
	if _flash_age_ms >= 0.0:
		_flash_age_ms += delta * 1000.0
		queue_redraw()
		if _flash_age_ms >= 300.0:
			queue_free()
		return

	if _hit:
		return

	age_ms += delta * 1000.0
	if age_ms >= max_age_ms:
		queue_free()
		return

	var t: float = min(age_ms * speed_px_ms / total_dist, 1.0)
	position = origin.lerp(target_pos, t)
	queue_redraw()
	_check_hit()


func _check_hit() -> void:
	var check: Vector2 = target_pos  # no_dodge always uses fixed pos
	if position.distance_to(check) < hit_radius:
		_hit = true
		hit_landed.emit(target_id, damage, kind)
		_flash_pos = position - origin  # local coords
		_flash_age_ms = 0.0
		queue_redraw()


func _draw() -> void:
	if _flash_age_ms >= 0.0:
		_draw_flash()
		return

	var alpha: float = max(0.0, 1.0 - age_ms / max_age_ms) if max_age_ms > 0.0 else 1.0
	modulate.a = alpha

	match kind:
		"sword":
			_draw_sword()
		"lightning", "missile":
			_draw_lightning()
		"verdict", "gavel":
			_draw_verdict()
		"heal_pulse":
			_draw_heal_pulse()
		"spiral":
			_draw_spiral()
		_:
			_draw_orb()


func _draw_orb() -> void:
	draw_circle(Vector2.ZERO, draw_size * 1.6, trail_color)
	draw_circle(Vector2.ZERO, draw_size, proj_color)
	draw_circle(Vector2.ZERO, draw_size * 0.3, Color.WHITE)


func _draw_sword() -> void:
	var half: Vector2 = _dir * 12.0
	draw_line(-half, half, Color(1.0, 1.0, 1.0, 0.4), 6.0)
	draw_line(-half, half, proj_color, 3.0)


func _draw_lightning() -> void:
	var pts: PackedVector2Array
	var seg: float = draw_size * 2.0
	for i in range(5):
		var base: Vector2 = _dir * (seg * i)
		var perp: Vector2 = _dir.rotated(PI * 0.5) * randf_range(-draw_size, draw_size)
		pts.append(base + perp)
	for i in range(pts.size() - 1):
		draw_line(pts[i], pts[i + 1], proj_color, 2.0)
	if pts.size() > 0:
		draw_circle(pts[-1], draw_size * 0.4, Color.WHITE)


func _draw_verdict() -> void:
	var tip: Vector2 = _dir * draw_size * 2.0
	draw_line(Vector2.ZERO, tip, Color(proj_color.r, proj_color.g, proj_color.b, 0.35), draw_size * 1.2)
	draw_line(Vector2.ZERO, tip, proj_color, 2.0)
	draw_circle(tip, draw_size * 0.5, proj_color)


func _draw_heal_pulse() -> void:
	var arm: float = draw_size * 1.4
	draw_line(Vector2(-arm, 0.0), Vector2(arm, 0.0), proj_color, 3.0)
	draw_line(Vector2(0.0, -arm), Vector2(0.0, arm), proj_color, 3.0)
	draw_arc(Vector2.ZERO, draw_size * 1.8, 0.0, TAU, 16,
			Color(proj_color.r, proj_color.g, proj_color.b, 0.4), 2.0)


func _draw_spiral() -> void:
	var t_norm: float = age_ms / max_age_ms if max_age_ms > 0.0 else 0.0
	for i in range(3):
		var angle: float = t_norm * TAU * 4.0 + i * (TAU / 3.0)
		var p: Vector2 = Vector2(cos(angle), sin(angle)) * draw_size * 1.2
		draw_circle(p, draw_size * 0.35, proj_color)
	draw_circle(Vector2.ZERO, draw_size * 0.4, proj_color)


func _draw_flash() -> void:
	var a: float = max(0.0, 1.0 - _flash_age_ms / 300.0)
	var r: float = 8.0 + _flash_age_ms * 0.08
	draw_circle(_flash_pos, r, Color(proj_color.r, proj_color.g, proj_color.b, a))
