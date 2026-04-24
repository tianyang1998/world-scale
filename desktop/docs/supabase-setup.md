# Supabase Setup — Desktop Client

The game reads credentials from a local config file at runtime.
This file is **never committed** — it lives outside the repo on each machine.

## 1. Create the desktop Supabase project

In Supabase dashboard, create a new project (separate from the web project).
After creation, grab these three values from **Settings → API**:

| Value | Where to find it |
|-------|-----------------|
| Project ID | URL slug in your project URL: `https://supabase.com/dashboard/project/<PROJECT_ID>` |
| Anon (public) key | Settings → API → Project API keys → `anon public` |
| API base URL | Settings → API → Project URL (e.g. `https://abcdefghijklmnop.supabase.co`) |

## 2. Create supabase.cfg

Create this file at the Godot `user://` path for your OS:

| OS | Path |
|----|------|
| Windows | `%APPDATA%\Godot\app_userdata\WorldScale\supabase.cfg` |
| macOS | `~/Library/Application Support/Godot/app_userdata/WorldScale/supabase.cfg` |
| Linux | `~/.local/share/godot/app_userdata/WorldScale/supabase.cfg` |

File contents:

```ini
[supabase]
project_id = YOUR_PROJECT_ID
anon_key = YOUR_ANON_PUBLIC_KEY
api_base = https://YOUR_PROJECT_ID.supabase.co
```

## 3. Supabase schema (TODO — do on Supabase web)

The following must be created in the Supabase dashboard before the game can log in:

### Auth
- Enable Email/Password sign-in under **Authentication → Providers**

### Tables (SQL Editor)

```sql
-- Characters table
create table public.characters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text unique not null,
  dominant_realm text not null default '',
  realm_scores jsonb not null default '{}',
  total_power int not null default 0,
  tier text not null default 'Apprentice',
  gold int not null default 500,
  realm_skill text not null default '',
  active_insurance text not null default 'none',
  owned_cosmetics text[] not null default '{}',
  equipped_title text not null default '',
  equipped_border text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row-level security
alter table public.characters enable row level security;

create policy "Users can read their own character"
  on public.characters for select
  using (auth.uid() = user_id);

create policy "Users can upsert their own character"
  on public.characters for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

### Realtime
- Enable Realtime on the `characters` table if needed for leaderboard
- The map presence + broadcast channels (`realtime:map:*`) use Supabase Realtime
  with no table — just enable Realtime in the project settings

## 4. API server (Next.js — shared with web or separate deployment)

The TitleScreen calls three endpoints on your API server:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/login` | POST | Email+password login, returns `{jwt, user_id, character}` |
| `/api/auth/signup` | POST | Create account, returns `{jwt, user_id}` |
| `/api/score` | POST | Submit credentials, returns scored stats + tier |
| `/api/character/save` | POST | Upsert character record, returns `{gold}` |

These are the same endpoints the web version uses. For the desktop client, point
`api_base` in `supabase.cfg` at whichever deployment you want to use.

If you want the desktop to share the web's API server, set:
```ini
api_base = https://your-web-app.vercel.app
```
and the WebSocket URL will still point to the separate desktop Supabase project
(they're independent — `ws_url` is derived from the desktop Supabase `api_base`,
not from the Next.js server).

> **Note**: The `ws_url` for Realtime is always `api_base` with `https://` replaced
> by `wss://`, plus `/realtime/v1/websocket`. This is auto-derived by `SupabaseConfig`.
