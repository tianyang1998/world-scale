# World Scale
### Real-world credentials, turned into a fantasy character

Your professional achievements — citations, GitHub stars, publications — are translated into a character level in a shared fantasy world. No invented stats. Your power comes from who you actually are.

---

## Project structure

```
WS/
├── ws_engine.py       # Phase 1: CLI scorer (Python)
├── batch_score.py     # Phase 1: batch leaderboard (Python)
├── seed_cohort.json   # reference cohort for percentile ranking
├── README.md
└── web/               # Phase 2: Next.js web app
    ├── app/
    │   ├── page.tsx               # home page — input form + character card
    │   ├── layout.tsx
    │   └── api/
    │       ├── score/route.ts     # POST /api/score — scoring API
    │       └── og/route.tsx       # GET /api/og — shareable card image
    ├── components/
    │   └── CharacterCard.tsx      # character card UI component
    ├── lib/
    │   ├── scorer.ts              # scoring logic (TypeScript)
    │   └── types.ts               # shared types and tier definitions
    └── .env.local                 # local environment variables (not committed)
```

---

## Phase 1 — CLI scorer (Python)

### Setup
```bash
pip install scholarly rich
```

### Usage
```bash
# interactive mode
python ws_engine.py

# fetch from Google Scholar by name
python ws_engine.py --scholar "Yann LeCun"

# fetch by Scholar profile URL
python ws_engine.py --scholar "https://scholar.google.com/citations?user=JicYPdAAAAAJ"

# enter stats manually (works offline)
python ws_engine.py --manual

# output raw JSON
python ws_engine.py --manual --json

# score all seed profiles — leaderboard view
python batch_score.py
```

---

## Phase 2 — Web app (Next.js)

### Setup
```bash
cd web
npm install
```

### Optional: GitHub token (raises API rate limit from 60 to 5000 req/hr)
Create a token at github.com/settings/tokens (no scopes needed — public data only), then add to `web/.env.local`:
```
GITHUB_TOKEN=your_token_here
```

### Run locally
```bash
cd web
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

### Features
- **Academia realm** — enter h-index, citations, publications, i10-index
- **Tech realm** — enter a GitHub username to fetch live public stats, or enter manually
- **Character card** — displays tier, power, stat bars, and unlocked abilities
- **Shareable OG image** — click "Copy shareable link" to get a 1200×630 card image for Twitter / LinkedIn

---

## How scoring works

All dimensions are percentile-ranked within the user's realm cohort, so a top surgeon and a top engineer score comparably if both are equally elite in their fields.

| Dimension   | Weight | Academia source                  | Tech source              |
|-------------|--------|----------------------------------|--------------------------|
| Expertise   | 20%    | Years active (log curve)         | Years on GitHub          |
| Prestige    | 25%    | Total citations + institution    | Followers                |
| Impact      | 30%    | H-index + citation recency       | Total stars              |
| Credentials | 15%    | Publication count                | Public repos             |
| Network     | 10%    | i10-index                        | Estimated commits        |

Final power = composite score × 120, range 0–12,000.

### The 15 levels

| Level       | Power Range   | Group       |
|-------------|---------------|-------------|
| Apprentice  | 0–799         | Beginner    |
| Initiate    | 800–1,599     | Beginner    |
| Acolyte     | 1,600–2,399   | Developing  |
| Journeyman  | 2,400–3,199   | Developing  |
| Adept       | 3,200–3,999   | Developing  |
| Scholar     | 4,000–4,799   | Established |
| Sage        | 4,800–5,599   | Established |
| Arcanist    | 5,600–6,399   | Established |
| Exemplar    | 6,400–7,199   | Elite       |
| Vanguard    | 7,200–7,999   | Elite       |
| Master      | 8,000–8,799   | Top         |
| Grandmaster | 8,800–9,599   | Top         |
| Champion    | 9,600–10,399  | Top         |
| Paragon     | 10,400–11,199 | Top         |
| Legend      | 11,200+       | Top         |

---

## Next steps (Phase 3)

- [ ] User accounts — sign in and save your character
- [ ] Persistent leaderboard
- [ ] World map — characters placed by power level
- [ ] More realms: Finance, Medicine, Creative, Law
