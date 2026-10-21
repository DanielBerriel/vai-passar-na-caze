import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { findCrest, loadCrestIndex } from "../crests.mjs";

const team = (name, fullName, tla, id) => ({ name, fullName, tla, crest: `https://crests.football-data.org/${id}.png` });

const INDEX = [
  team("Juventus", "Juventus FC", "JUV", 109),
  team("Milan", "AC Milan", "MIL", 98),
  team("Stade Rennais", "Stade Rennais FC 1901", "REN", 529),
  team("PSG", "Paris Saint-Germain FC", "PSG", 524),
  team("Paris FC", "Paris FC", "PFC", 1045),
  team("M'gladbach", "Borussia Mönchengladbach", "BMG", 18),
  team("Strasbourg", "RC Strasbourg Alsace", "RCS", 576),
];

test("guide names find their club's crest", () => {
  assert.match(findCrest("Juventus", INDEX), /109/);
  assert.match(findCrest("AC Milan", INDEX), /98/);
  assert.match(findCrest("Rennes", INDEX), /529/);
  assert.match(findCrest("Borussia M'gladbach", INDEX), /18/);
  assert.match(findCrest("Strasbourg", INDEX), /576/);
  assert.match(findCrest("Paris FC", INDEX), /1045/);
  assert.match(findCrest("PSG", INDEX), /524/);
});

test("unknown or ambiguous names get no crest instead of a wrong one", () => {
  assert.equal(findCrest("Kairat Almaty", INDEX), null);
  // "Paris" is contained in both Paris FC and Paris Saint-Germain.
  assert.equal(findCrest("Paris", INDEX.filter((t) => t.tla !== "PFC").concat(team("Paris 13", "Paris 13 Atletico", "P13", 1))), null);
  // Without Paris FC in the index, "Paris FC" must not borrow PSG's crest.
  assert.equal(findCrest("Paris FC", INDEX.filter((t) => t.tla !== "PFC")), null);
});

test("the index refreshes weekly and is reused in between", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "crests-"));
  const file = path.join(dir, "crests.json");
  let requests = 0;
  const fetchImpl = async (url) => {
    requests++;
    const code = String(url).match(/competitions\/(\w+)\/teams/)[1];
    const teams = code === "SA" ? [{ name: "Juventus FC", shortName: "Juventus", tla: "JUV", crest: "https://crests.football-data.org/109.png" }] : [];
    return new Response(JSON.stringify({ teams }), { status: 200 });
  };
  const opts = { file, token: "t", fetchImpl, log: () => {} };

  const first = await loadCrestIndex({ ...opts, now: new Date("2026-10-21T12:00:00Z") });
  assert.equal(requests, 7);
  assert.match(findCrest("Juventus", first), /109/);

  await loadCrestIndex({ ...opts, now: new Date("2026-10-24T12:00:00Z") });
  assert.equal(requests, 7, "within a week the cached index is used");

  await loadCrestIndex({ ...opts, now: new Date("2026-10-29T12:00:00Z") });
  assert.equal(requests, 14, "after a week it refreshes");
});
