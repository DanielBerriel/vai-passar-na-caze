// Reconciles the broadcast guide (Portuguese names, Brasília time) with the
// fixtures API (official names, UTC). The two sources never spell teams the same
// way: "Bayern de Munique" vs "FC Bayern München", "Estac Troyes" vs "ES Troyes AC".
import { minutesBetween } from "./lib/time.mjs";

// Club-type affixes that carry no identity ("FC", "Clube", "Calcio"...).
const NOISE_TOKENS = new Set([
  "fc", "cf", "afc", "sc", "ac", "as", "ss", "ssc", "us", "cd", "ud", "sd", "rcd", "rc",
  "sv", "vfb", "vfl", "tsg", "fsv", "bsc", "1", "club", "clube", "futbol", "football",
  "calcio", "balompie", "es", "estac", "ec", "se", "cr", "ca", "fr", "fbpa", "fk", "sk",
  "de", "da", "do", "del", "la", "le", "the", "and",
]);

// Portuguese guide name -> name used by the API (after normalization).
const ALIASES = new Map([
  ["bayern munique", "bayern munchen"],
  ["inter milao", "internazionale"],
  ["inter", "internazionale"],
  ["napoles", "napoli"],
  ["sevilha", "sevilla"],
  ["colonia", "koln"],
  ["hamburgo", "hamburger"],
  ["marselha", "marseille"],
  ["olympique marselha", "marseille"],
  ["psg", "paris saint germain"],
  ["atletico madri", "atletico madrid"],
  ["atletico mg", "mineiro"],
  ["atletico mineiro", "mineiro"],
  ["athletico pr", "paranaense"],
  ["athletico paranaense", "paranaense"],
  ["vasco", "vasco gama"],
  ["bragantino", "rb bragantino"],
  ["red bull bragantino", "rb bragantino"],
  ["gladbach", "monchengladbach"],
  ["borussia m", "monchengladbach"],
  ["borussia m gladbach", "monchengladbach"],
  ["m gladbach", "monchengladbach"],
  ["borussia monchengladbach", "monchengladbach"],
  ["man city", "manchester city"],
  ["man united", "manchester united"],
  ["man utd", "manchester united"],
  ["wolves", "wolverhampton"],
  ["spurs", "tottenham"],
]);

export function normalizeTeam(name) {
  const tokens = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !NOISE_TOKENS.has(t));
  const joined = tokens.join(" ");
  return ALIASES.get(joined) ?? joined;
}

function bigrams(s) {
  const compact = s.replace(/ /g, "");
  const grams = new Map();
  for (let i = 0; i < compact.length - 1; i++) {
    const g = compact.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  return grams;
}

/** Sørensen–Dice coefficient over character bigrams, 0..1. */
function dice(a, b) {
  const ga = bigrams(a);
  const gb = bigrams(b);
  let overlap = 0;
  let total = 0;
  for (const [g, n] of ga) {
    overlap += Math.min(n, gb.get(g) ?? 0);
    total += n;
  }
  for (const n of gb.values()) total += n;
  return total === 0 ? 0 : (2 * overlap) / total;
}

/** Similarity between two raw team names, 0..1. */
export function nameSimilarity(rawA, rawB) {
  const a = normalizeTeam(rawA);
  const b = normalizeTeam(rawB);
  if (!a || !b) return 0;
  if (a === b) return 1;

  // "troyes" vs "estac troyes", "racing santander" vs "real racing santander"
  const ta = new Set(a.split(" "));
  const tb = new Set(b.split(" "));
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  if ([...small].every((t) => big.has(t))) return 0.9;

  return dice(a, b);
}

/** Best similarity between a guide name and any of the API's names for a team. */
export function teamSimilarity(guideName, apiTeam) {
  const candidates = [apiTeam.name, apiTeam.fullName, apiTeam.tla].filter(Boolean);
  return Math.max(...candidates.map((c) => nameSimilarity(guideName, c)));
}

const KICKOFF_WINDOW_MIN = 20;
const MIN_PAIR_SCORE = 0.72;
const MIN_SIDE_SCORE = 0.45;

export function scorePair(guide, api) {
  if (minutesBetween(guide.kickoff, api.kickoff) > KICKOFF_WINDOW_MIN) return null;
  const home = teamSimilarity(guide.home, api.home);
  const away = teamSimilarity(guide.away, api.away);
  const score = (home + away) / 2;
  if (score < MIN_PAIR_SCORE || Math.min(home, away) < MIN_SIDE_SCORE) return null;
  return { score: Math.round(score * 100) / 100, home, away };
}

/**
 * Greedy one-to-one assignment: score every (guide, api) pair inside the
 * kickoff window, then take the best pairs first so that two simultaneous
 * matches of the same league can't steal each other's fixture.
 */
export function reconcile(guideMatches, apiMatches) {
  const candidates = [];
  for (const g of guideMatches) {
    for (const a of apiMatches) {
      const s = scorePair(g, a);
      if (s) candidates.push({ guide: g, api: a, ...s });
    }
  }
  candidates.sort((x, y) => y.score - x.score);

  const usedGuide = new Set();
  const usedApi = new Set();
  const matched = [];
  for (const c of candidates) {
    if (usedGuide.has(c.guide.slug) || usedApi.has(c.api.id)) continue;
    usedGuide.add(c.guide.slug);
    usedApi.add(c.api.id);
    matched.push({ guide: c.guide, api: c.api, confidence: c.score });
  }

  return {
    matched,
    guideOnly: guideMatches.filter((g) => !usedGuide.has(g.slug)),
  };
}
