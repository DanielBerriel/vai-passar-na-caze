// Pipeline entry point: `npm run dados`
//
//   futebolnatv (who broadcasts)  ─┐
//                                  ├─> reconcile ─> copy ─> data/jogos.json
//   football-data.org (fixtures)  ─┘
//
// Env: FOOTBALL_DATA_TOKEN (optional; without it the guide alone drives the page),
// FOOTBALL_DATA_FIXTURE (path to a saved API response, for offline runs),
// PIPELINE_OUT_DIR (write somewhere other than ./data).
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scrapeCazeTVSchedule } from "./sources/futebolnatv.mjs";
import { fetchMatches, normalizeMatch } from "./sources/football-data.mjs";
import { reconcile } from "./match.mjs";
import { loadCrestIndex, findCrest } from "./crests.mjs";
import { templateCopy } from "./copy.mjs";
import { localDate, addDays } from "./lib/time.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = process.env.PIPELINE_OUT_DIR ? path.resolve(process.env.PIPELINE_OUT_DIR) : path.join(ROOT, "data");
const OUTPUT_FILE = path.join(DATA_DIR, "jogos.json");
const CREST_FILE = path.join(DATA_DIR, "crests.json");

const KEEP_STARTED_FOR_MS = 3 * 60 * 60 * 1000;

// The guide uses Portuguese league names; show the same names the API path uses.
const GUIDE_COMPETITIONS = {
  "campeonato ingles": { code: "PL", name: "Premier League" },
  "premier league": { code: "PL", name: "Premier League" },
  "campeonato espanhol": { code: "PD", name: "LaLiga" },
  "laliga": { code: "PD", name: "LaLiga" },
  "campeonato italiano": { code: "SA", name: "Serie A" },
  "campeonato alemao": { code: "BL1", name: "Bundesliga" },
  "campeonato frances": { code: "FL1", name: "Ligue 1" },
  "brasileirao serie a": { code: "BSA", name: "Brasileirão" },
  "campeonato brasileiro": { code: "BSA", name: "Brasileirão" },
  "champions league": { code: "CL", name: "Champions League" },
  "uefa champions league": { code: "CL", name: "Champions League" },
  "europa league": { code: "EL", name: "Europa League" },
  "uefa europa league": { code: "EL", name: "Europa League" },
  "conference league": { code: "UECL", name: "Conference League" },
  "uefa conference league": { code: "UECL", name: "Conference League" },
};

// The guide truncates or mis-cases a few names; only used when the API has no match.
const GUIDE_TEAM_FIXES = {
  "Borussia M": "Borussia M'gladbach",
  "LE Havre": "Le Havre",
};

function guideCompetition(name) {
  const key = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return { emblem: null, ...(GUIDE_COMPETITIONS[key] ?? { code: null, name }) };
}

function guideStage(stage) {
  const leagueStage = stage.match(/league stage\s*-\s*(\d+)/i);
  return leagueStage ? `Fase de liga · Rodada ${leagueStage[1]}` : stage;
}

function guideTeam(raw) {
  const name = GUIDE_TEAM_FIXES[raw] ?? raw;
  return { name, fullName: name, tla: null, crest: null };
}

async function loadFixtures({ today, log }) {
  const fixture = process.env.FOOTBALL_DATA_FIXTURE;
  const token = process.env.FOOTBALL_DATA_TOKEN;
  // The API caps a request at 10 days.
  const dateFrom = addDays(today, -1);
  const dateTo = addDays(today, 8);

  if (fixture) {
    const body = JSON.parse(await fs.readFile(fixture, "utf8"));
    const matches = body.matches.map(normalizeMatch);
    log(`  football-data.org (fixture ${path.basename(fixture)}): ${matches.length} partidas`);
    return { status: "fixture", matches };
  }
  if (!token) {
    log("  FOOTBALL_DATA_TOKEN ausente: seguindo só com o guia de programação.");
    return { status: "sem-token", matches: [] };
  }
  try {
    const matches = await fetchMatches({ token, dateFrom, dateTo });
    log(`  football-data.org: ${matches.length} partidas entre ${dateFrom} e ${dateTo}`);
    return { status: "ok", matches };
  } catch (err) {
    log(`  football-data.org falhou (${err.message}); seguindo só com o guia.`);
    return { status: "erro", error: err.message, matches: [] };
  }
}

