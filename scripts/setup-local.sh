#!/bin/bash
# Einmalige Einrichtung für die lokale Entwicklung.
#
#   npm run setup
#
# Legt eine .env mit frisch gewürfelten LOKALEN Zugangsdaten an, startet die
# drei Container und spielt die Migrationen ein. Danach läuft `npm run web:dev`.
#
# Die Plattform-Schlüssel (Google, TikTok, Meta, Anthropic) bleiben bewusst
# leer — die gehören dir und trägst du selbst ein. Ohne sie funktioniert alles
# außer Verbinden, Clippen und Briefing.
set -euo pipefail

WURZEL="$(cd "$(dirname "$0")/.." && pwd)"
cd "$WURZEL"

blau() { printf '\033[1;34m%s\033[0m\n' "$1"; }
grau() { printf '\033[2m%s\033[0m\n' "$1"; }

command -v docker >/dev/null || { echo "Docker fehlt. Docker Desktop starten."; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker läuft nicht. Docker Desktop starten."; exit 1; }

# ── 1. .env ────────────────────────────────────────────────────────────────
if [ -f .env ]; then
  grau "1/4  .env existiert — bleibt unangetastet."
else
  blau "1/4  .env anlegen (lokale Zugangsdaten werden gewürfelt)"
  DB_PASS="$(openssl rand -hex 16)"
  APP_PASS="$(openssl rand -hex 16)"
  MINIO_PASS="$(openssl rand -hex 16)"

  sed \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${DB_PASS}|" \
    -e "s|^APP_DB_PASSWORD=.*|APP_DB_PASSWORD=${APP_PASS}|" \
    -e "s|^MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=${MINIO_PASS}|" \
    -e "s|^S3_SECRET_KEY=.*|S3_SECRET_KEY=${MINIO_PASS}|" \
    -e "s|^DATABASE_URL=.*|DATABASE_URL=postgres://creatorhq_app:${APP_PASS}@localhost:5435/creatorhq|" \
    -e "s|^MIGRATION_DATABASE_URL=.*|MIGRATION_DATABASE_URL=postgres://creatorhq:${DB_PASS}@localhost:5435/creatorhq|" \
    -e "s|^APP_ENCRYPTION_KEY=.*|APP_ENCRYPTION_KEY=$(openssl rand -hex 32)|" \
    -e "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" \
    -e "s|^APP_BASE_URL=.*|APP_BASE_URL=http://localhost:3001|" \
    .env.example > .env
  chmod 600 .env
  grau "     Erzeugt. Plattform-Schlüssel bleiben leer — die trägst du selbst ein."
fi

# ── 2. Container ───────────────────────────────────────────────────────────
blau "2/4  Container starten (Postgres 5435, Redis 6381, MinIO 9004)"
docker compose up -d postgres redis minio

printf '     warte auf Postgres'
for _ in $(seq 1 60); do
  if docker compose exec -T postgres pg_isready -U creatorhq -d creatorhq >/dev/null 2>&1; then
    printf ' bereit\n'; break
  fi
  printf '.'; sleep 1
done

# ── 3. Migrationen ─────────────────────────────────────────────────────────
blau "3/4  Migrationen einspielen (Schema + Mandantenregeln)"
npm run db:migrate --silent

# ── 4. Fertig ──────────────────────────────────────────────────────────────
blau "4/4  Fertig."
echo
echo "  Starten:   npm run web:dev"
echo "  Ansehen:   http://localhost:3001/registrieren"
echo
grau "  Ein Schwesterprojekt auf Port 3000 läuft parallel weiter — die beiden stören sich nicht."
