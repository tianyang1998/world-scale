class_name SupabaseConfig
extends Node

# Reads Supabase credentials from user://supabase.cfg at startup.
# Create that file once per machine — never commit it to source control.
# Copy docs/supabase.cfg.template as a starting point.
#
#   [supabase]
#   supabase_url = https://abcdefghijklmnop.supabase.co
#   anon_key     = eyJhbGciOiJIUzI1NiIsInR5...
#
# supabase_url — Settings → API → Project URL
# anon_key     — Settings → API → Legacy anon/public key (eyJ... format)
#
# ws_url is auto-derived (https:// → wss:// + /realtime/v1/websocket)
# No Next.js server needed — the desktop talks directly to Supabase.

const CONFIG_PATH: String = "user://supabase.cfg"
const SECTION: String = "supabase"

var supabase_url: String = ""
var anon_key: String = ""
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
			"Create it with [supabase] supabase_url / anon_key. " +
			"See desktop/docs/supabase-setup.md for instructions."
		)
		return

	supabase_url = cfg.get_value(SECTION, "supabase_url", "")
	anon_key     = cfg.get_value(SECTION, "anon_key",     "")

	if supabase_url.is_empty() or anon_key.is_empty():
		push_error(
			"SupabaseConfig: '%s' is incomplete — " % CONFIG_PATH +
			"supabase_url and anon_key are both required."
		)
		return

	ws_url = supabase_url.replace("https://", "wss://") + "/realtime/v1/websocket"
	is_configured = true
