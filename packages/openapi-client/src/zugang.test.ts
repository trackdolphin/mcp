import { test } from "node:test";
import assert from "node:assert/strict";
import { werkzeugeFuerZugang, zugangsHinweis, type AccessScope } from "./zugang.ts";
import type { McpTool } from "./operations.ts";

const werkzeug = (name: string, lesen: boolean): McpTool => ({
  name,
  description: name,
  inputSchema: { type: "object", properties: {} },
  annotations: { readOnlyHint: lesen, destructiveHint: false, idempotentHint: lesen },
});
const tools = [werkzeug("listProjects", true), werkzeug("saveEventRouting", false)];

const basis: AccessScope = {
  zugang: "api_key",
  schluessel: { id: "k1", name: "Claude", prefix: "td_live_abcdef", environment: "live" },
  organisation: { id: "o1", name: "Nordlicht", rolle: "owner", schreiben: true, inhaber: true },
  staff: false,
  stufe: "lesen_und_schreiben",
  projekte: [{ id: "p1", name: "shop.de", herkunft: "eigen", freigabe_rolle: null, schreiben: true, eigentuemer: true }],
  beschraenkungen: ["Gilt nur für diese Organisation."],
};

test("Voller Zugang: der Satz nennt Organisation und Schlüssel, alle Werkzeuge bleiben", () => {
  assert.match(zugangsHinweis(basis), /^Dieser Zugang \(API-Schlüssel „Claude“\) darf lesen und schreiben in Organisation „Nordlicht“\./);
  assert.equal(werkzeugeFuerZugang(tools, basis).length, 2);
});

test("Nur lesen: schreibende Werkzeuge werden nicht angeboten", () => {
  const s: AccessScope = { ...basis, stufe: "nur_lesen", organisation: { ...basis.organisation, schreiben: false } };
  assert.deepEqual(werkzeugeFuerZugang(tools, s).map((t) => t.name), ["listProjects"]);
  assert.match(zugangsHinweis(s), /nur lesen/);
});

test("Teilweise: Werkzeuge bleiben, schreibende tragen das Präfix mit den Projekten", () => {
  const s: AccessScope = {
    ...basis,
    stufe: "teilweise_nur_lesen",
    projekte: [
      ...basis.projekte,
      { id: "p2", name: "kunde.de", herkunft: "freigegeben", freigabe_rolle: "ansehen", schreiben: false, eigentuemer: false },
    ],
  };
  const liste = werkzeugeFuerZugang(tools, s);
  assert.equal(liste.length, 2);
  assert.equal(liste[0]!.description, "listProjects");
  assert.match(liste[1]!.description, /^Nur mit Schreibrecht \(nicht in „kunde\.de“\): /);
  assert.match(zugangsHinweis(s), /aber nur lesen in „kunde\.de“/);
});

test("Ohne Inhaberrecht sagt der Hinweis, was deshalb scheitert", () => {
  const s: AccessScope = { ...basis, organisation: { ...basis.organisation, rolle: "member", inhaber: false } };
  assert.match(zugangsHinweis(s), /KEINE Inhaberrechte/);
});

test("Unbekannter Zugang: nichts wird gefiltert, der Hinweis sagt es ehrlich", () => {
  assert.equal(werkzeugeFuerZugang(tools, null).length, 2);
  assert.match(zugangsHinweis(null, "HTTP 404"), /unbekannt \(HTTP 404\)/);
});
