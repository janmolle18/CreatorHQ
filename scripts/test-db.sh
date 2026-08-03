#!/bin/bash
# Wegwerf-Datenbank für die Mandantentrennungs-Tests.
#
# Startet einen eigenen Postgres-Container (Port 55999, eigener Name), legt die
# eingeschränkte Anwendungsrolle an, spielt alle Migrationen ein und säht zwei
# Mandanten mit je eigenen Clips. Rührt weder die Entwicklungs- noch die
# Produktionsdatenbank an; die Zugangsdaten sind absichtlich wertlos.
#
#   ./scripts/test-db.sh up      # starten und einrichten
#   ./scripts/test-db.sh down    # wegwerfen
#   ./scripts/test-db.sh test    # starten, testen, wegwerfen
set -euo pipefail

BEHAELTER=creatorhq-testdb
PORT=55999
PASSWORT=wegwerf
URL="postgres://creatorhq_app:${PASSWORT}@localhost:${PORT}/t"
WURZEL="$(cd "$(dirname "$0")/.." && pwd)"

A=11111111-1111-1111-1111-111111111111
B=22222222-2222-2222-2222-222222222222

hoch() {
  docker rm -f "$BEHAELTER" >/dev/null 2>&1 || true
  docker run -d --name "$BEHAELTER" \
    -e POSTGRES_PASSWORD="$PASSWORT" -e POSTGRES_USER=owner -e POSTGRES_DB=t \
    -p "127.0.0.1:${PORT}:5432" postgres:16-alpine >/dev/null

  for _ in $(seq 1 30); do
    docker exec "$BEHAELTER" pg_isready -U owner -d t >/dev/null 2>&1 && break
    sleep 1
  done

  # Dieselbe Rolle wie in db/init/01-app-role.sh — bewusst ohne Superuser-Recht,
  # sonst wären die RLS-Regeln wirkungslos und die Tests grün ohne Aussage.
  docker exec -i "$BEHAELTER" psql -q -v ON_ERROR_STOP=1 -U owner -d t -c "
    CREATE ROLE creatorhq_app LOGIN PASSWORD '${PASSWORT}';
    GRANT CONNECT ON DATABASE t TO creatorhq_app;
    GRANT USAGE ON SCHEMA public TO creatorhq_app;"

  for datei in "$WURZEL"/db/drizzle/*.sql; do
    docker exec -i "$BEHAELTER" psql -q -v ON_ERROR_STOP=1 -U owner -d t < "$datei"
  done

  docker exec -i "$BEHAELTER" psql -q -v ON_ERROR_STOP=1 -U owner -d t -c "
    INSERT INTO tenants (id, name, slug) VALUES
      ('${A}','Creator A','a'), ('${B}','Creator B','b');
    INSERT INTO clips (tenant_id, status) VALUES
      ('${A}','candidate'), ('${A}','candidate'), ('${B}','candidate');"

  echo "Bereit. TEST_DATABASE_URL=${URL}"
}

runter() { docker rm -f "$BEHAELTER" >/dev/null 2>&1 || true; echo "Weggeworfen."; }

case "${1:-test}" in
  up) hoch ;;
  down) runter ;;
  test)
    hoch
    ( cd "$WURZEL" && TEST_DATABASE_URL="$URL" npx vitest run db/src/tenant.test.ts )
    ergebnis=$?
    runter
    exit $ergebnis
    ;;
  *) echo "Nutzung: $0 [up|down|test]" >&2; exit 1 ;;
esac
