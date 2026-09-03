import { test } from "node:test";
import assert from "node:assert/strict";
import { toolsFromOpenApi, buildRequest, type OpenApiDocument } from "./operations.ts";

const spec: OpenApiDocument = {
  openapi: "3.0.0",
  info: { title: "Trackdolphin API", version: "1" },
  paths: {
    "/api/shops": {
      get: {
        operationId: "listShops",
        summary: "Shops auflisten",
        description: "Alle Shops der Organisation.",
      },
    },
    "/api/shops/{shopId}/kpis": {
      get: {
        operationId: "getShopKpis",
        summary: "Kennzahlen",
        description: "Events, Käufe, Umsatz.",
        parameters: [
          { name: "shopId", in: "path", required: true, schema: { type: "string" },
            description: "Kennung des Shops" },
          { name: "days", in: "query", required: false, schema: { type: "integer" } },
        ],
      },
    },
    "/api/shops/{shopId}/import": {
      post: {
        operationId: "startShopImport",
        summary: "Import starten",
        description: "Holt die Historie nach.",
        parameters: [{ name: "shopId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { since: { type: "string" } } },
            },
          },
        },
      },
    },
  },
};

test("jede Operation wird zu einem Werkzeug", () => {
  const tools = toolsFromOpenApi(spec);
  assert.deepEqual(tools.map((t) => t.name).sort(), ["getShopKpis", "listShops", "startShopImport"]);
});

test("Werkzeugbeschreibung führt Zusammenfassung und Erklärung zusammen", () => {
  const t = toolsFromOpenApi(spec).find((x) => x.name === "getShopKpis")!;
  // Das Modell entscheidet allein anhand dieses Textes, ob es das Werkzeug
  // wählt — die Zusammenfassung allein ist dafür zu dünn.
  assert.match(t.description, /Kennzahlen/);
  assert.match(t.description, /Events, Käufe, Umsatz/);
});

test("Pfad- und Abfrageparameter werden zu Eingabefeldern", () => {
  const t = toolsFromOpenApi(spec).find((x) => x.name === "getShopKpis")!;
  const props = t.inputSchema.properties as Record<string, { type?: string; description?: string }>;
  assert.equal(props.shopId?.type, "string");
  assert.equal(props.days?.type, "integer");
  assert.deepEqual(t.inputSchema.required, ["shopId"]);
});

test("Pflichtfelder aus dem Pfad sind wirklich Pflicht", () => {
  const t = toolsFromOpenApi(spec).find((x) => x.name === "startShopImport")!;
  assert.ok((t.inputSchema.required as string[]).includes("shopId"));
});

test("Felder aus dem Anfragekörper landen im selben Schema", () => {
  // Ein Modell soll nicht zwischen „Pfad“, „Abfrage“ und „Körper“ unterscheiden
  // müssen — es kennt nur Argumente.
  const t = toolsFromOpenApi(spec).find((x) => x.name === "startShopImport")!;
  const props = t.inputSchema.properties as Record<string, unknown>;
  assert.ok("since" in props, "Feld aus dem Körper fehlt");
});

test("Operationen ohne operationId werden übersprungen, nicht erfunden", () => {
  const tools = toolsFromOpenApi({
    ...spec,
    paths: { "/x": { get: { summary: "namenlos" } } },
  });
  assert.equal(tools.length, 0);
});

test("Anfrage: Pfadplatzhalter werden ersetzt", () => {
  const req = buildRequest(spec, "getShopKpis", { shopId: "shop_a", days: 30 }, "https://api.test");
  assert.equal(req.method, "GET");
  assert.equal(req.url, "https://api.test/api/shops/shop_a/kpis?days=30");
  assert.equal(req.body, undefined);
});

test("Anfrage: Pfadwerte werden kodiert", () => {
  const req = buildRequest(spec, "getShopKpis", { shopId: "shop/../geheim" }, "https://api.test");
  // Ohne Kodierung könnte ein Modell über den Pfad aus dem vorgesehenen
  // Endpunkt ausbrechen.
  assert.doesNotMatch(req.url, /shop\/\.\.\//);
  assert.match(req.url, /shop%2F/);
});

test("Anfrage: Körperfelder gehen in den Körper, nicht in die Abfrage", () => {
  const req = buildRequest(spec, "startShopImport", { shopId: "shop_a", since: "2026-01-01" }, "https://api.test");
  assert.equal(req.method, "POST");
  assert.equal(req.url, "https://api.test/api/shops/shop_a/import");
  assert.deepEqual(JSON.parse(req.body!), { since: "2026-01-01" });
});

test("Anfrage: unbekanntes Werkzeug wird abgelehnt", () => {
  assert.throws(() => buildRequest(spec, "gibtsNicht", {}, "https://api.test"), /gibtsNicht/);
});

test("Anfrage: fehlender Pflichtparameter wird benannt", () => {
  assert.throws(
    () => buildRequest(spec, "getShopKpis", {}, "https://api.test"),
    /shopId/,
  );
});
