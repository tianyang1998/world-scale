"""
RealWorld RPG — Phase 1 Scoring Spike
Academia Realm · Local runner

Usage:
  python score.py                          # interactive prompts
  python score.py --scholar "Name Here"   # fetch live from Google Scholar
  python score.py --manual                # enter stats by hand (always works)
"""

import argparse
import math
import json
import sys
from dataclasses import dataclass, asdict
from typing import Optional

# ── rich for pretty output (graceful fallback if not installed) ──────────────
try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.table import Table
    from rich.text import Text
    from rich import box
    console = Console()
    RICH = True
except ImportError:
    RICH = False
    class Console:
        def print(self, *a, **kw): print(*a)
    console = Console()


# ═══════════════════════════════════════════════════════════════════════════════
#  DATA MODEL
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class AcademiaCredentials:
    name: str
    h_index: int
    total_citations: int
    years_active: int
    pub_count: int
    i10_index: int = 0          # papers with 10+ citations
    recent_citations: int = 0   # citations in last 5 years
    institution_tier: int = 2   # 1=top-10, 2=top-100, 3=other
    fields: list = None

    def __post_init__(self):
        if self.fields is None:
            self.fields = []


@dataclass
class ScoreBreakdown:
    expertise: float       # 0–100 (experience depth)
    prestige: float        # 0–100 (recognition + citations)
    impact: float          # 0–100 (h-index + reach)
    credentials: float     # 0–100 (publication quality)
    network: float         # 0–100 (i10, collaboration signals)
    raw_score: float       # 0–100 weighted composite
    power_level: int       # 0–12000 final number
    tier: str
    tier_color: str
    abilities: list


# ═══════════════════════════════════════════════════════════════════════════════
#  SCORING ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

WEIGHTS = {
    "expertise":   0.20,
    "prestige":    0.25,
    "impact":      0.30,
    "credentials": 0.15,
    "network":     0.10,
}

TIERS = [
    (0,    2000,  "Novice",       "dim white"),
    (2000, 4000,  "Adept",        "green"),
    (4000, 6000,  "Expert",       "blue"),
    (6000, 8000,  "Master",       "magenta"),
    (8000, 10000, "Grandmaster",  "yellow"),
    (10000,99999, "Legend",       "bold red"),
]

# Reference distributions for Academia (used for percentile estimation).
# Based on approximate real-world distributions of active researchers.
COHORT = {
    "h_index":    {"p25": 4,  "p50": 9,  "p75": 18, "p90": 32, "p99": 60},
    "citations":  {"p25": 80, "p50": 400, "p75": 1500, "p90": 5000, "p99": 25000},
    "years":      {"p25": 3,  "p50": 8,  "p75": 16, "p90": 25, "p99": 40},
    "pubs":       {"p25": 5,  "p50": 20, "p75": 60, "p90": 120, "p99": 400},
    "i10":        {"p25": 2,  "p50": 8,  "p75": 25, "p90": 60,  "p99": 200},
}


def percentile_score(value: float, dist: dict) -> float:
    """Map a raw value to 0–100 using cohort percentile breakpoints."""
    breakpoints = [
        (0,          0),
        (dist["p25"], 25),
        (dist["p50"], 50),
        (dist["p75"], 75),
        (dist["p90"], 90),
        (dist["p99"], 99),
        (dist["p99"] * 3, 100),
    ]
    for i in range(1, len(breakpoints)):
        lo_val, lo_pct = breakpoints[i - 1]
        hi_val, hi_pct = breakpoints[i]
        if value <= hi_val:
            if hi_val == lo_val:
                return lo_pct
            t = (value - lo_val) / (hi_val - lo_val)
            return lo_pct + t * (hi_pct - lo_pct)
    return 100.0


def log_years(years: int) -> float:
    """Logarithmic experience curve — diminishing returns after ~15 years."""
    return min(math.log(years + 1) / math.log(42), 1.0) * 100


