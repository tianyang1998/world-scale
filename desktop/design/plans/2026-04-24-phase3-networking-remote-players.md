# Phase 3: NetworkManager + Presence + RemotePlayers

> **Goal:** Players on the same tier see each other moving in real time.
> Walking into a portal switches the player to the adjacent tier's channel.
> Challenge and pve_invite broadcasts show a modal stub.

**Architecture:**
- `NetworkManager` (autoload) owns the Supabase WebSocket and all channel logic.
- `RemotePlayer.tscn` — kinematic Node3D with Label3D name tag, no physics.
- `WorldScene` — spawns/despawns remote players from NetworkManager signals.
- Move broadcast throttle: 80 ms (matches web version).

**Supabase Realtime in Godot:**
Godot has no first-party Supabase SDK. We use the built-in `WebSocketPeer`
(Godot 4.x) to connect directly to the Supabase Realtime WebSocket endpoint.
The protocol is documented in the Supabase Realtime Phoenix channel spec.
All messages are JSON over the WebSocket.

**Connection URL pattern:**
```
wss://<PROJECT_REF>.supabase.co/realtime/v1/websocket?apikey=<ANON_KEY>&vsn=1.0.0
```

**Phoenix channel join message:**
```json
{"topic":"realtime:map:<tier>","event":"phx_join","payload":{"config":{"presence":{"key":"<user_id>"}}},"ref":"1"}
```

**Presence track (after join):**
```json
{"topic":"realtime:map:<tier>","event":"presence","payload":{"event":"track","payload":{"userId":"...","name":"...","tier":"...","x":0,"y":0}},"ref":"2"}
```

**Broadcast move:**
```json
{"topic":"realtime:map:<tier>","event":"broadcast","payload":{"event":"move","payload":{"userId":"...","x":120.0,"y":80.0}},"ref":"3"}
```

---

## File Map

```
desktop/
├── src/
│   ├── core/
│   │   └── network_manager.gd     ← REWRITE: WebSocket, Presence, Broadcast
│   └── world/
│       ├── remote_player.gd       ← NEW: kinematic position interpolation
│       └── world_scene.gd         ← UPDATE: connect NetworkManager signals
├── scenes/
│   └── world/
│       ├── RemotePlayer.tscn      ← NEW: Node3D + MeshInstance3D + Label3D
│       └── WorldHUD.tscn          ← UPDATE: add online count label
└── src/ui/
    └── world_hud.gd               ← UPDATE: expose update_online_count()
```

---

## Task 1 — NetworkManager rewrite

### Constants (placeholders — replace before live test)
```gdscript
const SUPABASE_URL: String = "wss://PLACEHOLDER.supabase.co/realtime/v1/websocket"
const SUPABASE_ANON_KEY: String = "PLACEHOLDER_ANON_KEY"
const MOVE_THROTTLE_MS: int = 80
const HEARTBEAT_INTERVAL_MS: int = 30000
```

### Signals
```gdscript
signal player_joined(user_id: String, name: String, x: float, y: float)
signal player_left(user_id: String)
signal player_moved(user_id: String, x: float, y: float)
signal challenge_received(from_id: String, from_name: String, battle_id: String)
signal pve_invite_received(from_id: String, from_name: String, boss_name: String, battle_id: String)
signal channel_ready   # emitted after join + presence track confirmed
```

### State
```gdscript
var _ws: WebSocketPeer = WebSocketPeer.new()
var _current_tier: String = ""
var _ref_counter: int = 0
var _last_move_ms: int = 0
var _connected: bool = false
var _heartbeat_ms: int = 0
```

### Public API
```gdscript
func connect_to_map(tier: String) -> void
    # Opens WebSocket if not open, joins map:<tier> channel, tracks presence
func disconnect_from_map() -> void
    # Sends phx_leave, closes WebSocket
func send_move(x: float, y: float) -> void
    # Throttled: only sends if MOVE_THROTTLE_MS elapsed since last send
func send_challenge(to_id: String, battle_id: String) -> void
func send_pve_invite(battle_id: String, boss_name: String, boss_tier: String) -> void
```

### Message routing (_process)
```
ws.poll()
while ws.get_available_packet_count() > 0:
    parse JSON
    match msg["event"]:
        "presence_diff" → _handle_presence_diff(msg["payload"])
        "broadcast"     → _handle_broadcast(msg["payload"])
        "phx_reply"     → ignore (ack)
        "heartbeat"     → send phx_heartbeat reply
```

### Presence diff handling
```
joins dict  → for each key: emit player_joined(userId, name, x, y)
leaves dict → for each key: emit player_left(userId)
```

### Broadcast event routing
```
"move"      → emit player_moved(userId, x, y)
"challenge" → if toId == PlayerData.user_id: emit challenge_received(...)
"pve_invite"→ emit pve_invite_received(...)
```

### Heartbeat
Send `{"topic":"phoenix","event":"heartbeat","payload":{},"ref":"N"}` every 30s
to keep the WebSocket alive.

### Tier switch
```gdscript
func switch_tier(new_tier: String) -> void:
    disconnect_from_map()
    connect_to_map(new_tier)
```

---

## Task 2 — RemotePlayer scene + script

### Node tree
```
RemotePlayer (Node3D)
├── MeshInstance3D    ← CapsuleMesh, albedo=#c07080 (neutral placeholder)
└── NameTag (Label3D) ← Billboard, offset (0, 1.4, 0), font_size=40
```

