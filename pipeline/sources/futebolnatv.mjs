// Scraper for futebolnatv.com.br, a Brazilian "where to watch" guide.
// It is the source of truth for *who broadcasts* each match.
//
// Etiquette: robots.txt allows crawling; we fetch only 3 pages per run,
// sequentially with a pause, a few times a day, and credit the source on the page.
import * as cheerio from "cheerio";
import { localDate, addDays, localToUtcIso, resolveDayLabel } from "../lib/time.mjs";

const BASE_URL = "https://www.futebolnatv.com.br";
const USER_AGENT =
  "Mozilla/5.0 (compatible; VaiPassarNaCaze/1.0; portfolio project, low-frequency)";
const PAUSE_MS = 1500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = ($el) => $el.text().replace(/\s+/g, " ").trim();

export function isCazeTV(channel) {
  const n = channel.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return /caze\s*tv/.test(n);
}

/** The "/aovivo/<slug>.html" path is a stable per-match id on the guide. */
function slugFromHref(href) {
  const m = href?.match(/\/aovivo\/([^/?#]+?)(?:\.html)?$/);
  return m ? m[1] : null;
}

// Leagues whose CazéTV games the rights page doesn't list (it lags behind
// per-round deals). Paths can change; a 404 here is logged, not fatal.
const EXTRA_LEAGUE_PATHS = [
  "/liga/campeonato-ingles-diegw7eeiu",
  "/liga/campeonato-italiano-91ext4vdu4",
];
const MAX_LEAGUE_PAGES = 14;

/** Parses the match cards (with broadcasters) inside a container, for one date. */
function parseCards($, $scope, ymd) {
  const matches = [];

  $scope.find("a[href^='/aovivo/']").each((_, a) => {
    const $a = $(a);
    const $article = $a.find("article").first();
    const slug = slugFromHref($a.attr("href"));
    const time = text($article.find("time").first());
    const home = text($article.find("[id^='jogo-card-team-a-']").first().next("span"));
    const away = text($article.find("[id^='jogo-card-team-b-']").first().next("span"));
    if (!slug || !/^\d{1,2}:\d{2}$/.test(time) || !home || !away) return;

    const headerSpans = $article.children("div").first().find("p span");
    const competition = text(headerSpans.eq(0));
    const stage = text(headerSpans.eq(1)).replace(/^-\s*/, "");

    const channels = [];
    $article.find("[class*='hero-tv']").each((_, icon) => {
      const name = text($(icon).nextAll("span").first());
      if (name) channels.push(name);
    });

    matches.push({
      slug,
      url: `${BASE_URL}/aovivo/${slug}.html`,
      kickoff: localToUtcIso(ymd, time),
      home,
      away,
      competition,
      stage,
      channels,
    });
  });

  return matches;
}

/**
 * Parses a day listing (/jogos-hoje, /jogos-amanha): every match of the day
 * with its broadcasters.
 */
export function parseDayListing(html, ymd) {
  const $ = cheerio.load(html);
  return parseCards($, $("#fntv-jogos-por-hora"), ymd);
}

/**
 * Parses a league page (/liga/<slug>): the next round, grouped under day
 * headings, with every match's broadcasters.
 */
export function parseLeaguePage(html, now = new Date()) {
  const $ = cheerio.load(html);
  const matches = [];
  $("h3").each((_, h3) => {
    const ymd = resolveDayLabel(text($(h3)), now);
    if (ymd) matches.push(...parseCards($, $(h3).next(), ymd));
  });
  return matches;
}

/** League pages linked from the channel's broadcast-rights page. */
export function parseRightsPage(html) {
  const $ = cheerio.load(html);
  const paths = new Set();
  $("main a[href^='/liga/'], ul a[href^='/liga/']").each((_, a) => {
    const href = $(a).attr("href").split(/[?#]/)[0];
    if (/^\/liga\/[a-z0-9-]+$/.test(href)) paths.add(href);
  });
  return [...paths];
}

/**
 * Parses the channel page (/canal/cazetv): the next CazéTV broadcasts,
 * grouped under day headings ("Amanhã", "Sex, 23/10"...). Only the first page
 * is server-rendered; later pages need a LiveView websocket, so we combine this
 * with the full day listings for today and tomorrow.
 */
export function parseChannelAgenda(html, now = new Date()) {
  const $ = cheerio.load(html);
  const matches = [];
  const $section = $("section[aria-labelledby='channel-upcoming-heading']");

  $section.find("h3").each((_, h3) => {
    const ymd = resolveDayLabel(text($(h3)), now);
    if (!ymd) return;

    $(h3).next().find("a[href^='/aovivo/']").each((_, a) => {
      const $a = $(a);
      const slug = slugFromHref($a.attr("href"));
      const time = text($a.find("time").first());
      const home = text($a.find("[id^='canal-card-a-']").first().next("span"));
      const away = text($a.find("[id^='canal-card-b-']").first().prev("span"));
      if (!slug || !/^\d{1,2}:\d{2}$/.test(time) || !home || !away) return;

      // "Campeonato Espanhol · Rodada  6"
      const [competition = "", stage = ""] = text($a.find("article > p").last())
        .split("·")
        .map((s) => s.trim());

      matches.push({
        slug,
        url: `${BASE_URL}/aovivo/${slug}.html`,
        kickoff: localToUtcIso(ymd, time),
        home,
        away,
        competition,
        stage,
        channels: ["CAZÉTV"],
      });
    });
  });

  return matches;
}

async function fetchPage(path, fetchImpl) {
  const res = await fetchImpl(`${BASE_URL}${path}`, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "pt-BR,pt;q=0.9" },
  });
  if (!res.ok) throw new Error(`futebolnatv ${path} -> HTTP ${res.status}`);
  return res.text();
}

/**
 * Returns every CazéTV broadcast the guide knows about, deduplicated by slug,
 * plus per-page diagnostics for the transparency panel.
 *
 * Coverage: full day listings for today and tomorrow, the channel's own agenda,
 * and the next round of every league CazéTV holds rights to (discovered from
 * the rights page, so a new deal shows up without code changes).
 */
export async function scrapeCazeTVSchedule({ fetchImpl = fetch, now = new Date() } = {}) {
  const today = localDate(now);
  const bySlug = new Map();
  const seenSlugs = new Set();
  const diagnostics = [];
  let requests = 0;

  async function visit(path, parse) {
    if (requests++ > 0) await sleep(PAUSE_MS);
    try {
      const all = parse(await fetchPage(path, fetchImpl));
      const caze = all.filter((m) => m.channels.some(isCazeTV));
      for (const m of all) seenSlugs.add(m.slug);
      for (const m of caze) if (!bySlug.has(m.slug)) bySlug.set(m.slug, m);
      diagnostics.push({ page: path, ok: true, parsed: all.length, cazetv: caze.length });
    } catch (err) {
      diagnostics.push({ page: path, ok: false, error: err.message });
    }
  }

  await visit("/jogos-hoje", (html) => parseDayListing(html, today));
  await visit("/jogos-amanha", (html) => parseDayListing(html, addDays(today, 1)));
  await visit("/canal/cazetv", (html) => parseChannelAgenda(html, now));

  let leaguePaths = [];
  await visit("/canal/cazetv/direitos", (html) => {
    leaguePaths = parseRightsPage(html);
    return [];
  });
  const leagues = [...new Set([...leaguePaths, ...EXTRA_LEAGUE_PATHS])].slice(0, MAX_LEAGUE_PAGES);
  for (const path of leagues) await visit(path, (html) => parseLeaguePage(html, now));

  return {
    matches: [...bySlug.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff)),
    listedMatches: seenSlugs.size,
    leaguesScanned: leagues.length,
    diagnostics,
  };
}
