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
        table.add_column("Power", justify="right", width=8)
        table.add_column("Tier", width=14)
        table.add_column("h", justify="right", width=5)
        table.add_column("Citations", justify="right", width=10)
        table.add_column("Abilities", width=30)

        tier_styles = {
            "Novice": "dim white", "Adept": "green", "Expert": "blue",
            "Master": "magenta", "Grandmaster": "yellow", "Legend": "bold red",
        }

        for i, (creds, score) in enumerate(results, 1):
            ab_str = "  ".join(a["icon"] for a in score.abilities) or "—"
            style = tier_styles.get(score.tier, "white")
            table.add_row(
                str(i),
                creds.name,
                f"[{style}]{score.power_level:,}[/{style}]",
                f"[{style}]{score.tier}[/{style}]",
                str(creds.h_index),
                f"{creds.total_citations:,}",
                ab_str,
            )
        console.print(table)
    else:
        print(f"\n{'Rank':<5} {'Name':<26} {'Power':>7}  {'Tier':<14}  {'h':>4}  {'Cites':>8}")
        print("─" * 75)
        for i, (creds, score) in enumerate(results, 1):
            ab_str = " ".join(a["icon"] for a in score.abilities) or "—"
            print(f"{i:<5} {creds.name:<26} {score.power_level:>7,}  {score.tier:<14}  {creds.h_index:>4}  {creds.total_citations:>8,}  {ab_str}")

    print()

if __name__ == "__main__":
    main()
