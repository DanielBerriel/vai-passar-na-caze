import { test } from "node:test";
import assert from "node:assert/strict";
import { templateCopy } from "../copy.mjs";

const match = {
  kickoff: "2026-10-24T19:00:00.000Z",
  competition: { name: "LaLiga" },
  stage: "Rodada 10",
  home: { name: "Alavés", fullName: "Deportivo Alavés" },
  away: { name: "Málaga", fullName: "Málaga CF" },
};

test("every match gets copy naming both teams", () => {
  const copy = templateCopy(match);
  assert.ok(copy.text.includes("Alavés"));
  assert.ok(copy.text.includes("Málaga"));
  assert.equal(copy.badge, "VALE O PLAY");
});

test("templates are deterministic per match", () => {
  assert.deepEqual(templateCopy(match), templateCopy({ ...match }));
});
