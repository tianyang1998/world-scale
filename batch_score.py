"""
RealWorld RPG — Batch scorer
Scores all profiles in seed_cohort.json and prints a leaderboard.
Usage: python batch_score.py
"""

import json
from pathlib import Path
from ws_engine import AcademiaCredentials, score_credentials

try:
    from rich.console import Console
    from rich.table import Table
    from rich import box
    console = Console()
    RICH = True
except ImportError:
    RICH = False

def main():
    cohort_path = Path(__file__).parent / "seed_cohort.json"
    profiles = json.loads(cohort_path.read_text())

    results = []
    for p in profiles:
        creds = AcademiaCredentials(**p)
        score = score_credentials(creds)
        results.append((creds, score))

    results.sort(key=lambda x: x[1].power_level, reverse=True)

    if RICH:
        table = Table(title="\nAcademia Realm — Seed Leaderboard", box=box.SIMPLE_HEAD)
        table.add_column("Rank", justify="right", style="dim", width=5)
        table.add_column("Name", width=26)
        table.add_column("Level", width=14)
        table.add_column("Power", justify="right", style="dim", width=8)
        table.add_column("h", justify="right", width=5)
        table.add_column("Citations", justify="right", width=10)
        table.add_column("Abilities", width=30)

        tier_styles = {
            "Apprentice": "dim white", "Initiate": "dim white",
            "Acolyte": "green",        "Journeyman": "green",    "Adept": "green",
            "Scholar": "blue",         "Sage": "blue",            "Arcanist": "blue",
            "Exemplar": "magenta",     "Vanguard": "magenta",
            "Master": "yellow",        "Grandmaster": "yellow",
            "Champion": "bold yellow", "Paragon": "bold red",     "Legend": "bold red",
        }

        for i, (creds, score) in enumerate(results, 1):
            ab_str = "  ".join(a["icon"] for a in score.abilities) or "—"
            style = tier_styles.get(score.tier, "white")
            table.add_row(
                str(i),
                creds.name,
                f"[{style}]{score.tier}[/{style}]",
                f"{score.power_level:,}",
                str(creds.h_index),
                f"{creds.total_citations:,}",
                ab_str,
            )
        console.print(table)
    else:
        print(f"\n{'Rank':<5} {'Name':<26} {'Level':<14}  {'Power':>7}  {'h':>4}  {'Cites':>8}")
        print("─" * 75)
        for i, (creds, score) in enumerate(results, 1):
            ab_str = " ".join(a["icon"] for a in score.abilities) or "—"
            print(f"{i:<5} {creds.name:<26} {score.tier:<14}  {score.power_level:>7,}  {creds.h_index:>4}  {creds.total_citations:>8,}  {ab_str}")

    print()

if __name__ == "__main__":
    main()