function toBroadcast({ guide, api, confidence }) {
  if (api) {
    return {
      id: `fd-${api.id}`,
      kickoff: api.kickoff,
      status: api.status,
      competition: api.competition,
      stage: api.stage || guideStage(guide.stage),
      // Brazilian names from the guide ("Bayern de Munique"), crests from the API.
      home: { ...api.home, name: guideTeam(guide.home).name },
      away: { ...api.away, name: guideTeam(guide.away).name },
      guideUrl: guide.url,
      reconciliation: { method: "api+guia", confidence },
    };
  }
  return {
    id: `fntv-${guide.slug}`,
    kickoff: guide.kickoff,
    status: null,
    competition: guideCompetition(guide.competition),
    stage: guideStage(guide.stage),
    home: guideTeam(guide.home),
    away: guideTeam(guide.away),
    guideUrl: guide.url,
    reconciliation: { method: "guia" },
  };
}

export async function run({ now = new Date(), log = console.log } = {}) {
  const today = localDate(now);
  log(`Vai Passar na Cazé · pipeline · ${now.toISOString()}`);

  log("1/4 Guia de programação (scraping)");
  const guide = await scrapeCazeTVSchedule({ now });
  for (const d of guide.diagnostics) {
    log(`  ${d.page}: ${d.ok ? `${d.parsed} jogos lidos, ${d.cazetv} na CazéTV` : `ERRO ${d.error}`}`);
  }
  if (guide.diagnostics.every((d) => !d.ok)) {
    // Never replace good data with an empty page; the last snapshot stays live.
    throw new Error("Nenhuma página do guia respondeu; mantendo o último jogos.json.");
  }

  log("2/4 Calendário oficial (API)");
  const fixtures = await loadFixtures({ today, log });
  await fs.mkdir(DATA_DIR, { recursive: true });
  const crestIndex = await loadCrestIndex({
    file: CREST_FILE,
    token: process.env.FOOTBALL_DATA_TOKEN,
    fixtureTeams: fixtures.matches.flatMap((m) => [m.home, m.away]),
    now,
    log,
  });

  log("3/4 Cruzamento guia x API");
  const { matched, guideOnly } = reconcile(guide.matches, fixtures.matches);
  log(`  ${matched.length} casados com a API, ${guideOnly.length} só no guia`);
  for (const m of matched) {
    log(`    ${m.guide.home} x ${m.guide.away}  =>  ${m.api.home.fullName} x ${m.api.away.fullName}  (${m.confidence})`);
  }

  const horizonEnd = Date.parse(`${addDays(today, 10)}T23:59:59-03:00`);
  const broadcasts = [...matched, ...guideOnly.map((guide) => ({ guide }))]
    .map(toBroadcast)
    .filter((b) => {
      const t = Date.parse(b.kickoff);
      return t >= now.getTime() - KEEP_STARTED_FOR_MS && t <= horizonEnd;
    })
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  const teams = broadcasts.flatMap((b) => [b.home, b.away]);
  for (const team of teams) team.crest ??= findCrest(team.name, crestIndex) ?? findCrest(team.fullName, crestIndex);
  const withCrest = teams.filter((t) => t.crest).length;
  log(`  escudos: ${withCrest}/${teams.length} times`);

  log("4/4 Chamadas");
  for (const b of broadcasts) b.copy = templateCopy(b);

  const output = {
    generatedAt: now.toISOString(),
    timeZone: "America/Sao_Paulo",
    sources: {
      guide: { name: "futebolnatv.com.br", pages: guide.diagnostics },
      fixtures: { name: "football-data.org", status: fixtures.status, error: fixtures.error ?? null },
    },
    stats: {
      guidePagesRead: guide.diagnostics.filter((d) => d.ok).length,
      leaguesScanned: guide.leaguesScanned,
      guideMatchesRead: guide.listedMatches,
      apiMatchesRead: fixtures.matches.length,
      cazetvBroadcasts: broadcasts.length,
      reconciled: broadcasts.filter((b) => b.reconciliation.method === "api+guia").length,
      guideOnly: broadcasts.filter((b) => b.reconciliation.method === "guia").length,
      teamsWithCrest: withCrest,
      teamsShown: teams.length,
    },
    broadcasts,
  };

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2) + "\n");
  log(`OK: ${broadcasts.length} transmissões em ${path.relative(ROOT, OUTPUT_FILE) || OUTPUT_FILE}`);
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error(`FALHOU: ${err.message}`);
    process.exit(1);
  });
}
