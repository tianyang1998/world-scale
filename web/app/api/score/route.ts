import { NextRequest, NextResponse } from "next/server";
import { scoreAcademia, scoreTech, scoreMedicine, scoreCreative, scoreLaw } from "@/lib/scorer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { realm } = body;

    if (realm === "academia") {
      const score = scoreAcademia({
        name:             body.name             || "Unknown",
        h_index:          Number(body.h_index)          || 0,
        total_citations:  Number(body.total_citations)  || 0,
        years_active:     Number(body.years_active)     || 1,
        pub_count:        Number(body.pub_count)        || 0,
        i10_index:        Number(body.i10_index)        || 0,
        recent_citations: Number(body.recent_citations) || 0,
        institution_tier: Number(body.institution_tier) || 3,
      });
      return NextResponse.json(score);
    }

    if (realm === "tech") {
      if (body.github_username) {
        const ghData = await fetchGitHub(body.github_username);
        if (!ghData.ok) {
          return NextResponse.json({ error: ghData.error }, { status: 400 });
        }
        const score = scoreTech(ghData.data!);
        return NextResponse.json(score);
      }

      const score = scoreTech({
        name:         body.name         || "Unknown",
        repos:        Number(body.repos)        || 0,
        stars:        Number(body.stars)        || 0,
        followers:    Number(body.followers)    || 0,
        commits:      Number(body.commits)      || 0,
        years_active: Number(body.years_active) || 1,
      });
      return NextResponse.json(score);
    }

    if (realm === "medicine") {
      const score = scoreMedicine({
        name:                body.name                || "Unknown",
        years_active:        Number(body.years_active)        || 1,
        papers:              Number(body.papers)              || 0,
        citations:           Number(body.citations)           || 0,
        patients_treated:    Number(body.patients_treated)    || 0,
        specialization_tier: Number(body.specialization_tier) || 3,
        hospital_tier:       Number(body.hospital_tier)       || 3,
        board_certifications: Number(body.board_certifications) || 0,
      });
      return NextResponse.json(score);
    }

    if (realm === "creative") {
      const score = scoreCreative({
        name:                    body.name                    || "Unknown",
        years_active:            Number(body.years_active)            || 1,
        major_works:             Number(body.major_works)             || 0,
        awards:                  Number(body.awards)                  || 0,
        audience_size:           Number(body.audience_size)           || 0,
        exhibitions_or_releases: Number(body.exhibitions_or_releases) || 0,
      });
      return NextResponse.json(score);
    }

    if (realm === "law") {
      const score = scoreLaw({
        name:                body.name                || "Unknown",
        years_active:        Number(body.years_active)        || 1,
        notable_cases:       Number(body.notable_cases)       || 0,
        cases_won:           Number(body.cases_won)           || 0,
        bar_admissions:      Number(body.bar_admissions)      || 1,
        firm_tier:           Number(body.firm_tier)           || 3,
        specialization_tier: Number(body.specialization_tier) || 2,
      });
      return NextResponse.json(score);
    }

    return NextResponse.json(
      { error: "realm must be 'academia', 'tech', 'medicine', 'creative', or 'law'" },
      { status: 400 }
    );

  } catch (err) {
    console.error("/api/score error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── GitHub data fetcher ───────────────────────────────────────────────────────
async function fetchGitHub(username: string): Promise<
  { ok: true; data: { name: string; repos: number; stars: number; followers: number; commits: number; years_active: number } } |
  { ok: false; error: string }
> {
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const userRes = await fetch(`https://api.github.com/users/${username}`, { headers });
  if (!userRes.ok) {
    if (userRes.status === 404) return { ok: false, error: `GitHub user '${username}' not found` };
    return { ok: false, error: `GitHub API error: ${userRes.status}` };
  }
  const user = await userRes.json();

  const reposRes = await fetch(
    `https://api.github.com/users/${username}/repos?per_page=100&sort=pushed`,
    { headers }
  );
  const repos = reposRes.ok ? await reposRes.json() : [];
  const totalStars = Array.isArray(repos)
    ? repos.reduce((sum: number, r: { stargazers_count: number }) => sum + (r.stargazers_count || 0), 0)
    : 0;

  const createdYear = new Date(user.created_at).getFullYear();
  const years_active = new Date().getFullYear() - createdYear || 1;

  const eventsRes = await fetch(
    `https://api.github.com/users/${username}/events/public?per_page=100`,
    { headers }
  );
  const events = eventsRes.ok ? await eventsRes.json() : [];
  const recentCommits = Array.isArray(events)
    ? events.filter((e: { type: string }) => e.type === "PushEvent").length * 10
    : 0;
  const estimatedCommits = Math.max(recentCommits, years_active * 50);

  return {
    ok: true,
    data: {
      name:         user.name || user.login,
      repos:        user.public_repos || 0,
      stars:        totalStars,
      followers:    user.followers || 0,
      commits:      estimatedCommits,
      years_active,
    },
  };
}
