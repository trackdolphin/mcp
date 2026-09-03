# syntax=docker/dockerfile:1
# ───────────────────────────────────────────────────────────────────────────
# Trackdolphin · MCP-Server (stdio — KEIN Serverdienst)
#
# ACHTUNG — dieser Dienst gehört NICHT als Dauer-App nach Coolify.
# Der MCP-Server spricht ausschließlich über stdio (StdioServerTransport in
# src/index.ts): Er liest Anfragen von der Standardeingabe und antwortet auf
# der Standardausgabe. In einem Container ohne Gegenüber ist die Eingabe
# sofort geschlossen — der Prozess hätte niemanden, mit dem er redet, und
# nichts, worauf er horcht. Es gibt keinen Port, den man veröffentlichen
# könnte.
#
# Wofür dieses Image dann? Für den Aufruf mit angehängter Eingabe, etwa
# `docker run -i --rm trackdolphin-mcp` aus einem MCP-Client heraus. Sobald
# der Server einen HTTP-/SSE-Transport bekommt, wird hier ein EXPOSE samt
# Healthcheck ergänzt und der Dienst kann in projects.json aufgenommen werden.
#
# Muster fuer alle Dienste dieses Repos: turbo prune → pnpm install →
# ausgeduennter Arbeitsbereich als Laufzeit. Einen neuen Dienst hinzufuegen
# heisst: diese Datei kopieren und PAKET, PORT und CMD tauschen.
#
# WARUM ohne Kompilat: Dieses Repo hat keinen Build-Schritt fuer Node-Code.
# Alle Pakete exportieren TypeScript direkt aus src/ (siehe
# packages/*/package.json) und werden zur Laufzeit uebersetzt — im Backend
# ueber @swc-node/register, sonst ueber tsx. Ein zusaetzlicher tsc-Lauf
# erzeugte nur ein zweites Artefakt, das niemand ausfuehrt.
#
# WARUM kein `pnpm deploy`: Es kopiert die Arbeitsbereichs-Pakete als echte
# Ordner NACH node_modules. @swc-node/register uebersetzt aber nichts, was
# unter node_modules liegt — das Backend startete damit nicht („Unknown file
# extension .ts"). Der ausgeduennte Arbeitsbereich behaelt packages/* dort,
# wo sie hingehoeren, und node_modules enthaelt nur Verweise darauf.
# ───────────────────────────────────────────────────────────────────────────

FROM node:22.15-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
# libc6-compat: glibc-Shim fuer vorgebaute native Binaerdateien (@swc/core).
RUN corepack enable && apk add --no-cache libc6-compat

# --- Stufe 1: Werkstatt auf diesen einen Dienst eindampfen -------------------
# turbo prune wirft alles weg, was @trackdolphin/mcp nicht braucht. Damit laesst eine
# Aenderung an einer fremden App diese Schicht unberuehrt — der Cache haelt.
FROM base AS pruned
WORKDIR /src
RUN npm add -g turbo@2.10.4
COPY . .
RUN turbo prune @trackdolphin/mcp --docker

# --- Stufe 2: Abhaengigkeiten (+ Build, wo es einen gibt) -------------------
FROM base AS build
WORKDIR /opt/app
# Chromium laedt nur das Scanner-Image (Dockerfile.scanner) — hier waeren es
# 150 MB Download fuer einen Browser, den dieser Prozess nie startet.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Erst die Manifeste, dann die Quellen: So laeuft `pnpm install` nur neu, wenn
# sich Abhaengigkeiten aendern — nicht bei jeder geaenderten Codezeile.
COPY --from=pruned /src/out/json/ .
COPY --from=pruned /src/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruned /src/.npmrc ./.npmrc
RUN pnpm install --frozen-lockfile
COPY --from=pruned /src/out/full/ .

# --- Stufe 3: Laufzeit -------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
# ACHTUNG: Dieses Image ist NICHT fuer Coolify gedacht.
#
# Der MCP-Server spricht ueber stdio (StdioServerTransport, src/index.ts)
# und braucht ein persoenliches TRACKDOLPHIN_TOKEN. Er ist ein Werkzeug,
# das ein MCP-Client pro Sitzung startet — kein Dienst, der auf einen Port
# hoert. Als Coolify-Anwendung endete er ohne stdin sofort und liefe in eine
# Neustartschleife. Das Image existiert zum Verteilen an Kunden:
#   docker run --rm -i -e TRACKDOLPHIN_TOKEN=… trackdolphin/mcp
WORKDIR /opt/app
COPY --chown=node:node --from=build /opt/app .
WORKDIR /opt/app/apps/mcp

# Nicht als root: Ein Ausbruch aus dem Prozess soll nicht auch noch das
# Dateisystem des Containers gehoeren.
USER node

# Kein HEALTHCHECK: Dieser Prozess spricht ueber stdin/stdout und lebt genau
# so lange wie sein Client. „Gesund" ist hier keine sinnvolle Frage.

CMD ["node", "--import", "tsx", "src/index.ts"]
