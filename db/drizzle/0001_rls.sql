-- Mandantentrennung in der Datenbank verankern.
--
-- Die Anwendung filtert bereits im Code nach tenant_id. Diese Migration macht
-- daraus eine Garantie statt einer Absicht: Vergisst eine Abfrage den Filter,
-- liefert sie null Zeilen statt der Daten eines fremden Creators.
--
-- Voraussetzung ist die Rolle creatorhq_app aus db/init/01-app-role.sh — sie
-- ist bewusst KEIN Superuser, denn Superuser umgehen RLS immer.

-- ── Rechte der Anwendungsrolle ─────────────────────────────────────────────
-- Daten ja, Schema nein: Migrationen laufen weiterhin als Eigentümer.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO creatorhq_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO creatorhq_app;

-- Damit spätere Migrationen die Rechte nicht jedes Mal nachziehen müssen.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO creatorhq_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO creatorhq_app;

-- ── Mandantenregel auf allen Datentabellen ─────────────────────────────────
-- Nicht dabei: tenants, users, memberships. Die definieren die Grenze, statt
-- in ihr zu liegen — die Anmeldung muss eine E-Mail-Adresse nachschlagen
-- können, bevor überhaupt ein Mandant feststeht. Sie werden im Code gehütet.
DO $$
DECLARE
  tabelle text;
BEGIN
  FOREACH tabelle IN ARRAY ARRAY[
    'settings', 'social_accounts', 'source_videos', 'clips', 'posts',
    'metrics_snapshots', 'comments', 'briefings', 'ideas', 'calendar_items'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabelle);
    -- FORCE: Ohne das wäre der Tabelleneigentümer von seinen eigenen Regeln
    -- ausgenommen — und genau als Eigentümer laufen die Migrationen.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tabelle);

    -- nullif(): Eine nicht gesetzte Einstellung liefert NULL, eine geleerte
    -- den Leerstring. Ohne nullif würde ''::uuid einen Fehler werfen statt
    -- sauber zu sperren. So ist beides gleich: kein Mandant, keine Zeilen.
    EXECUTE format($regel$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    $regel$, tabelle);
  END LOOP;
END $$;
