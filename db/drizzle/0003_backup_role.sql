-- Leserechte für die Sicherungsrolle.
--
-- Die Rolle selbst legt db/init/01-app-role.sh an (dort liegt das Passwort).
-- Hier stehen nur die Rechte — die kann es erst geben, wenn die Tabellen da
-- sind, und das ist nach der Migration 0000.
--
-- Warum das defensiv geschrieben ist: Bestehende Installationen haben die
-- Rolle noch nicht (das init-Skript läuft nur beim ersten Start eines leeren
-- Datenverzeichnisses). Ohne den DO-Block würde diese Migration dort
-- abbrechen und den gesamten Migrationslauf mitreissen. Wer sie nachträgt,
-- ruft scripts/sicherungs-rolle.sh auf — das setzt die Rechte hier mit.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'creatorhq_backup') THEN
    RAISE NOTICE 'Rolle creatorhq_backup fehlt — Rechte uebersprungen. Ohne sie gibt es KEINE Sicherung; nachtragen mit scripts/sicherungs-rolle.sh';
    RETURN;
  END IF;

  -- Nur lesen. Eine Sicherung, die schreiben darf, ist ein zweiter Angriffsweg
  -- auf dieselben Daten.
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO creatorhq_backup;
  GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO creatorhq_backup;

  -- Auch das Migrations-Buch von drizzle. Nicht aus Ordnungsliebe: pg_dump
  -- sperrt ALLE Tabellen, die es sichert, in einem einzigen LOCK TABLE — fehlt
  -- das Recht auf eine einzige davon, bricht der gesamte Dump ab. Und eine
  -- Sicherung ohne __drizzle_migrations wäre beim Zurückspielen eine Datenbank,
  -- die glaubt, sie habe noch keine Migration gesehen.
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle') THEN
    GRANT USAGE ON SCHEMA drizzle TO creatorhq_backup;
    GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO creatorhq_backup;
    -- Auch die Sequenz: pg_dump liest last_value jeder Sequenz einzeln, und
    -- ein fehlendes Recht dort bricht den Dump genauso ab wie bei einer Tabelle.
    GRANT SELECT ON ALL SEQUENCES IN SCHEMA drizzle TO creatorhq_backup;
    ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle GRANT SELECT ON TABLES TO creatorhq_backup;
  END IF;

  -- Damit spätere Migrationen die Rechte nicht jedes Mal nachziehen müssen.
  -- Gilt für Tabellen, die der EIGENTÜMER anlegt — und genau als der laufen
  -- die Migrationen.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO creatorhq_backup;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO creatorhq_backup;
END $$;
