import { test } from "node:test";
import assert from "node:assert/strict";
import { nameSimilarity, reconcile } from "../match.mjs";

test("same club, different spellings across guide and API", () => {
  const pairs = [
    ["Alavés", "Deportivo Alavés"],
    ["Malaga", "Málaga CF"],
    ["Estac Troyes", "ES Troyes AC"],
    ["Bayern de Munique", "FC Bayern München"],
    ["PSG", "Paris Saint-Germain FC"],
    ["Atlético-MG", "CA Mineiro"],
    ["Racing Santander", "Real Racing Club de Santander"],
    ["Inter de Milão", "FC Internazionale Milano"],
    ["Rayo Vallecano", "Rayo Vallecano de Madrid"],
    ["Athletic Club", "Athletic Club"],
    ["Vasco", "CR Vasco da Gama"],
    ["São Paulo", "São Paulo FC"],
  ];
  for (const [guide, api] of pairs) {
    assert.ok(nameSimilarity(guide, api) >= 0.9, `${guide} ~ ${api} = ${nameSimilarity(guide, api)}`);
  }
});

test("different clubs stay apart", () => {
  const pairs = [
    ["Arsenal", "Aston Villa FC"],
    ["Brentford", "Fulham FC"],
    ["Real Madrid", "Real Betis Balompié"],
    ["Milan", "Inter"],
  ];
  for (const [a, b] of pairs) {
    assert.ok(nameSimilarity(a, b) < 0.6, `${a} vs ${b} = ${nameSimilarity(a, b)}`);
  }
});

const api = (id, kickoff, home, away) => ({
  id,
  kickoff,
  home: { name: home, fullName: home, tla: null },
  away: { name: away, fullName: away, tla: null },
});
const guide = (slug, kickoff, home, away) => ({ slug, kickoff, home, away });

test("simultaneous kickoffs are assigned to the right fixture", () => {
  const t = "2026-10-24T14:00:00.000Z";
  const apiMatches = [
    api(1, t, "Manchester United FC", "Fulham FC"),
    api(2, t, "Manchester City FC", "Brentford FC"),
    api(3, t, "Arsenal FC", "Chelsea FC"),
  ];
  const guideMatches = [
    guide("city-brentford", t, "Manchester City", "Brentford"),
    guide("united-fulham", t, "Manchester United", "Fulham"),
  ];
  const { matched, guideOnly } = reconcile(guideMatches, apiMatches);
  const bySlug = Object.fromEntries(matched.map((m) => [m.guide.slug, m.api.id]));
  assert.deepEqual(bySlug, { "city-brentford": 2, "united-fulham": 1 });
  assert.equal(guideOnly.length, 0);
});

test("kickoff outside the window or unknown competition stays guide-only", () => {
  const apiMatches = [api(10, "2026-10-24T19:00:00.000Z", "Deportivo Alavés", "Málaga CF")];
  const guideMatches = [
    guide("alaves-malaga-late", "2026-10-24T21:00:00.000Z", "Alavés", "Malaga"),
    guide("europa-league", "2026-10-22T16:45:00.000Z", "Roma", "Slovan Bratislava"),
  ];
  const { matched, guideOnly } = reconcile(guideMatches, apiMatches);
  assert.equal(matched.length, 0);
  assert.deepEqual(guideOnly.map((g) => g.slug), ["alaves-malaga-late", "europa-league"]);
});

test("a 15-minute schedule drift still reconciles", () => {
  const apiMatches = [api(20, "2026-10-24T15:00:00.000Z", "Toulouse FC", "ES Troyes AC")];
  const guideMatches = [guide("toulouse-troyes", "2026-10-24T15:15:00.000Z", "Toulouse", "Estac Troyes")];
  const { matched } = reconcile(guideMatches, apiMatches);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].confidence, 1);
});
