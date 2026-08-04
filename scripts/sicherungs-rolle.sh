#!/usr/bin/env bash
# Legt die Sicherungsrolle in einer BESTEHENDEN Datenbank an.
#
# db/init/01-app-role.sh läuft nur beim allerersten Start eines leeren
# Postgres-Datenverzeichnisses. Wer CreatorHQ schon vorher aufgesetzt hat,
# holt die Rolle hiermit nach — sonst scheitert die nächtliche Sicherung
# stillschweigend an der Mandantenregel (siehe worker/src/jobs/backup.ts).
#
# Aufruf aus dem Projektwurzelverzeichnis:
#   ./scripts/sicherungs-rolle.sh
#
# Idempotent: Ein zweiter Aufruf setzt nur das Passwort auf den Wert aus .env.
set -euo pipefail

cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Keine .env gefunden. Erst .env.example kopieren und ausfuellen." >&2; exit 1; }

# Nur die zwei Namen einlesen, die hier gebraucht werden — nicht die ganze
# .env in die Umgebung kippen. Umschliessende Anfuehrungszeichen fallen weg.
lies_env() {
  grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

BACKUP_DB_USER=$(lies_env BACKUP_DB_USER)
BACKUP_DB_PASSWORD=$(lies_env BACKUP_DB_PASSWORD)

if [ -z "$BACKUP_DB_USER" ] || [ -z "$BACKUP_DB_PASSWORD" ]; then
  echo "BACKUP_DB_USER oder BACKUP_DB_PASSWORD fehlen in .env (siehe .env.example)." >&2
  exit 1
fi

echo "Lege Rolle $BACKUP_DB_USER an bzw. aktualisiere sie …"

# Läuft IM Container als Eigentümer — dessen Zugangsdaten stehen dort schon in
# der Umgebung und müssen nicht durch dieses Skript wandern. Name und Passwort
# gehen als Umgebungsvariablen hinein, nicht in die Befehlszeile: Sonst stünden
# sie in der Prozessliste.
#
# \gexec statt eines DO-Blocks: psql ersetzt :'…' NICHT innerhalb von
# Dollar-Quoting, ein DO-Block käme also nie an die Werte heran.
docker compose exec -T \
  -e ROLLE="$BACKUP_DB_USER" -e GEHEIM="$BACKUP_DB_PASSWORD" \
  postgres \
  sh -c 'psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
           -v u="$ROLLE" -v p="$GEHEIM" -f -' <<'EOSQL'
select format(
  '%s ROLE %I LOGIN NOSUPERUSER BYPASSRLS PASSWORD %L',
  case when exists (select 1 from pg_roles where rolname = :'u') then 'ALTER' else 'CREATE' end,
  :'u', :'p'
) \gexec

select format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'u') \gexec
select format('GRANT USAGE ON SCHEMA public TO %I', :'u') \gexec

-- Die Rechte gleich mit, nicht erst per Migration: Drizzle spielt eine bereits
-- angewandte Migration nicht noch einmal ab, ein Nachtragen ueber den
-- Migrationsweg griffe hier also ins Leere.
select format('GRANT SELECT ON ALL TABLES IN SCHEMA public TO %I', :'u') \gexec
select format('GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', :'u') \gexec
select format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO %I', :'u') \gexec
select format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO %I', :'u') \gexec

-- Auch das Migrations-Buch: pg_dump sperrt ALLE zu sichernden Tabellen in
-- EINEM LOCK TABLE. Fehlt das Recht auf eine einzige, bricht der ganze Dump ab.
select format('GRANT USAGE ON SCHEMA drizzle TO %I', :'u')
  where exists (select 1 from pg_namespace where nspname = 'drizzle') \gexec
select format('GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO %I', :'u')
  where exists (select 1 from pg_namespace where nspname = 'drizzle') \gexec
-- Auch die Sequenz: pg_dump liest last_value jeder Sequenz einzeln.
select format('GRANT SELECT ON ALL SEQUENCES IN SCHEMA drizzle TO %I', :'u')
  where exists (select 1 from pg_namespace where nspname = 'drizzle') \gexec

\echo 'Rolle und Leserechte stehen.'
EOSQL

echo
echo "Jetzt BACKUP_DATABASE_URL in .env eintragen (siehe .env.example)."
echo "Probe:  docker compose exec -T postgres sh -c 'PGPASSWORD=… pg_dump -h localhost -U $BACKUP_DB_USER -d \$POSTGRES_DB | wc -c'"
