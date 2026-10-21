import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDayListing,
  parseChannelAgenda,
  parseLeaguePage,
  parseRightsPage,
  isCazeTV,
} from "../sources/futebolnatv.mjs";
import { resolveDayLabel } from "../lib/time.mjs";

// Minimal markup mirroring the guide's structure (classes trimmed).
const DAY_LISTING = `
<div id="fntv-jogos-por-hora">
  <div id="fntv-hr-0">
    <a href="/aovivo/levante-x-athletic-club-709c107808d7.html"><article>
      <div><div><img alt="LaLiga"></div><p><span>Campeonato Espanhol</span><span>- Rodada 6</span></p></div>
      <div>
        <div><time>15:00</time></div>
        <div>
          <div><div id="jogo-card-team-a-levante"><img alt="Levante"></div><span>Levante</span></div>
          <div><div id="jogo-card-team-b-levante"><img alt="Athletic Club"></div><span>Athletic Club</span></div>
        </div>
      </div>
      <div><span><span class="hero-tv size-4"></span><span>CAZÉTV</span></span></div>
    </article></a>
  </div>
  <div id="fntv-hr-1">
    <a href="/aovivo/psg-x-barcelona-b5849b019c40.html"><article>
      <div><p><span>Champions League</span><span>- League Stage - 3</span></p></div>
      <div>
        <div><time>16:00</time></div>
        <div>
          <div><div id="jogo-card-team-a-psg"><img alt="PSG"></div><span>PSG</span></div>
          <div><div id="jogo-card-team-b-psg"><img alt="Barcelona"></div><span>Barcelona</span></div>
        </div>
      </div>
      <div>
        <span><span class="hero-tv"></span><span>TNT</span></span>
        <span><span class="hero-tv"></span><span>HBO MAX</span></span>
      </div>
    </article></a>
  </div>
</div>`;

const CHANNEL_PAGE = `
<section aria-labelledby="channel-upcoming-heading">
  <h2 id="channel-upcoming-heading">Próximos jogos</h2>
  <div>
    <div>
      <h3>Sex, 23/10</h3>
      <div>
        <a href="/aovivo/alaves-x-malaga-2a1ee54772ec.html"><article>
          <div>
            <div><div id="canal-card-a-alaves"><img alt="Alavés"></div><span>Alavés</span></div>
            <div><time>16:00</time></div>
            <div><span>Malaga</span><div id="canal-card-b-alaves"><img alt="Malaga"></div></div>
          </div>
          <p>Campeonato Espanhol · Rodada  10</p>
        </article></a>
      </div>
    </div>
  </div>
</section>`;

test("day listing: teams, kickoff in UTC, competition and channels", () => {
  const matches = parseDayListing(DAY_LISTING, "2026-10-21");
  assert.equal(matches.length, 2);
  assert.deepEqual(matches[0], {
    slug: "levante-x-athletic-club-709c107808d7",
    url: "https://www.futebolnatv.com.br/aovivo/levante-x-athletic-club-709c107808d7.html",
    kickoff: "2026-10-21T18:00:00.000Z",
    home: "Levante",
    away: "Athletic Club",
    competition: "Campeonato Espanhol",
    stage: "Rodada 6",
    channels: ["CAZÉTV"],
  });
  assert.deepEqual(matches[1].channels, ["TNT", "HBO MAX"]);
});

test("channel agenda: day headings become dates", () => {
  const [m] = parseChannelAgenda(CHANNEL_PAGE, new Date("2026-10-20T18:00:00Z"));
  assert.equal(m.kickoff, "2026-10-23T19:00:00.000Z");
  assert.equal(m.home, "Alavés");
  assert.equal(m.away, "Malaga");
  assert.equal(m.stage, "Rodada 10");
});

test("league page: next round across several days", () => {
  const html = `<main><h2>Próximos jogos</h2><div>
    <div><h3>Sáb, 24/10</h3><div>${DAY_LISTING.replace(/<\/?div id="fntv-jogos-por-hora">/g, "")}</div></div>
    <div><h3>Dom, 25/10</h3><div></div></div>
  </div></main>`;
  const matches = parseLeaguePage(html, new Date("2026-10-20T18:00:00Z"));
  assert.equal(matches.length, 2);
  assert.equal(matches[0].kickoff, "2026-10-24T18:00:00.000Z");
});

test("rights page: league links only", () => {
  const html = `<main><ul>
    <li><a href="/liga/brasileirao-serie-a-ne9wa6elab">Brasileirão Série A</a></li>
    <li><a href="/liga/campeonato-frances-5na39ifvp5?ref=x">Campeonato Francês</a></li>
    <li><a href="/canal/cazetv">CazéTV</a></li>
  </ul></main>`;
  assert.deepEqual(parseRightsPage(html), [
    "/liga/brasileirao-serie-a-ne9wa6elab",
    "/liga/campeonato-frances-5na39ifvp5",
  ]);
});

test("CazéTV channel detection tolerates spelling", () => {
  assert.ok(isCazeTV("CAZÉTV"));
  assert.ok(isCazeTV("Cazé TV"));
  assert.ok(isCazeTV("CazeTV (YouTube)"));
  assert.ok(!isCazeTV("ESPN"));
});

test("day labels resolve across the new year", () => {
  const lateDecember = new Date("2026-12-28T15:00:00Z");
  assert.equal(resolveDayLabel("Hoje", lateDecember), "2026-12-28");
  assert.equal(resolveDayLabel("Amanhã", lateDecember), "2026-12-29");
  assert.equal(resolveDayLabel("Sáb, 02/01", lateDecember), "2027-01-02");
  assert.equal(resolveDayLabel("Qua, 30/12", lateDecember), "2026-12-30");
});
