class_name SupabaseConfig
extends Node

# Reads Supabase credentials from user://supabase.cfg at startup.
# Create that file once per machine — never commit it to source control.
#
# File format (copy from docs/supabase.cfg.template):
#
#   [supabase]
#   supabase_url = https://abcdefghijklmnop.supabase.co
#   anon_key     = eyJhbGciOiJIUzI1NiIsInR5...
#   api_base     = https://your-nextjs-server.vercel.app
#
# supabase_url  — your desktop Supabase project URL (Settings → API → Project URL)
# anon_key      — anon/public key (Settings → API → Project API keys → anon public)
# api_base      — your Next.js API server base URL (Vercel deployment or localhost)
#
# ws_url is auto-derived from supabase_url (https:// → wss:// + /realtime/v1/websocket)

const CONFIG_PATH: String = "user://supabase.cfg"
const SECTION: String = "supabase"

var supabase_url: String = ""
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
			"Create it with [supabase] supabase_url / anon_key / api_base. " +
			"See desktop/docs/supabase-setup.md for instructions."
		)
		return

	supabase_url = cfg.get_value(SECTION, "supabase_url", "")
	anon_key     = cfg.get_value(SECTION, "anon_key",     "")
	api_base     = cfg.get_value(SECTION, "api_base",     "")

	if supabase_url.is_empty() or anon_key.is_empty() or api_base.is_empty():
		push_error(
			"SupabaseConfig: '%s' is incomplete — " % CONFIG_PATH +
			"supabase_url, anon_key, and api_base are all required."
		)
		return

	ws_url = supabase_url.replace("https://", "wss://") + "/realtime/v1/websocket"
	is_configured = true
