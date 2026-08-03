import { db, socialAccounts, type SocialAccount } from "@creatorhq/db";
import { PLATFORM_LABELS, PUBLISH_PLATFORMS, type PublishPlatform } from "@creatorhq/shared";
import { Button, Field, Input, PageHeader, StatusText } from "@/components/ui";
import { savePostingPlanAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<
  SocialAccount["status"],
  { label: string; tone: "ok" | "warn" | "err" | "muted" }
> = {
  connected: { label: "Verbunden", tone: "ok" },
  disconnected: { label: "Nicht verbunden", tone: "muted" },
  expired: { label: "Abgelaufen — neu verbinden", tone: "err" },
  disabled: { label: "Pausiert", tone: "warn" },
};

const CONNECT: Record<PublishPlatform, { href: string | null; hint: string }> = {
  tiktok: {
    href: "/api/oauth/tiktok/authorize",
    hint: "Content Posting API (Sandbox) — ohne Audit landen Posts als Entwurf in Davids Inbox.",
  },
  youtube: {
    href: "/api/oauth/google/authorize",
    hint: "Bis zum bestandenen API-Audit lädt die API privat hoch — Veröffentlichung dann in YouTube Studio (2 Klicks).",
  },
  instagram: {
    href: "/api/oauth/instagram/authorize",
    hint: "Instagram-Login (Dev-Modus): David muss als Instagram-Tester bestätigt sein; Reels brauchen die öffentliche Medien-URL (Tunnel/Domain).",
  },
};

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; connected?: string; error?: string }>;
}) {
  const { saved, connected, error } = await searchParams;
  const rows = await db.select().from(socialAccounts);
  const byPlatform = new Map(rows.map((row) => [row.platform, row]));

  return (
    <>
      <PageHeader
        kicker="Verbindungen"
        title="Accounts"
        description="Plattform-Verbindungen und Posting-Plan. Slots gelten in der Zeitzone aus den Einstellungen; sie steuern auch den Manual-Fallback-Zeitplan."
        action={
          <div className="flex gap-4">
            {saved && <StatusText tone="ok">Plan gespeichert</StatusText>}
            {connected && <StatusText tone="ok">{connected} verbunden</StatusText>}
            {error && <StatusText tone="err">{error}</StatusText>}
          </div>
        }
      />

      <div className="divide-y divide-hairline">
        {PUBLISH_PLATFORMS.map((platform) => {
          const account = byPlatform.get(platform);
          const status = STATUS_LABEL[account?.status ?? "disconnected"];
          const connect = CONNECT[platform];
          return (
            <section key={platform} className="grid gap-8 py-10 md:grid-cols-[220px_1fr]">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">
                  {PLATFORM_LABELS[platform]}
                </h2>
                <p className="mt-2">
                  <StatusText tone={status.tone}>{status.label}</StatusText>
                </p>
                {account?.handle && (
                  <p className="mt-1 text-sm text-ink-soft">@{account.handle}</p>
                )}
                {account?.tokenExpiresAt && account.status === "connected" && (
                  <p className="tnum mt-1 text-xs text-ink-faint">
                    Token bis {account.tokenExpiresAt.toLocaleString("de-DE")}
                  </p>
                )}
                {account?.lastError && (
                  <p className="mt-2 max-w-[220px] text-xs text-err">
                    {account.lastError.slice(0, 120)}
                  </p>
                )}
                <div className="mt-4">
                  {connect.href ? (
                    <a
                      href={connect.href}
                      className="inline-block bg-ink px-4 py-2 text-[13px] font-medium tracking-wide text-paper transition-colors hover:bg-ink/80"
                    >
                      {account?.status === "connected" ? "Neu verbinden" : "Verbinden"}
                    </a>
                  ) : (
                    <StatusText tone="muted">Verbinden ab Phase 7</StatusText>
                  )}
                </div>
                <p className="mt-3 max-w-[220px] text-xs text-ink-soft">{connect.hint}</p>
              </div>

              <form action={savePostingPlanAction} className="max-w-md space-y-6">
                <input type="hidden" name="platform" value={platform} />
                <Field label="Posting-Slots (lokale Zeit, kommagetrennt)">
                  <Input
                    name="timeSlots"
                    defaultValue={
                      account && account.timeSlots.length > 0
                        ? account.timeSlots.join(",")
                        : "09:00,14:00,19:00"
                    }
                    placeholder="09:00,14:00,19:00"
                  />
                </Field>
                <Field label="Max. Posts pro Tag">
                  <Input
                    name="clipsPerDay"
                    type="number"
                    min={1}
                    max={10}
                    defaultValue={account?.clipsPerDay ?? 1}
                    className="tnum max-w-24"
                  />
                </Field>
                <Button type="submit" variant="ghost">
                  Plan speichern
                </Button>
              </form>
            </section>
          );
        })}
      </div>
    </>
  );
}
