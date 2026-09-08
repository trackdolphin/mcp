# syntax=docker/dockerfile:1
# ───────────────────────────────────────────────────────────────────────────
# Trackdolphin · MCP-Server (gehosteter Weg — Streamable HTTP)
#
# Dieses Image startet den HTTP-Weg (src/http.ts), nicht den stdio-Weg
# (src/index.ts). Beide teilen sich denselben Kern (src/core.ts); der
# Unterschied ist nur, woher Transport und Schlüssel kommen:
#   - stdio (src/index.ts): EIN TRACKDOLPHIN_TOKEN pro Prozess, gestartet vom
#     MCP-Client selbst (`npx @trackdolphin/mcp`) — dafuer gibt es kein
#     Docker-Image, `docker run -i` ohne Gegenüber haette niemanden, mit dem
#     der Prozess redet.
#   - HTTP (src/http.ts, dieses Image): EIN Prozess fuer alle Kundinnen, der
#     Schlüssel kommt mit jeder Anfrage im Authorization-Header und wird nur
#     durchgereicht, nie im Prozess gehalten — siehe die Kommentare in
#     src/http.ts. Deshalb hoert dieser Dienst auf einen Port und gehoert
#     als Dauer-App nach Coolify, im Gegensatz zum stdio-Weg.
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
# PORT ist der Name, den Container-Plattformen setzen (siehe apps/collector).
# TRACKDOLPHIN_URL zeigt auf das Backend, dessen OpenAPI-Beschreibung beim
# Start einmal geladen wird — kein TRACKDOLPHIN_TOKEN hier: Dieser Prozess
# hat keinen eigenen Schlüssel, jede Anfrage bringt ihren eigenen mit.
ENV PORT=8788
WORKDIR /opt/app
COPY --chown=node:node --from=build /opt/app .
WORKDIR /opt/app/apps/mcp

# Nicht als root: Ein Ausbruch aus dem Prozess soll nicht auch noch das
# Dateisystem des Containers gehoeren.
USER node

EXPOSE 8788

# busybox-wget statt curl — es ist ohnehin im Image, ein zusaetzliches Paket
# waere nur mehr Angriffsflaeche fuer eine GET-Anfrage. /healthz antwortet
# ohne Schlüssel (siehe src/http.ts) — der Healthcheck braucht keinen.
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8788/healthz || exit 1

CMD ["node", "--import", "tsx", "src/http.ts"]
