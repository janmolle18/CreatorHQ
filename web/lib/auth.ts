import {
  db,
  memberships,
  tenants,
  users,
  withTenant,
  type MembershipRole,
  type TenantDB,
  type TenantStatus,
} from "@creatorhq/db";
import { and, eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Signierte HttpOnly-Sitzungen (jose). Der Keks trägt, WER angemeldet ist und
// FÜR WEN gearbeitet wird — beides wird bei jeder Anfrage gegen die Datenbank
// geprüft, nicht nur aus dem Keks geglaubt.

export const SESSION_COOKIE = "creatorhq_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 Tage

export interface Session {
  userId: string;
  email: string;
  tenantId: string;
  tenantName: string;
  tenantStatus: TenantStatus;
  role: MembershipRole;
  /** Jans Blick über alle Mandanten — schaltet die Admin-Zentrale frei. */
  isPlatformAdmin: boolean;
  /** Adresse bestätigt? Unbestätigte kommen nur auf /bestaetigen. */
  emailVerified: boolean;
}

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET fehlt oder ist zu kurz (openssl rand -hex 32)");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(userId: string, tenantId: string): Promise<void> {
  const token = await new SignJWT({ tid: tenantId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecret());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Liest die Sitzung und prüft sie gegen die Datenbank.
 *
 * Die Mitgliedschaft wird bei JEDER Anfrage nachgeschlagen statt dem Keks
 * geglaubt. Ohne das behielte ein entferntes Teammitglied bis zu 30 Tage
 * Zugriff — so lange gilt der Keks. Eine Abfrage auf einem eindeutigen Index
 * ist der Preis dafür, und der ist niedrig.
 */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let userId: string;
  let tenantId: string;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.sub !== "string" || typeof payload.tid !== "string") return null;
    userId = payload.sub;
    tenantId = payload.tid;
  } catch {
    return null;
  }

  const [zeile] = await db
    .select({
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      isPlatformAdmin: users.isPlatformAdmin,
      role: memberships.role,
      tenantName: tenants.name,
      tenantStatus: tenants.status,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId)))
    .limit(1);

  if (!zeile) return null;
  // Gekündigt heißt: kein Zugang mehr. "suspended" bleibt bewusst offen —
  // wer eine Rechnung übersieht, soll seine Daten noch sehen können.
  if (zeile.tenantStatus === "cancelled") return null;

  return {
    userId,
    email: zeile.email,
    tenantId,
    tenantName: zeile.tenantName,
    tenantStatus: zeile.tenantStatus,
    role: zeile.role,
    isPlatformAdmin: zeile.isPlatformAdmin,
    emailVerified: zeile.emailVerifiedAt !== null,
  };
}

/**
 * Guard für Seiten und Server Actions: ohne gültige Sitzung → /login,
 * ohne bestätigte Adresse → /bestaetigen.
 *
 * Die Bestätigung sitzt hier und nicht nur in der Oberfläche: Sonst käme man
 * mit einer geratenen Adresse zwar nicht ins Dashboard, könnte aber Server
 * Actions direkt aufrufen — und die sind eine öffentliche Schnittstelle.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.emailVerified) redirect("/bestaetigen");
  return session;
}

/**
 * Guard für Vertragliches: Konten verbinden, Abo ändern, Mitglieder einladen.
 * Ein Editor darf Clips freigeben und posten, aber nichts davon.
 */
export async function requireOwner(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "owner") {
    redirect("/?fehler=" + encodeURIComponent("Dafür fehlt dir die Berechtigung"));
  }
  return session;
}

/**
 * Der Normalweg zu Mandantendaten: Sitzung prüfen und in einem Zug die
 * Mandantengrenze setzen.
 *
 * Wer stattdessen `db` direkt benutzt, bekommt dank RLS keine Zeilen — der
 * Fehler fällt also sofort auf, statt still fremde Daten zu liefern.
 *
 * ⚠️ NIEMALS redirect() oder notFound() innerhalb von `arbeit` aufrufen.
 * Beide arbeiten in Next.js über eine geworfene Ausnahme; innerhalb der
 * Transaktion nimmt die Datenbank das als Abbruch und rollt alles zurück,
 * was gerade geschrieben wurde. Erst den Block verlassen, dann umleiten.
 */
export async function mitMandant<T>(
  arbeit: (tx: TenantDB, session: Session) => Promise<T>
): Promise<T> {
  const session = await requireSession();
  return withTenant(session.tenantId, (tx) => arbeit(tx, session));
}
