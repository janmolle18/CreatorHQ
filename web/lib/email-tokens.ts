import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db, emailTokens, users, type EmailTokenPurpose } from "@creatorhq/db";
import { and, eq, isNull } from "drizzle-orm";

// Einmal-Token für Adressbestätigung und Passwort-Zurücksetzen.
//
// Drei Regeln, die zusammen die Sicherheit tragen:
//   1. In der Datenbank steht NUR der Hash. Wer sie liest, kann kein Token
//      benutzen — genau wie beim Passwort.
//   2. Ein Token gilt genau einmal und läuft ab.
//   3. Ein neues Token entwertet die alten desselben Zwecks. Sonst blieben
//      nach mehrmaligem „nochmal senden" mehrere gültige Schlüssel im Umlauf.

/** Bestätigung darf liegen bleiben, Passwort-Zurücksetzen nicht. */
const GUELTIG_MS: Record<EmailTokenPurpose, number> = {
  verify: 7 * 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
};

function hashe(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Legt ein Token an und gibt den KLARTEXT zurück — der einzige Moment, in dem
 * er existiert. Er geht direkt in die Mail und wird nirgends gespeichert.
 */
export async function erzeugeToken(
  userId: string,
  purpose: EmailTokenPurpose
): Promise<string> {
  const token = randomBytes(32).toString("base64url");

  await db.transaction(async (tx) => {
    // Alte, noch offene Token desselben Zwecks entwerten.
    await tx
      .update(emailTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(emailTokens.userId, userId),
          eq(emailTokens.purpose, purpose),
          isNull(emailTokens.usedAt)
        )
      );

    await tx.insert(emailTokens).values({
      userId,
      purpose,
      tokenHash: hashe(token),
      expiresAt: new Date(Date.now() + GUELTIG_MS[purpose]),
    });
  });

  return token;
}

export interface EingeloestesToken {
  userId: string;
  email: string;
}

/**
 * Löst ein Token ein: prüft Gültigkeit und markiert es als verbraucht.
 * Gibt null zurück, wenn es unbekannt, abgelaufen oder schon benutzt ist —
 * alle drei Fälle bewusst ununterscheidbar, damit sich von außen nicht
 * ausprobieren lässt, welche Token es gibt.
 */
export async function loeseTokenEin(
  token: string,
  purpose: EmailTokenPurpose
): Promise<EingeloestesToken | null> {
  if (!token || token.length > 200) return null;
  const hash = hashe(token);

  return db.transaction(async (tx) => {
    const [zeile] = await tx
      .select({
        id: emailTokens.id,
        tokenHash: emailTokens.tokenHash,
        expiresAt: emailTokens.expiresAt,
        usedAt: emailTokens.usedAt,
        userId: users.id,
        email: users.email,
      })
      .from(emailTokens)
      .innerJoin(users, eq(users.id, emailTokens.userId))
      .where(and(eq(emailTokens.tokenHash, hash), eq(emailTokens.purpose, purpose)))
      .limit(1);

    if (!zeile) return null;

    // Zeitsicherer Vergleich, obwohl schon per Index gefunden: Die Suche
    // selbst könnte über die Antwortzeit verraten, wie weit ein geratener
    // Hash passt.
    const a = Buffer.from(zeile.tokenHash);
    const b = Buffer.from(hash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    if (zeile.usedAt !== null) return null;
    if (zeile.expiresAt.getTime() < Date.now()) return null;

    // Atomarer Anspruch statt Lesen-Prüfen-Schreiben: Zwei gleichzeitige
    // Klicks auf denselben Link (Mail-Vorschau des Anbieters plus Mensch)
    // lesen beide `usedAt = null`. Nur wer hier eine Zeile zurückbekommt, hat
    // das Token wirklich verbraucht.
    const [beansprucht] = await tx
      .update(emailTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(emailTokens.id, zeile.id), isNull(emailTokens.usedAt)))
      .returning({ id: emailTokens.id });
    if (!beansprucht) return null;

    return { userId: zeile.userId, email: zeile.email };
  });
}
