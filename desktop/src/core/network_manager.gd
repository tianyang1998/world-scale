extends Node

# Supabase Realtime WebSocket client.
# Implements the Phoenix channel protocol used by Supabase Realtime v1.
# Credentials are read from SupabaseConfig (user://supabase.cfg) at runtime.
const MOVE_THROTTLE_MS: int = 80
const HEARTBEAT_INTERVAL_MS: int = 30000

signal player_joined(user_id: String, player_name: String, x: float, y: float)
signal player_left(user_id: String)
signal player_moved(user_id: String, x: float, y: float)
signal challenge_received(from_id: String, from_name: String, battle_id: String)
signal pve_invite_received(from_id: String, from_name: String, boss_name: String, battle_id: String)
signal channel_ready

var _ws: WebSocketPeer = WebSocketPeer.new()
var _current_tier: String = ""
var _ref_counter: int = 0
var _last_move_ms: int = 0
var _heartbeat_ms: int = 0
var _connected: bool = false
var _joined: bool = false


func _process(delta: float) -> void:
	if not _connected:
		return
	_ws.poll()
	var state: WebSocketPeer.State = _ws.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		_heartbeat_ms += int(delta * 1000.0)
		if _heartbeat_ms >= HEARTBEAT_INTERVAL_MS:
			_heartbeat_ms = 0
			_send_raw({"topic": "phoenix", "event": "heartbeat", "payload": {}, "ref": _next_ref()})
		while _ws.get_available_packet_count() > 0:
			var raw: PackedByteArray = _ws.get_packet()
			_handle_packet(raw.get_string_from_utf8())
	elif state == WebSocketPeer.STATE_CLOSED:
		_connected = false
		_joined = false


func connect_to_map(tier: String) -> void:
	if _connected:
		disconnect_from_map()
	_current_tier = tier
	var url: String = SupabaseConfig.ws_url + "?apikey=" + SupabaseConfig.anon_key + "&vsn=1.0.0"
	var err: Error = _ws.connect_to_url(url)
	if err != OK:
		push_error("NetworkManager: WebSocket connect failed — err=%d" % err)
		return
	_connected = true
	_joined = false
	_heartbeat_ms = 0
	# Join is sent after STATE_OPEN confirmed in _process → _handle_packet phx_open
	# Workaround: poll until open, then join. Use a short deferred timer.
	_defer_join()


func disconnect_from_map() -> void:
	if not _connected:
		return
	if _joined:
		_send_raw({
			"topic": "realtime:map:" + _current_tier,
			"event": "phx_leave",
			"payload": {},
			"ref": _next_ref()
		})
	_ws.close()
	_connected = false
	_joined = false
	_current_tier = ""


func switch_tier(new_tier: String) -> void:
	disconnect_from_map()
	connect_to_map(new_tier)


func send_move(x: float, y: float) -> void:
	if not _joined:
		return
	var now_ms: int = Time.get_ticks_msec()
	if now_ms - _last_move_ms < MOVE_THROTTLE_MS:
		return
	_last_move_ms = now_ms
	_broadcast("move", {"userId": PlayerData.user_id, "x": x, "y": y})


func send_challenge(to_id: String, battle_id: String) -> void:
	if not _joined:
		return
	_broadcast("challenge", {
		"toId": to_id,
		"fromId": PlayerData.user_id,
		"fromName": PlayerData.character_name,
		"battleId": battle_id
	})


func send_pve_invite(battle_id: String, boss_name: String, boss_tier: String) -> void:
	if not _joined:
		return
	_broadcast("pve_invite", {
		"fromId": PlayerData.user_id,
		"fromName": PlayerData.character_name,
		"fromTier": PlayerData.tier,
		"battleId": battle_id,
		"bossName": boss_name,
		"bossTier": boss_tier
	})


# ─── Internal ────────────────────────────────────────────────────────────────

func _next_ref() -> String:
	_ref_counter += 1
	return str(_ref_counter)


func _defer_join() -> void:
	# Wait one frame so WebSocketPeer can transition to STATE_OPEN, then join.
	await get_tree().process_frame
	var waited: int = 0
	while _ws.get_ready_state() != WebSocketPeer.STATE_OPEN and waited < 50:
		_ws.poll()
		await get_tree().process_frame
		waited += 1
	if _ws.get_ready_state() != WebSocketPeer.STATE_OPEN:
		push_error("NetworkManager: WebSocket did not open in time")
		return
	_join_channel()


func _join_channel() -> void:
	var topic: String = "realtime:map:" + _current_tier
	_send_raw({
		"topic": topic,
		"event": "phx_join",
		"payload": {
			"config": {
				"presence": {"key": PlayerData.user_id},
				"broadcast": {"self": false}
			}
		},
		"ref": _next_ref()
	})


func _track_presence() -> void:
	var topic: String = "realtime:map:" + _current_tier
	_send_raw({
		"topic": topic,
		"event": "presence",
		"payload": {
			"event": "track",
			"payload": {
				"userId": PlayerData.user_id,
				"name": PlayerData.character_name,
				"tier": PlayerData.tier,
				"x": 120.0,
				"y": 80.0
			}
		},
		"ref": _next_ref()
	})


func _broadcast(event: String, payload: Dictionary) -> void:
	_send_raw({
		"topic": "realtime:map:" + _current_tier,
		"event": "broadcast",
		"payload": {"event": event, "payload": payload},
		"ref": _next_ref()
	})


func _send_raw(msg: Dictionary) -> void:
	var json: String = JSON.stringify(msg)
	_ws.send_text(json)


func _handle_packet(raw: String) -> void:
	var result: Variant = JSON.parse_string(raw)
	if not result is Dictionary:
		return
	var msg: Dictionary = result
	var event: String = msg.get("event", "")
	var payload: Dictionary = msg.get("payload", {})

	match event:
		"phx_reply":
			var status: String = payload.get("status", "")
			if status == "ok" and not _joined:
				_joined = true
				_track_presence()
				channel_ready.emit()
		"presence_diff":
			_handle_presence_diff(payload)
		"broadcast":
			_handle_broadcast(payload)
		"system":
			pass  # connection info, ignore


func _handle_presence_diff(payload: Dictionary) -> void:
	var joins: Dictionary = payload.get("joins", {})
	for uid: String in joins:
		var meta_list: Array = joins[uid].get("metas", [])
		if meta_list.is_empty():
			continue
		var meta: Dictionary = meta_list[0]
		var p_name: String = meta.get("name", "")
		var x: float = float(meta.get("x", 0))
		var y: float = float(meta.get("y", 0))
		player_joined.emit(uid, p_name, x, y)

	var leaves: Dictionary = payload.get("leaves", {})
	for uid: String in leaves:
		player_left.emit(uid)


func _handle_broadcast(payload: Dictionary) -> void:
	var event: String = payload.get("event", "")
	var data: Dictionary = payload.get("payload", {})
	match event:
		"move":
			var uid: String = data.get("userId", "")
			var x: float = float(data.get("x", 0))
			var y: float = float(data.get("y", 0))
			if uid != PlayerData.user_id:
				player_moved.emit(uid, x, y)
		"challenge":
			var to_id: String = data.get("toId", "")
			if to_id == PlayerData.user_id:
				challenge_received.emit(
					data.get("fromId", ""),
					data.get("fromName", ""),
					data.get("battleId", "")
				)
		"pve_invite":
			pve_invite_received.emit(
				data.get("fromId", ""),
				data.get("fromName", ""),
				data.get("bossName", ""),
				data.get("battleId", "")
			)
