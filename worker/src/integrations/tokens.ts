import { db, socialAccounts, type SocialAccount } from "@creatorhq/db";
import { decryptSecret, encryptSecret } from "@creatorhq/shared";
import { eq } from "drizzle-orm";
import { logger } from "../logger.ts";
import { TokenExpiredError } from "./errors.ts";
import { refreshIgToken } from "./instagram.ts";
import { withLock } from "./redis-lock.ts";
import { refreshAccessToken as refreshTiktok } from "./tiktok.ts";
import { refreshGoogleToken } from "./youtube-upload.ts";

interface RefreshedTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}

/** Plattform-spezifischer Refresh (Instagram folgt in Phase 7). */
async function refreshForPlatform(
  platform: SocialAccount["platform"],
  refreshToken: string
): Promise<RefreshedTokens> {
  switch (platform) {
    case "tiktok": {
      const tokens = await refreshTiktok(refreshToken);
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || null,
        expiresAt: tokens.expiresAt,
      };
    }
    case "youtube":
      return refreshGoogleToken(refreshToken);
    case "instagram": {
      // IG refresht mit dem Long-lived-Token selbst; das neue Token ersetzt beides.
      const tokens = await refreshIgToken(refreshToken);
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.accessToken,
        expiresAt: tokens.expiresAt,
      };
    }
    default:
      throw new TokenExpiredError(`Kein Token-Refresh für ${platform} implementiert`);
  }
}

// Token-Verwaltung mit Redis-Lock: genau EIN Job refresht pro Account
// (behebt ClipPilots Refresh-Race bei concurrency > 1). Tokens liegen
// ausschließlich verschlüsselt in der DB (AES-256-GCM).

const REFRESH_LEEWAY_MS = 5 * 60 * 1000;
const LOCK_TTL_MS = 30_000;

async function loadAccount(accountId: string): Promise<SocialAccount | null> {
  const [account] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.id, accountId));
  return account ?? null;
}

/**
 * Liefert ein gültiges Access-Token (refresht unter Lock, wenn nötig).
 * Bei invalid_grant: Account → "expired" (UI zeigt „Neu verbinden") + Throw.
 */
export async function withFreshToken(accountId: string): Promise<string> {
  const account = await loadAccount(accountId);
  if (!account?.accessTokenEnc) {
    throw new TokenExpiredError("Kein Token gespeichert — Account neu verbinden");
  }

  const stillValid =
    account.tokenExpiresAt &&
    account.tokenExpiresAt.getTime() > Date.now() + REFRESH_LEEWAY_MS;
  if (stillValid) return decryptSecret(account.accessTokenEnc);

  return withLock(`lock:token:${accountId}`, LOCK_TTL_MS, async () => {
    // Unter dem Lock neu lesen — ein anderer Job kann schon refresht haben.
    const fresh = await loadAccount(accountId);
    if (!fresh?.accessTokenEnc) {
      throw new TokenExpiredError("Kein Token gespeichert — Account neu verbinden");
    }
    if (
      fresh.tokenExpiresAt &&
      fresh.tokenExpiresAt.getTime() > Date.now() + REFRESH_LEEWAY_MS
    ) {
      return decryptSecret(fresh.accessTokenEnc);
    }
    if (!fresh.refreshTokenEnc) {
      await markExpired(accountId, "Kein Refresh-Token vorhanden");
      throw new TokenExpiredError("Kein Refresh-Token — Account neu verbinden");
    }

    try {
      const tokens = await refreshForPlatform(
        fresh.platform,
        decryptSecret(fresh.refreshTokenEnc)
      );
      await db
        .update(socialAccounts)
        .set({
          accessTokenEnc: encryptSecret(tokens.accessToken),
          refreshTokenEnc: tokens.refreshToken
            ? encryptSecret(tokens.refreshToken)
            : fresh.refreshTokenEnc,
          tokenExpiresAt: tokens.expiresAt,
          status: "connected",
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(socialAccounts.id, accountId));
      logger.info({ accountId, platform: fresh.platform }, "tokens: refresht");
      return tokens.accessToken;
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        await markExpired(accountId, error.message);
      }
      throw error;
    }
  });
}

async function markExpired(accountId: string, reason: string): Promise<void> {
  await db
    .update(socialAccounts)
    .set({ status: "expired", lastError: reason.slice(0, 300), updatedAt: new Date() })
    .where(eq(socialAccounts.id, accountId));
  logger.warn({ accountId, reason }, "tokens: Account als expired markiert");
}
