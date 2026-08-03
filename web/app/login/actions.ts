"use server";

import { db, memberships, settings, tenants, users } from "@creatorhq/db";
import { asc, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createRateLimiter } from "@/lib/rate-limit";
import { freierSlug } from "@/lib/slug";

const FENSTER_MS = 15 * 60 * 1000;

// Max. 5 Fehlversuche pro Viertelstunde und Absender.
const limiter = createRateLimiter({ max: 5, windowMs: FENSTER_MS });

/**
 * Zweite, absenderunabhängige Bremse.
 *
 * Die Bremse oben hängt an einem Schlüssel, den am Ende der Client mitliefert.
 * Selbst mit sorgfältiger Auswahl (siehe absender()) bleibt ein Restrisiko —
 * diese hier zählt einfach ALLE Fehlversuche zusammen und ist damit durch
 * keinen Header zu umgehen. Mit mehreren Kunden großzügiger bemessen als
 * beim Einzelplatz-Vorgänger.
 */
const gesamtLimiter = createRateLimiter({ max: 60, windowMs: FENSTER_MS });
const GESAMT = "gesamt";

/**
 * Absender-Kennung fürs Rate-Limit.
 *
 * Nicht der ERSTE x-forwarded-for-Eintrag: Ein vorgeschalteter Proxy ersetzt
 * den Header nicht, sondern hängt die echte IP hinten an eine Kette an, die
 * der Client selbst beginnen darf. Wer bei jedem Versuch einen anderen Wert
 * vorne einträgt, bekommt sonst jedes Mal frische fünf Versuche.
 */
async function absender(): Promise<string> {
  const headerStore = await headers();

  // Setzt Cloudflare selbst; hinter dem Proxy nicht vom Client überschreibbar.
  const cloudflare = headerStore.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;

  // Sonst der LETZTE Eintrag — den hat der vertrauenswürdige Proxy angehängt.
  const kette = headerStore.get("x-forwarded-for")?.split(",") ?? [];
  const letzter = kette[kette.length - 1]?.trim();
  return letzter || "local";
}

/**
 * Hash, gegen den bei unbekannter Adresse geprüft wird.
 *
 * Ohne das wäre die Antwortzeit der Verrat: Eine unbekannte Adresse käme
 * sofort zurück, eine bekannte erst nach dem scrypt-Durchlauf. Damit ließe
 * sich von außen abfragen, wer hier Kunde ist.
 */
const BLIND_HASH = hashPassword("kein-konto-mit-dieser-adresse");

const anmeldeSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(400),
});

export async function loginAction(formData: FormData): Promise<void> {
  const key = await absender();
  if (!gesamtLimiter.check(GESAMT)) redirect("/login?error=rate");
  if (!limiter.check(key)) redirect("/login?error=rate");

  const eingabe = anmeldeSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });
  if (!eingabe.success) redirect("/login?error=invalid");

  const { email, password } = eingabe.data!;
  const [nutzer] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Immer prüfen — auch ohne Treffer, siehe BLIND_HASH.
  const passt = verifyPassword(password, nutzer?.passwordHash ?? BLIND_HASH);
  if (!nutzer || !passt) redirect("/login?error=invalid");

  // Der zuerst angelegte Mandant ist der Normalfall; wer zu mehreren gehört,
  // wechselt später im Dashboard.
  const [mitgliedschaft] = await db
    .select({ tenantId: memberships.tenantId })
    .from(memberships)
    .where(eq(memberships.userId, nutzer.id))
    .orderBy(asc(memberships.createdAt))
    .limit(1);

  if (!mitgliedschaft) redirect("/login?error=kein-zugang");

  // Erfolg löscht beide Zähler: Vertipper sollen sich nicht über den Tag
  // hinweg zu einer Sperre summieren.
  limiter.reset(key);
  gesamtLimiter.reset(GESAMT);
  await createSession(nutzer.id, mitgliedschaft.tenantId);
  redirect("/");
}

const registrierSchema = z.object({
  email: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse").max(320),
  password: z
    .string()
    .min(12, "Mindestens 12 Zeichen — kurze Passwörter sind das häufigste Einfallstor")
    .max(400),
  creatorName: z.string().trim().min(2, "Wie heißt dein Kanal?").max(120),
});

/**
 * Selbstregistrierung: Nutzer, Mandant, Mitgliedschaft und Einstellungen in
 * EINER Transaktion. Bricht etwas ab, entsteht kein halbes Konto — ein Nutzer
 * ohne Mandant käme sonst nie am Login vorbei.
 *
 * Noch offen: Die E-Mail-Adresse wird nicht bestätigt, weil es im Projekt
 * bislang keinen Mailversand gibt. Bis der steht, kann sich jemand mit einer
 * fremden Adresse anmelden — ohne Zugriff auf deren Postfach, aber der Platz
 * ist belegt. Vor dem ersten öffentlichen Start muss die Bestätigung stehen.
 */
export async function registerAction(formData: FormData): Promise<void> {
  const key = await absender();
  if (!limiter.check(key)) redirect("/registrieren?error=rate");

  const eingabe = registrierSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    creatorName: formData.get("creatorName") ?? "",
  });
  if (!eingabe.success) {
    const meldung = eingabe.error.issues[0]?.message ?? "Eingabe unvollständig";
    redirect(`/registrieren?error=${encodeURIComponent(meldung)}`);
  }

  const { email, password, creatorName } = eingabe.data!;

  const [vorhanden] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (vorhanden) {
    redirect(
      `/registrieren?error=${encodeURIComponent("Für diese Adresse gibt es schon ein Konto")}`
    );
  }

  const passwordHash = hashPassword(password);
  const slug = await freierSlug(creatorName);

  const { userId, tenantId } = await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ name: creatorName, slug })
      .returning({ id: tenants.id });
    const [nutzer] = await tx
      .insert(users)
      .values({ email, passwordHash })
      .returning({ id: users.id });
    await tx
      .insert(memberships)
      .values({ tenantId: tenant!.id, userId: nutzer!.id, role: "owner" });

    // Ab hier wird in eine Tabelle geschrieben, die unter der Mandantenregel
    // steht. Ohne diese Zeile weist die Datenbank den nächsten INSERT ab —
    // zurecht, denn bis eben gab es den Mandanten noch nicht.
    await tx.execute(sql`select set_config('app.tenant_id', ${tenant!.id}, true)`);
    // Ohne Einstellungszeile stünde der neue Mandant vor lauter leeren Seiten.
    await tx.insert(settings).values({ tenantId: tenant!.id, creatorName });

    return { userId: nutzer!.id, tenantId: tenant!.id };
  });

  await createSession(userId, tenantId);
  redirect("/?willkommen=1");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
