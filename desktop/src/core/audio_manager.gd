class_name AudioManager
extends Node

const BGM_PATH := "res://assets/audio/bgm/"
const CROSSFADE_DURATION := 1.0
const LOOPS: Dictionary = {
	"landing": true, "map": true, "pvp": true,
	"pve": true, "win": false, "lose": false
}

var _players: Array[AudioStreamPlayer] = []
var _active_idx: int = 0
var _current_track: String = ""
var _bgm_volume: float = 0.5
var _sfx_volume: float = 0.5
var _bgm_muted_prev: float = -1.0
var _active_tween: Tween = null

func _ready() -> void:
	for i: int in 2:
		var p := AudioStreamPlayer.new()
		add_child(p)
		_players.append(p)
	_load_volume_settings()

func play_bgm(track: String) -> void:
	if track == _current_track:
		return
	if _active_tween and _active_tween.is_valid():
		_active_tween.kill()
	_current_track = track
	var next_idx := 1 - _active_idx
	var stream: AudioStream = load(BGM_PATH + track + ".mp3")
	_players[next_idx].stream = stream
	_players[next_idx].volume_db = linear_to_db(0.0)
	_players[next_idx].play()
	var tween := create_tween()
	_active_tween = tween
	tween.set_parallel(true)
	tween.tween_property(
		_players[_active_idx], "volume_db",
		linear_to_db(0.0), CROSSFADE_DURATION
	).from(linear_to_db(_bgm_volume))
	tween.tween_property(
		_players[next_idx], "volume_db",
		linear_to_db(_bgm_volume), CROSSFADE_DURATION
	).from(linear_to_db(0.0))
	tween.chain().tween_callback(_players[_active_idx].stop)
	_active_idx = next_idx
	if not LOOPS.get(track, true):
		_players[_active_idx].finished.connect(stop_bgm, CONNECT_ONE_SHOT)

func stop_bgm() -> void:
	for p: AudioStreamPlayer in _players:
		p.stop()
	_current_track = ""

func play_sfx(_effect: String) -> void:
	pass

func set_bgm_volume(vol: float) -> void:
	_bgm_volume = clampf(vol, 0.0, 1.0)
	if _players.size() > _active_idx:
		_players[_active_idx].volume_db = linear_to_db(_bgm_volume)
	_save_volume_settings()

func set_sfx_volume(vol: float) -> void:
	_sfx_volume = clampf(vol, 0.0, 1.0)
	_save_volume_settings()

func toggle_bgm_mute() -> void:
	if _bgm_muted_prev >= 0.0:
		set_bgm_volume(_bgm_muted_prev)
		_bgm_muted_prev = -1.0
	else:
		_bgm_muted_prev = _bgm_volume
		set_bgm_volume(0.0)

func _load_volume_settings() -> void:
	var cfg := ConfigFile.new()
	if cfg.load("user://settings.cfg") == OK:
		_bgm_volume = cfg.get_value("audio", "bgm_volume", 0.5)
		_sfx_volume = cfg.get_value("audio", "sfx_volume", 0.5)

func _save_volume_settings() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("audio", "bgm_volume", _bgm_volume)
	cfg.set_value("audio", "sfx_volume", _sfx_volume)
	cfg.save("user://settings.cfg")