def score_credentials(creds: AcademiaCredentials) -> ScoreBreakdown:
    # ── Expertise (experience depth) ─────────────────────────────────────────
    expertise = log_years(creds.years_active)

    # ── Prestige (citations + institution) ───────────────────────────────────
    cite_pct = percentile_score(creds.total_citations, COHORT["citations"])
    institution_bonus = {1: 15, 2: 5, 3: 0}.get(creds.institution_tier, 0)
    prestige = min(cite_pct + institution_bonus, 100)

    # ── Impact (h-index — the gold standard in academia) ─────────────────────
    h_pct = percentile_score(creds.h_index, COHORT["h_index"])
    # Boost for recent citations (shows still active, not just legacy)
    recency_boost = 0
    if creds.total_citations > 0:
        recency_ratio = creds.recent_citations / creds.total_citations
        recency_boost = min(recency_ratio * 10, 10)
    impact = min(h_pct + recency_boost, 100)

    # ── Credentials (publication depth) ──────────────────────────────────────
    pub_pct = percentile_score(creds.pub_count, COHORT["pubs"])
    credentials = pub_pct

    # ── Network (i10 index as proxy for broad collaboration reach) ───────────
    i10_pct = percentile_score(creds.i10_index, COHORT["i10"])
    network = i10_pct

    # ── Composite raw score (0–100) ───────────────────────────────────────────
    raw = (
        expertise   * WEIGHTS["expertise"]   +
        prestige    * WEIGHTS["prestige"]    +
        impact      * WEIGHTS["impact"]      +
        credentials * WEIGHTS["credentials"] +
        network     * WEIGHTS["network"]
    )

    # ── Map to 0–12000 power scale ────────────────────────────────────────────
    power = round(raw * 120)

    # ── Tier ─────────────────────────────────────────────────────────────────
    tier, tier_color = "Novice", "dim white"
    for lo, hi, name, color in TIERS:
        if lo <= power < hi:
            tier, tier_color = name, color
            break

    # ── Ability unlocks ───────────────────────────────────────────────────────
    abilities = derive_abilities(expertise, prestige, impact, credentials, network, power)

    return ScoreBreakdown(
        expertise=round(expertise, 1),
        prestige=round(prestige, 1),
        impact=round(impact, 1),
        credentials=round(credentials, 1),
        network=round(network, 1),
        raw_score=round(raw, 2),
        power_level=power,
        tier=tier,
        tier_color=tier_color,
        abilities=abilities,
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  ABILITY SYSTEM
# ═══════════════════════════════════════════════════════════════════════════════

ALL_ABILITIES = [
    {
        "id": "deep_research",
        "name": "Deep Research",
        "icon": "📖",
        "desc": "Decode any hidden text or map in half the time.",
        "condition": lambda e, pr, im, cr, ne, pw: im >= 40,
        "unlock_hint": "Impact ≥ 40",
    },
    {
        "id": "knowledge_burst",
        "name": "Knowledge Burst",
        "icon": "💥",
        "desc": "Overwhelm opponents with a wave of information.",
        "condition": lambda e, pr, im, cr, ne, pw: cr >= 50,
        "unlock_hint": "Credentials ≥ 50",
    },
    {
        "id": "peer_review",
        "name": "Peer Review",
        "icon": "🔍",
        "desc": "Expose any weakness in an opponent's argument.",
        "condition": lambda e, pr, im, cr, ne, pw: ne >= 40 and pr >= 50,
        "unlock_hint": "Network ≥ 40 & Prestige ≥ 50",
    },
    {
        "id": "tenure_shield",
        "name": "Tenure Shield",
        "icon": "🛡️",
        "desc": "Immune to realm eviction. Permanent standing.",
        "condition": lambda e, pr, im, cr, ne, pw: pr >= 75 and e >= 60,
        "unlock_hint": "Prestige ≥ 75 & Expertise ≥ 60",
    },
    {
        "id": "citation_wave",
        "name": "Citation Wave",
        "icon": "🌊",
        "desc": "Passive aura — nearby allies gain +10% to all checks.",
        "condition": lambda e, pr, im, cr, ne, pw: im >= 85 and pw >= 8000,
        "unlock_hint": "Impact ≥ 85 & Grandmaster tier",
    },
    {
        "id": "grand_lecture",
        "name": "Grand Lecture",
        "icon": "🎓",
        "desc": "Rally up to 20 allies and grant temporary power boosts.",
        "condition": lambda e, pr, im, cr, ne, pw: pr >= 90 and ne >= 70,
        "unlock_hint": "Prestige ≥ 90 & Network ≥ 70 (Legend only)",
    },
]


def derive_abilities(expertise, prestige, impact, credentials, network, power):
    unlocked = []
    for ability in ALL_ABILITIES:
        if ability["condition"](expertise, prestige, impact, credentials, network, power):
            unlocked.append({"name": ability["name"], "icon": ability["icon"], "desc": ability["desc"]})
    return unlocked


# ═══════════════════════════════════════════════════════════════════════════════
#  DATA FETCHERS
# ═══════════════════════════════════════════════════════════════════════════════

def fetch_from_scholar(query: str) -> Optional[AcademiaCredentials]:
    """Fetch a researcher's stats from Google Scholar by name or profile URL."""
    try:
        from scholarly import scholarly as sc
        console.print(f"\n[dim]Searching Google Scholar for '{query}'...[/dim]" if RICH else f"\nSearching Google Scholar for '{query}'...")

        # If it looks like a URL, extract the user ID
        if "scholar.google" in query and "user=" in query:
            user_id = query.split("user=")[1].split("&")[0]
            author = sc.search_author_id(user_id)
        else:
            results = sc.search_author(query)
            author = next(results)

        sc.fill(author, sections=["basics", "indices", "counts"])

        name = author.get("name", "Unknown")
        h_index = author.get("hindex", 0) or 0
        citations = author.get("citedby", 0) or 0
        i10 = author.get("i10index", 0) or 0
        recent_citations = author.get("citedby5y", 0) or 0
        pubs = len(author.get("publications", [])) or 0
        affiliation = author.get("affiliation", "")

        # Estimate years active from first publication year if available
        years_active = 10  # safe default
        if author.get("publications"):
            years = []
            for p in author["publications"][:20]:
                bib = p.get("bib", {})
                yr = bib.get("pub_year")
                if yr and str(yr).isdigit():
                    years.append(int(yr))
            if years:
                import datetime
                years_active = datetime.datetime.now().year - min(years)

        # Rough institution tier from affiliation string
        top10 = ["mit", "stanford", "harvard", "oxford", "cambridge", "caltech", "princeton", "chicago", "yale", "columbia"]
        top100 = ["berkeley", "ucla", "michigan", "toronto", "eth", "imperial", "ucl", "edinburgh", "manchester"]
        aff_lower = affiliation.lower()
        if any(t in aff_lower for t in top10):
            institution_tier = 1
        elif any(t in aff_lower for t in top100):
            institution_tier = 2
        else:
            institution_tier = 3

        return AcademiaCredentials(
            name=name,
            h_index=h_index,
            total_citations=citations,
            years_active=max(years_active, 1),
            pub_count=pubs,
            i10_index=i10,
            recent_citations=recent_citations,
            institution_tier=institution_tier,
        )

    except Exception as e:
        console.print(f"\n[yellow]Could not fetch from Google Scholar: {e}[/yellow]\n" if RICH
                      else f"\nCould not fetch from Google Scholar: {e}\n")
        return None


def prompt_manual() -> AcademiaCredentials:
    """Interactive prompts to enter credentials manually."""
    print("\n── Enter researcher credentials manually ──\n")

    def ask(prompt, default, cast=int):
        raw = input(f"  {prompt} [{default}]: ").strip()
        if not raw:
            return default
        try:
            return cast(raw)
        except ValueError:
            return default

    name = input("  Researcher name: ").strip() or "Anonymous"
    h_index = ask("H-index", 10)
    citations = ask("Total citations", 500)
    years = ask("Years active in research", 8)
    pubs = ask("Total publications", 25)
    i10 = ask("i10-index (papers with 10+ citations)", 8)
    recent = ask("Citations in last 5 years", 200)

    print("\n  Institution tier:")
    print("    1 = Top-10 global (MIT, Stanford, Oxford...)")
    print("    2 = Top-100 global")
    print("    3 = Other")
    tier = ask("Tier (1/2/3)", 3)

    return AcademiaCredentials(
        name=name,
        h_index=h_index,
        total_citations=citations,
        years_active=years,
        pub_count=pubs,
        i10_index=i10,
        recent_citations=recent,
        institution_tier=max(1, min(3, tier)),
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  OUTPUT RENDERER
# ═══════════════════════════════════════════════════════════════════════════════

BAR_FULL = "█"
BAR_EMPTY = "░"
BAR_WIDTH = 20

def make_bar(value: float, color: str = "white") -> str:
    filled = round(value / 100 * BAR_WIDTH)
    bar = BAR_FULL * filled + BAR_EMPTY * (BAR_WIDTH - filled)
    if RICH:
        return f"[{color}]{bar}[/{color}]"
    return bar


def render_rich(creds: AcademiaCredentials, result: ScoreBreakdown):
    console.print()

    # ── Header panel ─────────────────────────────────────────────────────────
    initials = "".join(w[0] for w in creds.name.split() if w)[:2].upper()
    header = Text()
    header.append(f"  {initials}  ", style="bold white on blue")
    header.append(f"  {creds.name}\n", style="bold")
    header.append(f"     Academia Realm  ·  {creds.years_active} years active\n", style="dim")
    header.append(f"\n     POWER LEVEL  ", style="dim")
    header.append(f"{result.power_level:,}", style=f"bold {result.tier_color}")
    header.append(f"   [{result.tier}]", style=result.tier_color)
    console.print(Panel(header, border_style="blue", padding=(0, 1)))

    # ── Stats table ───────────────────────────────────────────────────────────
    table = Table(box=box.SIMPLE, show_header=False, padding=(0, 1))
    table.add_column("Dimension", style="dim", width=14)
    table.add_column("Bar", width=24)
    table.add_column("Score", justify="right", width=6)

    stat_colors = {
        "Expertise":   "blue",
        "Prestige":    "magenta",
        "Impact":      "red",
        "Credentials": "green",
        "Network":     "yellow",
    }
    stats = [
        ("Expertise",   result.expertise,   f"⚡ {creds.years_active} yrs"),
        ("Prestige",    result.prestige,    f"🌟 {creds.total_citations:,} cites"),
        ("Impact",      result.impact,      f"🔥 h={creds.h_index}"),
        ("Credentials", result.credentials, f"📜 {creds.pub_count} pubs"),
        ("Network",     result.network,     f"🕸  i10={creds.i10_index}"),
    ]

    for label, val, hint in stats:
        color = stat_colors[label]
        bar_str = make_bar(val, color)
        table.add_row(
            f"[dim]{label}[/dim]",
            bar_str + f"  [dim]{hint}[/dim]",
            f"[{color}]{val:.0f}[/{color}]",
        )

    console.print(table)

    # ── Abilities ─────────────────────────────────────────────────────────────
    if result.abilities:
        console.print("  [bold]Abilities unlocked[/bold]")
        for ab in result.abilities:
            console.print(f"    {ab['icon']}  [bold]{ab['name']}[/bold]  [dim]{ab['desc']}[/dim]")
    else:
        console.print("  [dim]No abilities unlocked yet. Grow your credentials to unlock powers.[/dim]")

    # ── Next unlock hint ──────────────────────────────────────────────────────
    unlocked_ids = {a["name"] for a in result.abilities}
    for ab in ALL_ABILITIES:
        if ab["name"] not in unlocked_ids:
            console.print(f"\n  [dim]Next ability → [/dim][bold]{ab['icon']} {ab['name']}[/bold][dim]   Requires: {ab['unlock_hint']}[/dim]")
            break

    console.print()


def render_plain(creds: AcademiaCredentials, result: ScoreBreakdown):
    print("\n" + "═" * 50)
    print(f"  {creds.name}  ·  Academia Realm")
    print(f"  POWER LEVEL: {result.power_level:,}  [{result.tier}]")
    print("═" * 50)
    stats = [
        ("Expertise",   result.expertise),
        ("Prestige",    result.prestige),
        ("Impact",      result.impact),
        ("Credentials", result.credentials),
        ("Network",     result.network),
    ]
    for label, val in stats:
        bar = make_bar(val)
        print(f"  {label:<12}  {bar}  {val:.0f}")
    if result.abilities:
        print("\n  Abilities unlocked:")
        for ab in result.abilities:
            print(f"    {ab['icon']} {ab['name']} — {ab['desc']}")
    print()


def render_json(creds: AcademiaCredentials, result: ScoreBreakdown):
    out = {
        "character": asdict(creds),
        "score": asdict(result),
    }
    print(json.dumps(out, indent=2))


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="RealWorld RPG — Academia Realm Scorer",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python score.py                              # interactive mode
  python score.py --scholar "Geoffrey Hinton" # fetch from Google Scholar
  python score.py --scholar "https://scholar.google.com/citations?user=JicYPdAAAAAJ"
  python score.py --manual                    # enter stats manually
  python score.py --manual --json             # output raw JSON
        """
    )
    parser.add_argument("--scholar", metavar="NAME_OR_URL",
                        help="Researcher name or Scholar profile URL to fetch")
    parser.add_argument("--manual", action="store_true",
                        help="Enter credentials manually (always works, no network needed)")
    parser.add_argument("--json", action="store_true",
                        help="Output raw JSON instead of pretty display")

    args = parser.parse_args()

    # ── Determine input mode ──────────────────────────────────────────────────
    creds = None

    if args.scholar:
        creds = fetch_from_scholar(args.scholar)
        if creds is None:
            console.print("[yellow]Falling back to manual input.[/yellow]\n" if RICH
                          else "Falling back to manual input.\n")
            creds = prompt_manual()

    elif args.manual:
        creds = prompt_manual()

    else:
        # Interactive: try Scholar first, offer manual fallback
        if RICH:
            console.print("\n[bold]RealWorld RPG — Academia Realm Scorer[/bold]")
            console.print("[dim]Phase 1 · Local Spike[/dim]\n")
        else:
            print("\nRealWorld RPG — Academia Realm Scorer")
            print("Phase 1 · Local Spike\n")

        choice = input("  Fetch from Google Scholar (s) or enter manually (m)? [m]: ").strip().lower()
        if choice == "s":
            query = input("  Name or Scholar profile URL: ").strip()
            creds = fetch_from_scholar(query)
            if creds is None:
                print("  Switching to manual input.\n")
                creds = prompt_manual()
        else:
            creds = prompt_manual()

    # ── Score ─────────────────────────────────────────────────────────────────
    result = score_credentials(creds)

    # ── Render ────────────────────────────────────────────────────────────────
    if args.json:
        render_json(creds, result)
    elif RICH:
        render_rich(creds, result)
    else:
        render_plain(creds, result)


if __name__ == "__main__":
    main()
