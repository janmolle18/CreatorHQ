#!/usr/bin/env -S npx tsx
/**
 * Betreiber-Zugang anlegen oder ein bestehendes Konto dazu befördern.
 *
 *   npm run admin -- betreiber@example.de "ein langes Passwort"
 *   npm run admin -- betreiber@example.de            (nur befördern)
 *
 * Warum ein Skript und kein Knopf in der Oberfläche: Ein Betreiber sieht und
 * betritt JEDEN Kundenkanal. Wäre das über die Anwendung vergebbar, wäre der
 * kürzeste Weg zu allen Kundendaten eine einzige übersehene Rechteprüfung.
 * So braucht es Zugriff auf den Rechner, auf dem die Datenbank läuft.
 *
 * Legt zusätzlich einen EIGENEN Kanal an, falls noch keiner da ist — ohne den
 * wäre der Betreiber ausgesperrt, sobald er einen fremden Kanal verlässt.
 */
import { config } from "dotenv";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";

config({ path: path.resolve(process.cwd(), ".env") });

const { db, memberships, settings, tenants, users } = await import("@creatorhq/db");

// Gleiches Format wie web/lib/password.ts — bewusst nachgebaut statt
// importiert: Der Web-Baum hängt an Next-Pfadkürzeln, die hier nicht gelten.
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;

function hashPassword(passwort: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(passwort, salt, 64, SCRYPT);
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join(":");
}

function slugAus(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[äöüß]/g, (z) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" })[z] ?? z)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "betreiber"
  );
}

const [emailRoh, passwort] = process.argv.slice(2);
const email = emailRoh?.trim().toLowerCase();

if (!email || !email.includes("@")) {
  console.error(
    "Aufruf: npm run admin -- <e-mail> [passwort]\n" +
      "  mit Passwort  → legt das Konto an (mindestens 12 Zeichen)\n" +
      "  ohne Passwort → befördert ein bestehendes Konto zum Betreiber"
  );
  process.exit(1);
}
if (passwort !== undefined && passwort.length < 12) {
  console.error("Passwort zu kurz — mindestens 12 Zeichen.");
  process.exit(1);
}

const [vorhanden] = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.email, email))
  .limit(1);

let userId: string;

if (vorhanden) {
  userId = vorhanden.id;
  await db
    .update(users)
    .set({
      isPlatformAdmin: true,
      // Wer am Rechner steht, muss keine Mail bestätigen.
      emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
      ...(passwort ? { passwordHash: hashPassword(passwort) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  console.log(`Bestehendes Konto ${email} ist jetzt Betreiber.`);
  if (passwort) console.log("Passwort wurde ersetzt.");
} else {
  if (!passwort) {
    console.error(`Es gibt kein Konto ${email}. Beim Anlegen ist das Passwort Pflicht.`);
    process.exit(1);
  }
  const [neu] = await db
    .insert(users)
    .values({
      email,
      passwordHash: hashPassword(passwort),
      emailVerifiedAt: new Date(),
      isPlatformAdmin: true,
    })
    .returning({ id: users.id });
  userId = neu!.id;
  console.log(`Konto ${email} angelegt und als Betreiber gekennzeichnet.`);
}

// Eigener Kanal — der Rückweg aus jedem fremden.
const [eigener] = await db
  .select({ tenantId: memberships.tenantId })
  .from(memberships)
  .where(eq(memberships.userId, userId))
  .orderBy(asc(memberships.createdAt))
  .limit(1);

if (eigener) {
  const [kanal] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, eigener.tenantId))
    .limit(1);
  console.log(`Eigener Kanal vorhanden: ${kanal?.name ?? eigener.tenantId}`);
} else {
  const name = "Betreiber-Werkstatt";
  let slug = slugAus(name);
  // Kollisionen sind bei einem festen Namen unwahrscheinlich, aber der
  // Kurzname ist eindeutig — ohne Zusatz stünde hier sonst ein Abbruch.
  for (let n = 2; ; n++) {
    const [belegt] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);
    if (!belegt) break;
    slug = `${slugAus(name)}-${n}`;
  }

  await db.transaction(async (tx) => {
    const [kanal] = await tx.insert(tenants).values({ name, slug }).returning({ id: tenants.id });
    await tx.insert(memberships).values({ tenantId: kanal!.id, userId, role: "owner" });
    // settings steht unter der Mandantenregel — ohne diese Zeile weist die
    // Datenbank den nächsten INSERT ab, und das zu Recht.
    await tx.execute(sql`select set_config('app.tenant_id', ${kanal!.id}, true)`);
    await tx.insert(settings).values({ tenantId: kanal!.id, creatorName: name });
  });
  console.log(`Eigener Kanal „${name}" angelegt — dein Rückweg aus fremden Kanälen.`);
}

console.log("\nAnmelden unter /login mit dieser Adresse. Die Zentrale liegt auf /zentrale.");
process.exit(0);
