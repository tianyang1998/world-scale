extends GdUnitTestSuite

## Tests for NetworkManager pure helper logic.
## These do NOT open a real WebSocket — they test ref counting,
## throttle logic, and presence-diff parsing in isolation.


# ─── _next_ref increments monotonically ───────────────────────────────────────

func test_next_ref_increments() -> void:
	var nm: NetworkManager = NetworkManager.new()
	var r1: String = nm._next_ref()
	var r2: String = nm._next_ref()
	var r3: String = nm._next_ref()
	assert_int(int(r2)).is_greater(int(r1))
	assert_int(int(r3)).is_greater(int(r2))
	nm.free()


func test_next_ref_starts_at_one() -> void:
	var nm: NetworkManager = NetworkManager.new()
	assert_str(nm._next_ref()).is_equal("1")
	nm.free()


# ─── Move throttle ─────────────────────────────────────────────────────────────

func test_send_move_throttled_when_not_joined() -> void:
	# send_move is a no-op when not joined — no packet queued.
	var nm: NetworkManager = NetworkManager.new()
	nm._joined = false
	nm._connected = false
	# Should not crash and emits nothing.
	nm.send_move(100.0, 50.0)
	nm.free()


# ─── Presence diff parsing ─────────────────────────────────────────────────────

func test_presence_diff_joins_emits_player_joined() -> void:
	var nm: NetworkManager = NetworkManager.new()
	var captured: Array = []
	nm.player_joined.connect(func(uid, pname, x, y):
		captured.append({"uid": uid, "name": pname, "x": x, "y": y})
	)

	var payload: Dictionary = {
		"joins": {
			"user_abc": {
				"metas": [{"userId": "user_abc", "name": "Alice", "x": 55.0, "y": 30.0}]
			}
		},
		"leaves": {}
	}
	nm._handle_presence_diff(payload)

	assert_int(captured.size()).is_equal(1)
	assert_str(captured[0]["uid"]).is_equal("user_abc")
	assert_str(captured[0]["name"]).is_equal("Alice")
	assert_float(captured[0]["x"]).is_equal_approx(55.0, 0.001)
	assert_float(captured[0]["y"]).is_equal_approx(30.0, 0.001)
	nm.free()


func test_presence_diff_leaves_emits_player_left() -> void:
	var nm: NetworkManager = NetworkManager.new()
	var left_ids: Array = []
	nm.player_left.connect(func(uid): left_ids.append(uid))

	var payload: Dictionary = {
		"joins": {},
		"leaves": {
			"user_xyz": {"metas": [{}]}
		}
	}
	nm._handle_presence_diff(payload)

	assert_int(left_ids.size()).is_equal(1)
	assert_str(left_ids[0]).is_equal("user_xyz")
	nm.free()


func test_presence_diff_empty_payload_no_emit() -> void:
	var nm: NetworkManager = NetworkManager.new()
	var join_count: int = 0
	var leave_count: int = 0
	nm.player_joined.connect(func(_a, _b, _c, _d): join_count += 1)
	nm.player_left.connect(func(_a): leave_count += 1)

	nm._handle_presence_diff({"joins": {}, "leaves": {}})

	assert_int(join_count).is_equal(0)
	assert_int(leave_count).is_equal(0)
	nm.free()


# ─── Broadcast routing ────────────────────────────────────────────────────────

func test_broadcast_move_emits_player_moved() -> void:
	var nm: NetworkManager = NetworkManager.new()
	# Fake PlayerData.user_id so we don't filter out the event.
	PlayerData.user_id = "self_id"

	var moves: Array = []
	nm.player_moved.connect(func(uid, x, y): moves.append({"uid": uid, "x": x, "y": y}))

	nm._handle_broadcast({
		"event": "move",
		"payload": {"userId": "other_player", "x": 77.5, "y": 42.0}
	})

	assert_int(moves.size()).is_equal(1)
	assert_str(moves[0]["uid"]).is_equal("other_player")
	assert_float(moves[0]["x"]).is_equal_approx(77.5, 0.001)
	nm.free()


func test_broadcast_move_self_not_emitted() -> void:
	var nm: NetworkManager = NetworkManager.new()
	PlayerData.user_id = "self_id"

	var moves: Array = []
	nm.player_moved.connect(func(uid, x, y): moves.append(uid))

	nm._handle_broadcast({
		"event": "move",
		"payload": {"userId": "self_id", "x": 10.0, "y": 20.0}
	})

	assert_int(moves.size()).is_equal(0)
	nm.free()


func test_broadcast_challenge_emits_only_for_self() -> void:
	var nm: NetworkManager = NetworkManager.new()
	PlayerData.user_id = "target_user"

	var challenges: Array = []
	nm.challenge_received.connect(func(fid, fname, bid):
		challenges.append({"fid": fid, "fname": fname, "bid": bid})
	)

	# Addressed to us — should emit.
	nm._handle_broadcast({
		"event": "challenge",
		"payload": {"toId": "target_user", "fromId": "attacker", "fromName": "Bob", "battleId": "battle_1"}
	})
	# Addressed to someone else — should NOT emit.
	nm._handle_broadcast({
		"event": "challenge",
		"payload": {"toId": "other_user", "fromId": "attacker", "fromName": "Bob", "battleId": "battle_2"}
	})

	assert_int(challenges.size()).is_equal(1)
	assert_str(challenges[0]["fid"]).is_equal("attacker")
	assert_str(challenges[0]["bid"]).is_equal("battle_1")
	nm.free()


func test_broadcast_pve_invite_emits_to_all() -> void:
	var nm: NetworkManager = NetworkManager.new()
	var invites: Array = []
	nm.pve_invite_received.connect(func(fid, fname, bname, bid):
		invites.append({"bname": bname})
	)

	nm._handle_broadcast({
		"event": "pve_invite",
		"payload": {
			"fromId": "leader", "fromName": "Carol",
			"bossName": "Serpent King", "battleId": "pve_99"
		}
	})

	assert_int(invites.size()).is_equal(1)
	assert_str(invites[0]["bname"]).is_equal("Serpent King")
	nm.free()
