"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { createRateLimiter } from "@/lib/rate-limit";

const FENSTER_MS = 15 * 60 * 1000;

// Max. 5 Fehlversuche pro Viertelstunde und Absender.
const limiter = createRateLimiter({ max: 5, windowMs: FENSTER_MS });

/**
 * Zweite, absenderunabhängige Bremse.
 *
 * Die Bremse oben hängt an einem Schlüssel, den am Ende der Client mitliefert.
 * Selbst mit sorgfältiger Auswahl (siehe absender()) bleibt ein Restrisiko —
 * diese hier zählt einfach ALLE Fehlversuche zusammen und ist damit durch
 * keinen Header zu umgehen. Großzügig bemessen: David und Jan brauchen zwei
 * bis drei Versuche, 30 pro Viertelstunde fallen im Alltag nie auf.
 */
const gesamtLimiter = createRateLimiter({ max: 30, windowMs: FENSTER_MS });
const GESAMT = "gesamt";

/**
 * Absender-Kennung fürs Rate-Limit.
 *
 * Nicht der ERSTE x-forwarded-for-Eintrag: Cloudflare ersetzt den Header nicht,
 * sondern hängt die echte IP hinten an eine Kette an, die der Client selbst
 * beginnen darf. Wer bei jedem Versuch einen anderen Wert vorne einträgt,
 * bekommt sonst jedes Mal frische fünf Versuche.
 */
async function absender(): Promise<string> {
  const headerStore = await headers();

  // Setzt Cloudflare selbst; über den Tunnel nicht vom Client überschreibbar.
  const cloudflare = headerStore.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;

  // Sonst der LETZTE Eintrag — den hat der vertrauenswürdige Proxy angehängt.
  const kette = headerStore.get("x-forwarded-for")?.split(",") ?? [];
  const letzter = kette[kette.length - 1]?.trim();
  return letzter || "local";
}

export async function loginAction(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  const key = await absender();

  if (!gesamtLimiter.check(GESAMT)) redirect("/login?error=rate");
  if (!limiter.check(key)) redirect("/login?error=rate");

  const storedHash = process.env.ADMIN_PASSWORD_HASH;
  if (!storedHash) redirect("/login?error=config");

  if (!password || !verifyPassword(password, storedHash)) {
    redirect("/login?error=invalid");
  }

  // Erfolg löscht beide Zähler: Davids Vertipper sollen sich nicht über den
  // Tag hinweg zu einer Sperre summieren.
  limiter.reset(key);
  gesamtLimiter.reset(GESAMT);
  await createSession();
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
