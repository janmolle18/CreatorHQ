# Web-Image: Next.js im eigenständigen Ausgabepaket.
#
# Zwei Stufen, damit das laufende Bild weder node_modules noch den Quellbaum
# enthält: gebaut wird mit allem, ausgeliefert wird nur .next/standalone.

# ── Bauen ───────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS bau
WORKDIR /app

# Monorepo: erst alle Manifeste, damit npm den Graph auflösen kann und diese
# Schicht im Zwischenspeicher bleibt, solange sich keine Abhängigkeit ändert.
COPY package.json package-lock.json* ./
COPY db/package.json ./db/
COPY shared/package.json ./shared/
COPY web/package.json ./web/
COPY worker/package.json ./worker/
RUN npm install

COPY tsconfig.base.json ./
COPY db ./db
COPY shared ./shared
COPY web ./web

# Der Bau liest APP_BASE_URL für die erlaubten Absender von Server Actions.
# Ohne den Wert blockiert Next im Betrieb jede Anmeldung als Cross-Origin.
ARG APP_BASE_URL
ENV APP_BASE_URL=${APP_BASE_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run -w @creatorhq/web build

# ── Laufen ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS lauf
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Nicht als root laufen.
RUN groupadd -r knappe && useradd -r -g knappe knappe

COPY --from=bau --chown=knappe:knappe /app/web/.next/standalone ./
COPY --from=bau --chown=knappe:knappe /app/web/.next/static ./web/.next/static
COPY --from=bau --chown=knappe:knappe /app/web/public ./web/public

USER knappe
EXPOSE 3000

# Der Einstiegspunkt des eigenständigen Pakets liegt unter dem Workspace-Pfad.
CMD ["node", "web/server.js"]
