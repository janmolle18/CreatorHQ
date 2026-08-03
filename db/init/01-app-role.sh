#!/bin/sh
# Legt die Anwendungsrolle an — läuft einmalig beim ersten Start eines leeren
# Postgres-Datenverzeichnisses (docker-entrypoint-initdb.d).
#
# Warum eine zweite Rolle: POSTGRES_USER ist ein Superuser, und Superuser
# umgehen Row Level Security immer — auch bei FORCE ROW LEVEL SECURITY. Würde
# die Anwendung als dieser Nutzer verbinden, wären die Mandantenregeln reine
# Dekoration. Die App verbindet deshalb als creatorhq_app: darf Daten lesen
# und schreiben, kein DDL, und unterliegt den RLS-Regeln.
#
# Migrationen und die nächtliche Sicherung laufen weiterhin als Eigentümer.
set -e

: "${APP_DB_USER:?APP_DB_USER fehlt (siehe .env.example)}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD fehlt (siehe .env.example)}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v appuser="$APP_DB_USER" -v apppass="$APP_DB_PASSWORD" -v dbname="$POSTGRES_DB" <<-'EOSQL'
	-- psql setzt :"…" als Bezeichner und :'…' als Zeichenkette ein, jeweils
	-- korrekt maskiert. Kein Zusammenbauen von SQL per Shell.
	CREATE ROLE :"appuser" LOGIN PASSWORD :'apppass';
	GRANT CONNECT ON DATABASE :"dbname" TO :"appuser";
	GRANT USAGE ON SCHEMA public TO :"appuser";
EOSQL

echo "Anwendungsrolle $APP_DB_USER angelegt (ohne BYPASSRLS — das ist Absicht)."
