import { test } from "node:test";
import assert from "node:assert/strict";
import { call, API_KEY_UNAUTHORIZED_MESSAGE } from "./client.ts";
// Der Typ gehört zu `operations.ts`; `client.ts` benutzt ihn nur. Ihn von dort
// zu importieren war ein Fehler, den nur der Typecheck dieses Pakets sah — und
// der lief in keiner der Prüfungen mit.
import type { OpenApiDocument } from "./operations.ts";

const spec: OpenApiDocument = {
  openapi: "3.0.0",
  info: { title: "Trackdolphin API", version: "1" },
  paths: {
    "/api/shops": {
      get: { operationId: "listShops", summary: "Shops auflisten" },
    },
  },
};

function fakeFetch(status: number, body: unknown): typeof globalThis.fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof globalThis.fetch;
}

test("401 meldet immer den API-Schlüssel, nie eine Sitzung — unabhängig vom Backend-Text", async () => {
  // Kommandozeile und MCP-Server authentifizieren sich ausschließlich per
  // API-Schlüssel. Das Backend formuliert für 401 zwar meist schon passend
  // (siehe SessionGuard), aber verlässt man sich auf dessen Freitext, würde
  // ein Satz wie „Sitzung abgelaufen — bitte neu anmelden.“ unverändert
  // durchgereicht, sobald der Guard aus irgendeinem Grund den falschen Zweig
  // nimmt. Der Zweig steht hier ohnehin fest, also wird die Meldung überschrieben.
  const result = await call(
    spec,
    "listShops",
    {},
    {
      baseUrl: "https://api.test",
      token: "td_live_ungueltig",
      fetchImpl: fakeFetch(401, { message: "Sitzung abgelaufen — bitte neu anmelden." }),
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.message, API_KEY_UNAUTHORIZED_MESSAGE);
  assert.doesNotMatch(result.message, /Sitzung/);
});

test("401 ohne jeden Nachrichtentext im Backend führt trotzdem zur klaren Meldung", async () => {
  const result = await call(
    spec,
    "listShops",
    {},
    { baseUrl: "https://api.test", token: "x", fetchImpl: fakeFetch(401, {}) },
  );
  assert.equal(result.message, API_KEY_UNAUTHORIZED_MESSAGE);
});

test("andere Fehler geben weiterhin den Backend-Text durch", async () => {
  const result = await call(
    spec,
    "listShops",
    {},
    {
      baseUrl: "https://api.test",
      token: "x",
      fetchImpl: fakeFetch(404, { message: "Shop nicht gefunden." }),
    },
  );
  assert.equal(result.message, "Shop nicht gefunden.");
});

test("Erfolg bleibt unberührt", async () => {
  const result = await call(
    spec,
    "listShops",
    {},
    { baseUrl: "https://api.test", token: "x", fetchImpl: fakeFetch(200, { shops: [] }) },
  );
  assert.equal(result.ok, true);
  assert.equal(result.message, "");
});
