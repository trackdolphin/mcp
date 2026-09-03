import {
  fetchSpec, call, toolsFromOpenApi,
  type OpenApiDocument,
} from "@trackdolphin/openapi-client";
import { parseArgs, toCommandName, fromCommandName } from "./args.ts";

/**
 * Kommandozeile für Trackdolphin.
 *
 * Sie kennt keine eigenen Befehle: Alles wird aus der OpenAPI-Beschreibung
 * abgeleitet — dieselbe Quelle wie beim MCP-Server. Ein neuer Endpunkt ist
 * damit sofort ein neuer Befehl, ohne dass hier etwas nachgezogen wird.
 */

const BASE_URL = (process.env.TRACKDOLPHIN_URL ?? "https://api.trackdolphin.com").replace(/\/+$/, "");
const TOKEN = process.env.TRACKDOLPHIN_TOKEN ?? "";

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function printHelp(spec: OpenApiDocument): void {
  const tools = toolsFromOpenApi(spec);
  const rows = tools
    .map((t) => ({ command: toCommandName(t.name), description: t.description.split(" — ")[0] ?? "" }))
    .sort((a, b) => a.command.localeCompare(b.command));

  const width = Math.max(...rows.map((r) => r.command.length));
  process.stdout.write(
    `trackdolphin — Kommandozeile für ${spec.info.title}\n\n` +
    `Aufruf:  trackdolphin <befehl> [shop-kennung] [--option wert]\n\n` +
    `Befehle:\n` +
    rows.map((r) => `  ${r.command.padEnd(width)}  ${r.description}`).join("\n") +
    `\n\nUmgebung:\n` +
    `  TRACKDOLPHIN_TOKEN   API-Schlüssel (Dashboard → Einstellungen → API)\n` +
    `  TRACKDOLPHIN_URL     Adresse der API (Standard: ${BASE_URL})\n\n` +
    `Beispiele:\n` +
    `  trackdolphin shops\n` +
    `  trackdolphin tracking-health shop_meinshop_de_ab12cd\n` +
    `  trackdolphin kpis shop_meinshop_de_ab12cd\n` +
    `  trackdolphin channels shop_meinshop_de_ab12cd --days 30\n`,
  );
}

const parsed = parseArgs(process.argv.slice(2));

if (!TOKEN) {
  fail(
    "TRACKDOLPHIN_TOKEN fehlt.\n" +
    "Einen Schlüssel erzeugst du im Dashboard unter Einstellungen → API.",
  );
}

let spec: OpenApiDocument;
try {
  spec = await fetchSpec({ baseUrl: BASE_URL, token: TOKEN });
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}

if (!parsed.command || parsed.command === "help" || parsed.args.help) {
  printHelp(spec);
  process.exit(0);
}

const operationIds = toolsFromOpenApi(spec).map((t) => t.name);
const operationId = fromCommandName(parsed.command, operationIds);
if (!operationId) {
  const known = operationIds.map(toCommandName).sort();
  // Statt nur „unbekannt“ die naheliegendste Alternative nennen — meist ist es
  // ein Tippfehler oder ein Wort daneben.
  const close = known.filter((c) => c.includes(parsed.command) || parsed.command.includes(c));
  fail(
    `Unbekannter Befehl: ${parsed.command}\n` +
    (close.length ? `Meintest du: ${close.join(", ")}?\n` : "") +
    `„trackdolphin help“ zeigt alle Befehle.`,
  );
}

// Die erste freie Angabe ist die Shop-Kennung — man tippt sie ohnehin zuerst.
const args = { ...parsed.args };
if (parsed.positional[0] && args.shopId === undefined) {
  args.shopId = parsed.positional[0];
}

const result = await call(spec, operationId, args, { baseUrl: BASE_URL, token: TOKEN });

if (!result.ok) {
  fail(result.message || `Fehlgeschlagen (HTTP ${result.status}).`);
}

process.stdout.write(
  typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2),
);
process.stdout.write("\n");
