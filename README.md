# World Scale — Phase 1 Scoring Spike
### Academia Realm · Local Runner

Turn a researcher's real credentials into a fantasy character level.

---

## Setup

```bash
# 1. Install dependencies
pip install scholarly rich

# 2. Run it
python ws_engine.py
```

---

## Usage

### Interactive mode (recommended to start)
```bash
python ws_engine.py
```
Choose `s` to fetch from Google Scholar, or `m` to enter manually.

### Fetch from Google Scholar by name
```bash
python ws_engine.py --scholar "Yann LeCun"
python ws_engine.py --scholar "Geoffrey Hinton"
```

### Fetch by Scholar profile URL
```bash
python ws_engine.py --scholar "https://scholar.google.com/citations?user=JicYPdAAAAAJ"
```

### Enter stats manually (works 100% offline)
```bash
python ws_engine.py --manual
```

### Output raw JSON (useful for piping or saving)
```bash
python ws_engine.py --manual --json
python ws_engine.py --manual --json > my_character.json
```

### Score the entire seed cohort (leaderboard view)
```bash
python batch_score.py
```

---

## How scoring works

| Dimension   | Weight | Source                              |
|-------------|--------|-------------------------------------|
| Expertise   | 20%    | Years active (logarithmic curve)    |
| Prestige    | 25%    | Total citations + institution tier  |
| Impact      | 30%    | H-index + recency of citations      |
| Credentials | 15%    | Publication count                   |
| Network     | 10%    | i10-index (collaboration breadth)   |

All dimensions are **percentile-ranked against a reference cohort** of researchers,
so the score reflects where you stand relative to your peers — not raw numbers.

Final power score = composite × 120, range 0–12,000. The level name is the primary
identity shown to the user; the raw number is displayed as a secondary detail.

### The 15 levels

| Level       | Power Range  | Group       |
|-------------|--------------|-------------|
| Apprentice  | 0–799        | Beginner    |
| Initiate    | 800–1,599    | Beginner    |
| Acolyte     | 1,600–2,399  | Developing  |
| Journeyman  | 2,400–3,199  | Developing  |
| Adept       | 3,200–3,999  | Developing  |
| Scholar     | 4,000–4,799  | Established |
| Sage        | 4,800–5,599  | Established |
| Arcanist    | 5,600–6,399  | Established |
| Exemplar    | 6,400–7,199  | Elite       |
| Vanguard    | 7,200–7,999  | Elite       |
| Master      | 8,000–8,799  | Top         |
| Grandmaster | 8,800–9,599  | Top         |
| Champion    | 9,600–10,399 | Top         |
| Paragon     | 10,400–11,199| Top         |
| Legend      | 11,200+      | Top         |

---

## Files

```
WS/
├── ws_engine.py       # main scorer — run this
├── batch_score.py     # score all seed profiles at once (leaderboard)
├── seed_cohort.json   # 10 reference profiles for percentile calibration
└── README.md          # this file
```

---

## Next steps (Phase 2)

- [ ] Wrap in a Next.js API route (`POST /api/score`)
- [ ] Build character card UI
- [ ] Add OG image generation for sharing
- [ ] Add GitHub OAuth for Tech realm scoring
