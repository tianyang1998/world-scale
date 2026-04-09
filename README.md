# World Scale
### Real-world credentials, turned into a fantasy character

Your professional achievements — citations, GitHub stars, case wins, patients treated — are translated into a character in a shared fantasy world. No invented stats. Your power comes from who you actually are.

Play live at **[worldscalegame.com](https://worldscalegame.com)**

---

## What it is

World Scale is a multiplayer browser RPG where your character's power is derived from your real professional credentials. Create a character by entering your stats in one of five realms, then enter the world map, challenge other players to PvP battles, or raid bosses with a party.

---

## Realms

| Realm    | Icon | Scored on |
|----------|------|-----------|
| Academia | 📚   | h-index, citations, publications, institution tier |
| Tech     | ⚡   | GitHub stars, repos, followers, commits, years active |
| Medicine | ⚕️   | Years practicing, papers, patients treated, hospital tier |
| Creative | 🎨   | Major works, awards, audience size, exhibitions |
| Law      | ⚖️   | Notable cases, win rate, bar admissions, firm tier |

---

## How scoring works

All dimensions are percentile-ranked within the user's realm cohort, so a top surgeon and a top engineer score comparably if both are equally elite in their fields.

| Dimension   | Weight | What it measures |
|-------------|--------|-----------------|
| Expertise   | 20%    | Years of experience (logarithmic curve) |
| Prestige    | 25%    | Institutional rank, followers, firm tier |
| Impact      | 30%    | Citations, stars, audience, case outcomes |
| Credentials | 15%    | Publications, repos, certifications |
| Network     | 10%    | i10-index, commits, referrals |

Final power = composite score × 120, range 0–12,000 per realm.

### The 15 tiers

| Tier        | Power Range   |
|-------------|---------------|
| Apprentice  | 0–799         |
| Initiate    | 800–1,599     |
| Acolyte     | 1,600–2,399   |
| Journeyman  | 2,400–3,199   |
| Adept       | 3,200–3,999   |
| Scholar     | 4,000–4,799   |
| Sage        | 4,800–5,599   |
| Arcanist    | 5,600–6,399   |
| Exemplar    | 6,400–7,199   |
| Vanguard    | 7,200–7,999   |
| Master      | 8,000–8,799   |
| Grandmaster | 8,800–9,599   |
| Champion    | 9,600–10,399  |
| Paragon     | 10,400–11,199 |
| Legend      | 11,200+       |

---

## Project structure

```
web/
├── app/
│   ├── page.tsx                    # Home — credential input + character card
│   ├── layout.tsx
│   ├── map/
│   │   └── page.tsx                # World map — real-time multiplayer canvas
│   ├── battle/
│   │   ├── prep/page.tsx           # PvP stat distribution before battle
│   │   └── [id]/page.tsx           # PvP arena — projectile combat canvas
│   ├── pve/
│   │   ├── prep/page.tsx           # PvE stat distribution before boss fight
│   │   └── [id]/page.tsx           # PvE arena — boss raid canvas
│   ├── profile/page.tsx            # Player profile — gold, stats, character
│   ├── leaderboard/page.tsx        # Global leaderboard
│   ├── auth/page.tsx               # Sign in / sign up
│   └── api/
│       ├── score/route.ts          # POST /api/score — credential scoring
│       ├── og/route.tsx            # GET /api/og — shareable card image
│       ├── character/
│       │   ├── save/route.ts       # POST /api/character/save
│       │   └── get/route.ts        # GET /api/character/get
│       ├── battle/
│       │   ├── create/route.ts     # POST /api/battle/create
│       │   └── end/route.ts        # POST /api/battle/end
│       └── pve/
│           ├── create/route.ts     # POST /api/pve/create
│           └── end/route.ts        # POST /api/pve/end
├── components/
│   └── CharacterCard.tsx           # Shareable character card UI
├── lib/
│   ├── supabase-client.ts          # Singleton Supabase client
│   ├── types.ts                    # Shared types, tier definitions, getTierStyle
│   ├── scorer.ts                   # Scoring logic
│   ├── battle.ts                   # Damage formula, realm skills, gold calc
│   ├── boss.ts                     # 15 boss definitions + AI targeting logic
│   └── projectiles.ts              # Projectile types, factories, hit detection
└── .env.local                      # Local environment variables (not committed)
```

---

## Tech stack

| Layer      | Tech |
|------------|------|
| Framework  | Next.js 16, React, TypeScript |
| Auth       | Supabase Auth (email/password) |
| Database   | Supabase Postgres |
| Realtime   | Supabase Realtime (broadcast + presence) |
| OG images  | @vercel/og (edge runtime) |
| Deployment | Vercel |

---

## Local setup

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

Create a `.env.local` file with your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

---

## Database schema

```sql
-- characters
id, user_id (unique), name, realms (jsonb), total_power,
gold (default 1000), stats_hp, stats_attack, stats_defence, updated_at

-- battles (PvP)
id, player1_id, player2_id, winner_id, gold_transferred, created_at

-- pve_battles
id, leader_id, boss_tier, success, surviving_player_ids, created_at
```

---

## Gameplay

### World map
- WASD to move your character around the 1800px wide map
- 15 tier zones, left (Apprentice) to right (Legend)
- Your character spawns in your tier zone
- Click another player to challenge them (same tier only)
- Walk into a boss lair (right edge of each zone) to start a raid

### PvP battles
- Distribute stat points before entering (HP / Attack / Defence)
- WASD to move around the arena, dodge incoming projectiles
- Right-click to Strike (melee range + line of sight required)
- Space to Brace (30% damage reduction for 1 second)
- Q to use your realm skill (4 second cooldown)
- Winner takes 20% of loser's gold

### Realm skills (PvP + PvE)
| Realm    | Skill           | Effect |
|----------|-----------------|--------|
| Academia | Deep Research   | Reduce opponent/boss defence by 25% for 5 seconds |
| Tech     | Commit Storm    | Deal 1.8× attack damage |
| Medicine | Clinical Mastery| Heal 20% of max HP (click teammate HP bar to target in PvE) |
| Creative | Viral Work      | Deal 1.2× damage + 30% stun chance |
| Law      | Precedent       | Reduce opponent/boss attack by 20% for 3 seconds |

### PvE boss raids
- Up to 3 players of the same tier can party up
- Party leader enters the lair → other same-tier players on the map receive an invite
- All players go through a stat prep screen before the arena
- 3 second grace period on battle start
- Boss chases the nearest alive player and attacks in melee range
- Boss uses a realm-specific special skill every few seconds
- Only surviving players receive gold on victory
- Leader client runs boss AI and broadcasts actions to the party

### Projectile system
All attacks are physical projectiles — not instant damage. Players can dodge by moving out of the projectile's path. Each realm has a distinct projectile type (sword arc, lightning bolt, paint splash, heal pulse, etc.) travelling at 250px/s.

---

## Key technical notes

**Supabase singleton client** — the Supabase client must be created once and stored in a ref. Recreating it on re-render kills the WebSocket connection and breaks presence.

**Broadcast echo** — Supabase broadcast does not echo events back to the sender. Any state that needs to reflect locally and sync to others must be applied locally first, then broadcast.

**Leader-as-referee** — in PvE, the party leader runs boss AI and broadcasts boss actions. Non-leader clients apply those actions locally. This avoids the need for a server-side game loop.

**Channel cleanup** — use `supabase.removeChannel()` on unmount, not `channel.unsubscribe()`. `removeChannel` fully tears down the channel; `unsubscribe` leaves it registered and causes duplicate channel bugs on re-entry.

---
