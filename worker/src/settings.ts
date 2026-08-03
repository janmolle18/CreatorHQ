import { settings, withTenantSession } from "@creatorhq/db";

// Betriebsschalter aus der settings-Zeile. Bewusst bei jedem Aufruf frisch
// gelesen und nicht zwischengespeichert: Wird der Schalter im Dashboard
// umgelegt, soll das sofort gelten — auch für den Worker im Container.

/**
 * Darf die App von selbst posten?
 *
 * Aus-Zustand ist der Default. Er ist kein Fehler, sondern der geplante
 * Zustand, solange die Plattform-Konten nicht verbunden und der Publish-Pfad
 * nicht geprüft sind: Alle wartenden Posts sind überfällig, ein Anschalten
 * ohne Drosselung lüde sie binnen Minuten gleichzeitig hoch.
 *
 * Fehlt die settings-Zeile (frische Datenbank), gilt ebenfalls „aus" —
 * im Zweifel nicht posten. Der Schalter gilt je Mandant: Ein Creator, der
 * seine Automatik anschaltet, schaltet sie nicht für alle anderen mit an.
 */
export async function autoPublishEnabled(tenantId: string): Promise<boolean> {
  return withTenantSession(tenantId, async (db) => {
    const [config] = await db
      .select({ autoPublish: settings.autoPublish })
      .from(settings)
      .limit(1);
    return config?.autoPublish === true;
  });
}
