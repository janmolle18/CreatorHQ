import { db, tenants } from "@creatorhq/db";
import { eq } from "drizzle-orm";

// Kurzname eines Mandanten: Unterordner im Speicher, später eigene Adressen.
// Muss dauerhaft eindeutig und URL-tauglich sein.

const ERSATZ: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  ß: "ss",
};

/** „Müller & Söhne!" → „mueller-soehne". Leer, wenn nichts Brauchbares bleibt. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äöüß]/g, (zeichen) => ERSATZ[zeichen] ?? zeichen)
    // Akzente abtrennen und wegwerfen (é → e), bevor alles Übrige fällt.
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Freier Kurzname zu einem Anzeigenamen.
 *
 * Zwei Creator dürfen gleich heißen — der Kurzname bekommt dann eine Ziffer.
 * Die Schleife ist begrenzt: Danach entscheidet ein Zufallsanhang, damit eine
 * Registrierung nie an einem Namensstreit hängen bleibt.
 */
export async function freierSlug(name: string): Promise<string> {
  const basis = slugify(name) || "creator";

  for (let n = 0; n < 20; n += 1) {
    const kandidat = n === 0 ? basis : `${basis}-${n + 1}`;
    const [belegt] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, kandidat))
      .limit(1);
    if (!belegt) return kandidat;
  }

  return `${basis}-${Math.random().toString(36).slice(2, 8)}`;
}
