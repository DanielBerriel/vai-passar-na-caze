// Crests for broadcasts the fixtures API didn't confirm (Europa League and
// Conference League are outside the free tier, and some matches don't reconcile).
// The same clubs play domestic leagues the free tier does cover, so we keep an
// index of those squads and look crests up by name.
import fs from "node:fs/promises";
import { fetchTeams } from "./sources/football-data.mjs";
import { teamSimilarity, normalizeTeam } from "./match.mjs";

// 7 requests + 1 for fixtures stays under the free tier's 10 requests/minute.
const COMPETITIONS = ["PL", "PD", "SA", "BL1", "FL1", "BSA", "CL"];
const REFRESH_DAYS = 7;
const MIN_SIMILARITY = 0.9;

function dedupeByCrest(teams) {
  const byCrest = new Map();
  for (const t of teams) if (t.crest && !byCrest.has(t.crest)) byCrest.set(t.crest, t);
  return [...byCrest.values()];
}

/**
 * Loads the crest index from `file`, refreshing it from the API at most once a
 * week. Teams seen in this run's fixtures are always added. Never throws: on
 * failure the previous index (or just the fixtures' teams) is used.
 */
export async function loadCrestIndex({ file, token, fixtureTeams = [], now = new Date(), fetchImpl = fetch, log = console.log }) {
  let cached = { updatedAt: null, teams: [] };
  try {
    cached = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    // first run: no index yet
  }

  const ageDays = cached.updatedAt ? (now - new Date(cached.updatedAt)) / 86400000 : Infinity;
  let { teams, updatedAt } = cached;

  if (token && ageDays >= REFRESH_DAYS) {
    const fresh = [];
    let failures = 0;
    for (const competition of COMPETITIONS) {
      try {
        fresh.push(...(await fetchTeams({ token, competition, fetchImpl })));
      } catch (err) {
        failures++;
        log(`  escudos ${competition}: ${err.message}`);
      }
    }
    if (fresh.length) {
      // Keep old entries too: a club relegated mid-week still has the same crest.
      teams = dedupeByCrest([...fresh, ...teams]);
      updatedAt = failures ? updatedAt : now.toISOString();
      await fs.writeFile(file, JSON.stringify({ updatedAt, competitions: COMPETITIONS, teams }, null, 2) + "\n");
    }
    log(`  índice de escudos: ${fresh.length} times de ${COMPETITIONS.length - failures}/${COMPETITIONS.length} competições`);
  }

  return dedupeByCrest([...fixtureTeams, ...teams]);
}

/**
 * Crest for a guide team name, or null. Requires a near-exact name match and
 * refuses ties between different clubs ("Paris" could be Paris FC or PSG):
 * an initials badge is better than the wrong crest.
 */
export function findCrest(name, index) {
  // A short one-word name ("paris" once "FC" is dropped) may only match exactly.
  const normalized = normalizeTeam(name ?? "");
  const minScore = normalized.includes(" ") || normalized.length >= 6 ? MIN_SIMILARITY : 1;
  let best = 0;
  const crests = new Set();
  for (const team of index) {
    const score = teamSimilarity(name, team);
    if (score > best) {
      best = score;
      crests.clear();
    }
    if (score === best && score >= minScore) crests.add(team.crest);
  }
  return crests.size === 1 ? [...crests][0] : null;
}
