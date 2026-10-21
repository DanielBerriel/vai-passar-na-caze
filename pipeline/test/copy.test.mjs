import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCopy, copyKey, templateCopy } from "../copy.mjs";

const match = {
  kickoff: "2026-10-24T19:00:00.000Z",
  competition: { name: "LaLiga" },
  stage: "Rodada 10",
  home: { name: "Alavés", fullName: "Deportivo Alavés" },
  away: { name: "Málaga", fullName: "Málaga CF" },
};

test("without an API key every match still gets copy", async () => {
  const { byKey, stats } = await buildCopy([match], {}, { apiKey: undefined, log: () => {} });
  const copy = byKey[copyKey(match)];
  assert.equal(copy.source, "template");
  assert.ok(copy.chamada.includes("Alavés"));
  assert.equal(stats.template, 1);
});

test("cached Claude copy is reused without a new request", async () => {
  const cache = { [copyKey(match)]: { chamada: "Sexta tem LaLiga!", selo: "JOGAÇO", source: "claude" } };
  const { byKey, stats } = await buildCopy([match], cache, { apiKey: "unused", log: () => {} });
  assert.equal(byKey[copyKey(match)].chamada, "Sexta tem LaLiga!");
  assert.equal(stats.fromCache, 1);
  assert.equal(stats.generated, 0);
});

/** A fetch stand-in that records the request and answers like the Messages API. */
function fakeApi(message) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
    return new Response(JSON.stringify(message), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { calls, clientOptions: { fetch, maxRetries: 0 } };
}

const apiMessage = (overrides) => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  stop_reason: "end_turn",
  usage: { input_tokens: 10, output_tokens: 10 },
  content: [],
  ...overrides,
});

test("Claude copy: structured request, parsed answer, cached result", async () => {
  const key = copyKey(match);
  const { calls, clientOptions } = fakeApi(
    apiMessage({
      content: [{ type: "text", text: JSON.stringify({ chamadas: [{ id: key, chamada: "Sexta tem LaLiga na faixa!", selo: "JOGAÇO" }] }) }],
    }),
  );
  const cache = {};
  const { byKey, stats } = await buildCopy([match], cache, { apiKey: "test", clientOptions, log: () => {} });

  assert.equal(calls.length, 1);
  const { body, headers } = calls[0];
  assert.equal(body.model, "claude-opus-5-5");
  assert.equal(body.fallbacks, "default");
  assert.equal(body.output_config.format.type, "json_schema");
  assert.match(headers.get("anthropic-beta"), /server-side-fallback-2026-07-01/);
  assert.match(body.messages[0].content, /Deportivo Alavés/);

  assert.equal(byKey[key].source, "claude");
  assert.equal(cache[key].chamada, "Sexta tem LaLiga na faixa!");
  assert.equal(stats.generated, 1);
});

test("Claude copy: invalid items are dropped and fall back to templates", async () => {
  const { clientOptions } = fakeApi(
    apiMessage({
      content: [{ type: "text", text: JSON.stringify({ chamadas: [{ id: "outro-jogo", chamada: "x", selo: "JOGAÇO" }] }) }],
    }),
  );
  const { byKey, stats } = await buildCopy([match], {}, { apiKey: "test", clientOptions, log: () => {} });
  assert.equal(byKey[copyKey(match)].source, "template");
  assert.equal(stats.generated, 0);
});

test("Claude copy: a refusal never breaks the page", async () => {
  const { clientOptions } = fakeApi(apiMessage({ stop_reason: "refusal", stop_details: { type: "refusal", category: null } }));
  const { byKey, stats } = await buildCopy([match], {}, { apiKey: "test", clientOptions, log: () => {} });
  assert.equal(byKey[copyKey(match)].source, "template");
  assert.match(stats.error, /recusou/);
});

test("templates are deterministic per match", () => {
  assert.deepEqual(templateCopy(match), templateCopy({ ...match }));
});
