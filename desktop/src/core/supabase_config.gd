class_name SupabaseConfig
extends Node

# Public Supabase credentials — safe to ship with the game.
# The anon key is intentionally public; RLS on all tables enforces access control.
# Never put the service_role key here.

const SUPABASE_URL: String = "https://ntwgjjetksbchiizfsyq.supabase.co"
const ANON_KEY: String = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50d2dqamV0a3NiY2hpaXpmc3lxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNzIxMDMsImV4cCI6MjA5MjY0ODEwM30.YR1XCAj1AuSkLO5Fcss5J4EJe_kzeOd_1uhRUderSX0"

var supabase_url: String = SUPABASE_URL
var anon_key: String = ANON_KEY
var ws_url: String = ""
var is_configured: bool = true


func _ready() -> void:
	ws_url = SUPABASE_URL.replace("https://", "wss://") + "/realtime/v1/websocket"
