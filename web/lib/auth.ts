import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Signierte HttpOnly-Session-Cookies (jose) für den einen Admin-Login.
// requireSession() ist der Pflicht-Guard in jeder Server Action / Page.

export const SESSION_COOKIE = "creatorhq_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 Tage

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET fehlt oder ist zu kurz (openssl rand -hex 32)");
  }
  return new TextEncoder().encode(secret);
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.sub === "admin";
  } catch {
    return false;
  }
}

export async function createSession(): Promise<void> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("admin")
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

export async function getSession(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return verifySessionToken(token);
}

/** Guard für Pages und Server Actions: ohne gültige Session → /login. */
export async function requireSession(): Promise<void> {
  if (!(await getSession())) redirect("/login");
}
