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
# Migrationen laufen weiterhin als Eigentümer.
#
# Und eine DRITTE Rolle für die nächtliche Sicherung: pg_dump schaltet
# `row_security = off` und liest dann jede Tabelle — für eine Rolle ohne
# BYPASSRLS bricht Postgres das ab. Mit der Anwendungsrolle scheiterte die
# Sicherung also jede Nacht. Warum nicht einfach der Eigentümer: Der Worker
# führt yt-dlp und ffmpeg auf fremdem Videomaterial aus; ein Superuser-Zugang
# in diesem Container wäre bei einem Einbruch die ganze Datenbank. Die
# Sicherungsrolle darf lesen — mehr braucht eine Sicherung nicht.
set -e

: "${APP_DB_USER:?APP_DB_USER fehlt (siehe .env.example)}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD fehlt (siehe .env.example)}"
: "${BACKUP_DB_USER:?BACKUP_DB_USER fehlt (siehe .env.example)}"
: "${BACKUP_DB_PASSWORD:?BACKUP_DB_PASSWORD fehlt (siehe .env.example)}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v appuser="$APP_DB_USER" -v apppass="$APP_DB_PASSWORD" \
  -v backupuser="$BACKUP_DB_USER" -v backuppass="$BACKUP_DB_PASSWORD" \
  -v dbname="$POSTGRES_DB" <<-'EOSQL'
	-- psql setzt :"…" als Bezeichner und :'…' als Zeichenkette ein, jeweils
	-- korrekt maskiert. Kein Zusammenbauen von SQL per Shell.
	CREATE ROLE :"appuser" LOGIN PASSWORD :'apppass';
	GRANT CONNECT ON DATABASE :"dbname" TO :"appuser";
	GRANT USAGE ON SCHEMA public TO :"appuser";

	-- BYPASSRLS, damit pg_dump überhaupt lesen kann. NOSUPERUSER und ohne
	-- Schreibrechte: Die Tabellenrechte vergibt die Migration 0003.
	CREATE ROLE :"backupuser" LOGIN NOSUPERUSER BYPASSRLS PASSWORD :'backuppass';
	GRANT CONNECT ON DATABASE :"dbname" TO :"backupuser";
	GRANT USAGE ON SCHEMA public TO :"backupuser";
EOSQL

echo "Anwendungsrolle $APP_DB_USER angelegt (ohne BYPASSRLS — das ist Absicht)."
echo "Sicherungsrolle $BACKUP_DB_USER angelegt (BYPASSRLS, aber nur lesend)."
