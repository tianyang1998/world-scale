class_name SupabaseConfig
extends Node

# Reads Supabase credentials from user://supabase.cfg at startup.
# Create that file once alongside the game (never committed to source):
#
#   [supabase]
#   project_id = abcdefghijklmnop
#   anon_key = eyJhbGciOiJIUzI1NiIsInR5...
#   api_base = https://abcdefghijklmnop.supabase.co
#
# If the file is missing or incomplete, all reads return empty strings
# and the game logs a clear error at startup.

const CONFIG_PATH: String = "user://supabase.cfg"
const SECTION: String = "supabase"

var project_id: String = ""
var anon_key: String = ""
var api_base: String = ""
var ws_url: String = ""

var is_configured: bool = false


func _ready() -> void:
	_load()


func _load() -> void:
	var cfg := ConfigFile.new()
	var err: Error = cfg.load(CONFIG_PATH)
	if err != OK:
		push_error(
			"SupabaseConfig: '%s' not found (err=%d). " % [CONFIG_PATH, err] +
			"Create it with [supabase] project_id / anon_key / api_base. " +
			"See desktop/docs/supabase-setup.md for instructions."
		)
		return

	project_id = cfg.get_value(SECTION, "project_id", "")
	anon_key   = cfg.get_value(SECTION, "anon_key",   "")
	api_base   = cfg.get_value(SECTION, "api_base",   "")

	if project_id.is_empty() or anon_key.is_empty() or api_base.is_empty():
		push_error(
			"SupabaseConfig: '%s' is incomplete — " % CONFIG_PATH +
			"project_id, anon_key, and api_base are all required."
		)
		return

	# Derive WebSocket URL from api_base (strip https:// → wss://)
	ws_url = api_base.replace("https://", "wss://") + "/realtime/v1/websocket"
	is_configured = true
