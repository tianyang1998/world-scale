# RealWorld RPG — Phase 1 Scoring Spike
### Academia Realm · Local Runner

Turn a researcher's real credentials into a fantasy power level.

---

## Setup

```bash
# 1. Install dependencies
pip install scholarly rich

# 2. Run it
python score.py
```

---

## Usage

### Interactive mode (recommended to start)
```bash
python score.py
```
Choose `s` to fetch from Google Scholar, or `m` to enter manually.

### Fetch from Google Scholar by name
```bash
python score.py --scholar "Yann LeCun"
python score.py --scholar "Geoffrey Hinton"
```

### Fetch by Scholar profile URL
```bash
python score.py --scholar "https://scholar.google.com/citations?user=JicYPdAAAAAJ"
```

### Enter stats manually (works 100% offline)
```bash
python score.py --manual
```

### Output raw JSON (useful for piping or saving)
```bash
python score.py --manual --json
python score.py --manual --json > my_character.json
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

Final power level = composite score × 120, rounded to nearest integer. Range: 0–12,000.

### Tiers
| Tier        | Power Range |
|-------------|-------------|
| Novice      | 0–1,999     |
| Adept       | 2,000–3,999 |
| Expert      | 4,000–5,999 |
| Master      | 6,000–7,999 |
| Grandmaster | 8,000–9,999 |
| Legend      | 10,000+     |

---

## Files

```
realworld_rpg/
├── score.py           # main scorer — run this
├── batch_score.py     # score all seed profiles at once (leaderboard)
├── seed_cohort.json   # 10 reference profiles for percentile calibration
└── README.md          # this file
```

---

## Next steps (Phase 2)

- [ ] Wrap in a Next.js API route (`POST /api/score`)
- [ ] Build character card UI
- [ ] Add OG image generation for sharing
- [ ] Add GitHub OAuth for tech realm scoring
