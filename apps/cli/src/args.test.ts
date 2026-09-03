import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, toCommandName, fromCommandName } from "./args.ts";

test("Befehl und benannte Argumente werden getrennt", () => {
  const a = parseArgs(["shop-kpis", "--shop-id", "shop_a", "--days", "30"]);
  assert.equal(a.command, "shop-kpis");
  assert.deepEqual(a.args, { shopId: "shop_a", days: 30 });
});

test("--name=wert wird genauso verstanden wie --name wert", () => {
  assert.deepEqual(parseArgs(["x", "--shop-id=shop_a"]).args, { shopId: "shop_a" });
});

test("Zahlen werden zu Zahlen, alles andere bleibt Text", () => {
  const a = parseArgs(["x", "--days", "30", "--name", "Mein Shop", "--since", "2026-01-01"]);
  assert.equal(a.args.days, 30);
  assert.equal(a.args.name, "Mein Shop");
  // Ein Datum darf NICHT zur Zahl werden.
  assert.equal(a.args.since, "2026-01-01");
});

test("Schalter ohne Wert gelten als wahr", () => {
  assert.equal(parseArgs(["x", "--json"]).args.json, true);
});

test("erstes freies Argument gilt als Shop-Kennung", () => {
  // `trackdolphin kpis shop_a` soll ohne --shop-id funktionieren; die Kennung
  // ist bei fast jedem Befehl das erste, was man tippt.
  const a = parseArgs(["kpis", "shop_a"]);
  assert.equal(a.positional[0], "shop_a");
});

test("Lesebefehle verlieren das Verb, Schreibbefehle behalten es", () => {
  // Bei einer Abfrage trägt „get“ nichts bei — man tippt `kpis shop_a`.
  assert.equal(toCommandName("getShopKpis"), "kpis");
  assert.equal(toCommandName("listShops"), "shops");
  assert.equal(toCommandName("getShopTrackingHealth"), "tracking-health");

  // Bei einem Schreibvorgang ist das Verb die Warnung. `credentials` sähe aus
  // wie eine Abfrage; `save-credentials` sagt, dass etwas gespeichert wird.
  assert.equal(toCommandName("saveShopCredentials"), "save-credentials");
  assert.equal(toCommandName("startShopImport"), "start-import");
  assert.equal(toCommandName("revokeApiKey"), "revoke-api-key");
});

test("Befehlsname und Operation lassen sich zurückrechnen", () => {
  const ops = ["getShopKpis", "listShops", "startShopImport", "getShopTrackingHealth"];
  for (const op of ops) {
    assert.equal(fromCommandName(toCommandName(op), ops), op, `${op} nicht auffindbar`);
  }
});

test("unbekannter Befehl liefert nichts statt etwas Falsches", () => {
  assert.equal(fromCommandName("gibtsnicht", ["getShopKpis"]), null);
});

test("mehrdeutige Kurzformen bleiben eindeutig", () => {
  // Zwei Operationen dürfen nie denselben Befehlsnamen bekommen — sonst führt
  // derselbe Aufruf mal hierhin, mal dorthin.
  const ops = ["getShopKpis", "listShops", "startShopImport", "getShopImportStatus",
               "getShopOnboarding", "getShopChannels", "getShopTopPages", "getShopFunnel",
               "getShopEventTypes", "getShopDailySeries", "getShopTrackingHealth",
               "saveShopCredentials", "listApiKeys", "createApiKey", "revokeApiKey"];
  const names = ops.map(toCommandName);
  assert.equal(new Set(names).size, names.length, `doppelt: ${names.join(", ")}`);
});
