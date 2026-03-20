import { NextRequest, NextResponse } from "next/server";
import { scoreAcademia, scoreTech } from "@/lib/scorer";

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
      // If a github_username is provided, fetch from GitHub API
      if (body.github_username) {
        const ghData = await fetchGitHub(body.github_username);
        if (!ghData.ok) {
          return NextResponse.json({ error: ghData.error }, { status: 400 });
        }
        const score = scoreTech(ghData.data!);
        return NextResponse.json(score);
      }

      // Manual tech input
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

    return NextResponse.json({ error: "realm must be 'academia' or 'tech'" }, { status: 400 });

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

  // Use GitHub token if set (raises rate limit from 60 to 5000 req/hr)
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  // Fetch user profile
  const userRes = await fetch(`https://api.github.com/users/${username}`, { headers });
  if (!userRes.ok) {
    if (userRes.status === 404) return { ok: false, error: `GitHub user '${username}' not found` };
    return { ok: false, error: `GitHub API error: ${userRes.status}` };
  }
  const user = await userRes.json();

  // Fetch repos to sum up stars
  const reposRes = await fetch(
    `https://api.github.com/users/${username}/repos?per_page=100&sort=pushed`,
    { headers }
  );
  const repos = reposRes.ok ? await reposRes.json() : [];
  const totalStars = Array.isArray(repos)
    ? repos.reduce((sum: number, r: { stargazers_count: number }) => sum + (r.stargazers_count || 0), 0)
    : 0;

  // Estimate years active from account creation date
  const createdYear = new Date(user.created_at).getFullYear();
  const years_active = new Date().getFullYear() - createdYear || 1;

  // Commit count: use contribution events (public only, approximate)
  // GitHub doesn't expose total commits easily without auth — use public events as proxy
  const eventsRes = await fetch(
    `https://api.github.com/users/${username}/events/public?per_page=100`,
    { headers }
  );
  const events = eventsRes.ok ? await eventsRes.json() : [];
  const recentCommits = Array.isArray(events)
    ? events.filter((e: { type: string }) => e.type === "PushEvent").length * 10
    : 0;
  // Scale up the proxy — assume recent 100 events represent ~6 months of activity
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
