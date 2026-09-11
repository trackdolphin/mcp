import type { McpTool } from "./operations.ts";

/**
 * Was ein Zugang darf — die Antwort von `getAccessScope`
 * (apps/backend/src/access/access-scope.controller.ts).
 *
 * Paul, 2026-09-11: „der MCP muss wissen, ob nur readonly oder write erlaubt
 * ist." Bis dahin erfuhr ein Modell das erst am 403 — nachdem es einen Plan
 * gefasst, dem Menschen angekündigt und den ersten Schritt versucht hatte.
 */
export interface AccessScope {
  zugang: "api_key" | "sitzung";
  schluessel: { id: string; name: string; prefix: string; environment: string } | null;
  organisation: { id: string; name: string; rolle: string | null; schreiben: boolean; inhaber: boolean };
  staff: boolean;
  stufe: "lesen_und_schreiben" | "teilweise_nur_lesen" | "nur_lesen";
  projekte: Array<{
    id: string;
    name: string;
    herkunft: "eigen" | "freigegeben";
    freigabe_rolle: "verwalten" | "ansehen" | null;
    schreiben: boolean;
    eigentuemer: boolean;
  }>;
  beschraenkungen: string[];
}

export const ACCESS_SCOPE_OPERATION = "getAccessScope";

function namenListe(namen: string[]): string {
  const gezeigt = namen.slice(0, 5).map((n) => `„${n}“`);
  return namen.length > 5 ? `${gezeigt.join(", ")} und ${namen.length - 5} weitere` : gezeigt.join(", ");
}

function nurLesenProjekte(scope: AccessScope): string[] {
  return scope.projekte.filter((p) => !p.schreiben).map((p) => p.name);
}

/**
 * Der eine Satz für die `instructions` des MCP-Servers, danach die
 * Beschränkungen als kurze Liste. Er steht VOR jeder Werkzeugwahl im Kontext
 * des Modells — deshalb zuerst das Urteil, dann die Einzelheiten.
 */
export function zugangsHinweis(scope: AccessScope | null, fehler?: string): string {
  if (!scope) {
    return (
      `Welche Rechte dieser Zugang hat, ist unbekannt${fehler ? ` (${fehler})` : ""}. ` +
      "Schreibende Werkzeuge können deshalb mit 403 antworten; dann fehlt das Schreibrecht, nicht das Werkzeug."
    );
  }
  const wer = scope.schluessel ? `Dieser Zugang (API-Schlüssel „${scope.schluessel.name}“)` : "Dieser Zugang";
  const org = `Organisation „${scope.organisation.name}“`;
  let satz: string;
  if (scope.stufe === "nur_lesen") {
    satz = `${wer} darf in ${org} nur lesen; schreibende Werkzeuge sind deshalb nicht aufgeführt.`;
  } else if (scope.stufe === "teilweise_nur_lesen") {
    satz =
      `${wer} darf lesen und schreiben in ${org}, ` +
      `aber nur lesen in ${namenListe(nurLesenProjekte(scope))}.`;
  } else {
    satz = `${wer} darf lesen und schreiben in ${org}.`;
  }
  const inhaber = scope.organisation.inhaber
    ? "Er hat Inhaberrechte (Team, Verbindungen der Organisation, Projekte löschen oder freigeben)."
    : "Er hat KEINE Inhaberrechte: Team, Verbindungen der Organisation, Löschen und Freigeben von Projekten antworten mit 403.";
  const liste = scope.beschraenkungen.map((b) => `- ${b}`).join("\n");
  return [
    `${satz} ${inhaber}`,
    liste,
    "Werkzeuge mit readOnlyHint lesen nur; alle anderen ändern Daten in Trackdolphin oder bei der verbundenen Plattform. Der aktuelle Stand: getAccessScope.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Die Werkzeugliste zum Zugang.
 *
 * Bei „nur lesen“ fallen schreibende Werkzeuge ganz weg: Ein Werkzeug, das
 * garantiert mit 403 antwortet, ist schlechter als keines — das Modell
 * probiert es trotzdem und meldet dem Menschen dann einen Fehler statt einer
 * Grenze.
 *
 * Bei „teilweise“ bleiben sie, mit Präfix. Filtern geht hier nicht: Ein
 * Werkzeug gilt für JEDES Projekt (`projectId` ist ein Argument), und dasselbe
 * `saveEventRouting` ist im eigenen Projekt erlaubt und im freigegebenen
 * verboten. Das Präfix nennt die Projekte, damit das Modell vor dem Aufruf
 * entscheiden kann.
 */
export function werkzeugeFuerZugang(tools: McpTool[], scope: AccessScope | null): McpTool[] {
  if (!scope) return tools;
  if (scope.stufe === "nur_lesen") return tools.filter((t) => t.annotations.readOnlyHint);
  if (scope.stufe === "teilweise_nur_lesen") {
    const praefix = `Nur mit Schreibrecht (nicht in ${namenListe(nurLesenProjekte(scope))}): `;
    return tools.map((t) => (t.annotations.readOnlyHint ? t : { ...t, description: praefix + t.description }));
  }
  return tools;
}