### Script: `src/world/remote_player.gd`
```gdscript
class_name RemotePlayer
extends Node3D

const LERP_SPEED: float = 8.0   # interpolation toward target position

var _target_pos: Vector3 = Vector3.ZERO
@onready var name_tag: Label3D = $NameTag

func init(player_name: String, x: float, y: float) -> void:
    name_tag.text = player_name
    global_position = Vector3(x, 0.0, y)
    _target_pos = global_position

func update_target(x: float, y: float) -> void:
    _target_pos = Vector3(x, 0.0, y)

func _process(delta: float) -> void:
    global_position = global_position.lerp(_target_pos, LERP_SPEED * delta)
```

Note: Y→Z mapping. The web `y` coordinate is the 3D `Z` axis (both are the
"depth" axis). NetworkManager receives `{x, y}` from web-style payload; we
map to `Vector3(x, 0, y)`.

---

## Task 3 — WorldScene update

Add to `world_scene.gd`:
```gdscript
const REMOTE_PLAYER_SCENE: PackedScene = preload("res://scenes/world/RemotePlayer.tscn")
var _remote_players: Dictionary = {}   # user_id → RemotePlayer node

func _ready() -> void:
    _spawn_player()
    world_map.trigger_entered.connect(_on_trigger_entered)
    _connect_network()
    NetworkManager.connect_to_map(PlayerData.tier)

func _connect_network() -> void:
    NetworkManager.player_joined.connect(_on_player_joined)
    NetworkManager.player_left.connect(_on_player_left)
    NetworkManager.player_moved.connect(_on_player_moved)
    NetworkManager.challenge_received.connect(_on_challenge_received)
    NetworkManager.pve_invite_received.connect(_on_pve_invite_received)

func _on_player_joined(user_id: String, p_name: String, x: float, y: float) -> void:
    if user_id == PlayerData.user_id:
        return   # don't spawn self
    var rp: RemotePlayer = REMOTE_PLAYER_SCENE.instantiate()
    add_child(rp)
    rp.init(p_name, x, y)
    _remote_players[user_id] = rp
    _update_online_count()

func _on_player_left(user_id: String) -> void:
    if _remote_players.has(user_id):
        _remote_players[user_id].queue_free()
        _remote_players.erase(user_id)
    _update_online_count()

func _on_player_moved(user_id: String, x: float, y: float) -> void:
    if _remote_players.has(user_id):
        _remote_players[user_id].update_target(x, y)

func _on_challenge_received(from_id: String, from_name: String, _battle_id: String) -> void:
    print("Challenge from %s (%s)" % [from_name, from_id])
    ## Phase 4: show challenge modal

func _on_pve_invite_received(from_id: String, from_name: String, boss_name: String, _battle_id: String) -> void:
    print("PvE invite from %s — boss: %s" % [from_name, boss_name])
    ## Phase 5: show invite modal

func _update_online_count() -> void:
    var hud: WorldHUD = $HUD    # adjust if node path differs
    if hud:
        hud.update_online_count(_remote_players.size() + 1)
```

**Portal trigger update (replace stub):**
```gdscript
func _on_portal(direction: int) -> void:
    var tiers: Array[String] = [
        "Apprentice","Initiate","Acolyte","Journeyman","Adept",
        "Scholar","Sage","Arcanist","Exemplar","Vanguard",
        "Master","Grandmaster","Champion","Paragon","Legend"
    ]
    var idx: int = tiers.find(PlayerData.tier)
    var new_idx: int = clamp(idx + direction, 0, tiers.size() - 1)
    if new_idx == idx:
        return   # already at boundary
    # Clear remote players
    for uid in _remote_players:
        _remote_players[uid].queue_free()
    _remote_players.clear()
    # Switch tier
    PlayerData.tier = tiers[new_idx]
    world_map.apply_tier_theme(PlayerData.tier)
    $HUD.update_tier(PlayerData.tier)
    NetworkManager.switch_tier(PlayerData.tier)
    # Reposition player to opposite portal
    var spawn_x: float = 235.0 if direction == -1 else 5.0
    _local_player.global_position = Vector3(spawn_x, 0.0, 80.0)
```

**Move broadcast in _physics_process:** Add to WorldScene (not LocalPlayer —
keeps networking out of the physics node):
```gdscript
func _process(_delta: float) -> void:
    if _local_player == null:
        return
    var pos: Vector3 = _local_player.global_position
    NetworkManager.send_move(pos.x, pos.z)   # z maps to web y
```

---

## Task 4 — WorldHUD update

Add to `world_hud.gd`:
```gdscript
@onready var online_label: Label = $Panel/OnlineLabel

func update_online_count(count: int) -> void:
    online_label.text = "Online: " + str(count)

func update_tier(tier: String) -> void:
    tier_label.text = "Tier: " + tier
```

Add `OnlineLabel` node to `WorldHUD.tscn` below GoldLabel.

---

## Task 5 — Unit tests

`tests/unit/test_network_helpers.gd` — test:
- `_next_ref()` increments monotonically
- move throttle: calling `send_move` twice within 80ms only queues one packet
- presence diff parsing: joins → player_joined emitted, leaves → player_left emitted

These test the pure helper functions without a live WebSocket.

---

## Deliverable

At the end of Phase 3:
- Two clients on the same tier see each other's capsule avatars moving in real time
- Entering a portal switches the player's tier channel, terrain color updates, remote players cleared
- Challenge and pve_invite broadcasts print to console (modals: Phase 4/5)
- WorldHUD shows live online count

**Not in Phase 3 (deferred):**
- Challenge modal UI — Phase 4
- PvE invite modal UI — Phase 5
- Battle arena scenes — Phase 4/5
- Actual Supabase credentials — replace PLACEHOLDER before live test
