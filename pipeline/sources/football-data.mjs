// football-data.org v4: the source of truth for *what* is played and *when*
// (fixtures, kickoff in UTC, status, team names and crests).
// The API sends no CORS headers, so it can't be called from the browser;
// that is one reason this pipeline exists.
const API_BASE = "https://api.football-data.org/v4";

// Portuguese display names for the competitions in the free tier.
const COMPETITION_NAMES = {
  PL: "Premier League",
  PD: "LaLiga",
  SA: "Serie A",
  BL1: "Bundesliga",
  FL1: "Ligue 1",
  BSA: "Brasileirão",
  CL: "Champions League",
  ELC: "Championship",
  DED: "Eredivisie",
  PPL: "Liga Portugal",
  EC: "Eurocopa",
  WC: "Copa do Mundo",
};

function stageLabel(m) {
  if (m.matchday && (m.stage === "REGULAR_SEASON" || m.stage === "LEAGUE_STAGE")) {
    return `Rodada ${m.matchday}`;
  }
  const stages = {
    GROUP_STAGE: "Fase de grupos",
    LAST_32: "16 avos de final",
    LAST_16: "Oitavas de final",
    QUARTER_FINALS: "Quartas de final",
    SEMI_FINALS: "Semifinal",
    THIRD_PLACE: "Disputa de 3º lugar",
    FINAL: "Final",
    PLAYOFFS: "Playoffs",
  };
  return stages[m.stage] ?? (m.matchday ? `Rodada ${m.matchday}` : "");
}

function team(t) {
  return {
    name: t.shortName || t.name,
    fullName: t.name,
    tla: t.tla ?? null,
    crest: t.crest ?? null,
  };
}

export function normalizeMatch(m) {
  return {
    id: m.id,
    kickoff: new Date(m.utcDate).toISOString(),
    status: m.status,
    competition: {
      code: m.competition?.code ?? null,
      name: COMPETITION_NAMES[m.competition?.code] ?? m.competition?.name ?? "",
      emblem: m.competition?.emblem ?? null,
    },
    stage: stageLabel(m),
    home: team(m.homeTeam),
    away: team(m.awayTeam),
    // No score: the page is refreshed once a day, so any score would be stale.
  };
}

async function getJson(path, token, fetchImpl) {
  const res = await fetchImpl(`${API_BASE}${path}`, { headers: { "X-Auth-Token": token } });
  if (res.status === 429) throw new Error("football-data.org: limite de requisições atingido (429)");
  if (!res.ok) throw new Error(`football-data.org ${path.split("?")[0]} -> HTTP ${res.status}`);
  return res.json();
}

/** Fetches every match in [dateFrom, dateTo] (max 10 days per the API). */
export async function fetchMatches({ token, dateFrom, dateTo, fetchImpl = fetch }) {
  const body = await getJson(`/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`, token, fetchImpl);
  return (body.matches ?? []).filter((m) => m.homeTeam?.name && m.awayTeam?.name).map(normalizeMatch);
}

/** Every team of a competition's current season, with its crest. */
export async function fetchTeams({ token, competition, fetchImpl = fetch }) {
  const body = await getJson(`/competitions/${competition}/teams`, token, fetchImpl);
  return (body.teams ?? []).filter((t) => t.name && t.crest).map(team);
}
