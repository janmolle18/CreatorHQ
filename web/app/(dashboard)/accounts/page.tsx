import Link from "next/link";
import { socialAccounts } from "@creatorhq/db";
import { PLATFORM_LABELS, PUBLISH_PLATFORMS } from "@creatorhq/shared";
import { mitMandant } from "@/lib/auth";
import { Button, Field, Input, PageHeader, StatusText } from "@/components/ui";
import { ACCOUNT_STATUS } from "@/lib/status";
import { savePostingPlanAction } from "./actions";

export const dynamic = "force-dynamic";

// Statustexte aus der Registry (web/lib/status.ts). Hier stand „Pausiert“
// auf gelb — gelb heißt aber „du bist dran“, und pausiert ist niemand dran.

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const rows = await mitMandant((tx) => tx.select().from(socialAccounts));
  const byPlatform = new Map(rows.map((row) => [row.platform, row]));

  return (
    <>
      <PageHeader
        kicker="Zeitplan"
        title="Wann gepostet wird"
        description="Uhrzeiten und wie viele Videos pro Tag — je Plattform. Die Zeiten gelten in der Zeitzone aus den Einstellungen."
        action={
          <div className="flex gap-4">
            {saved && <StatusText tone="ok">Plan gespeichert</StatusText>}
            {error && <StatusText tone="err">{error}</StatusText>}
          </div>
        }
      />

      <div className="divide-y divide-hairline">
        {PUBLISH_PLATFORMS.map((platform) => {
          const account = byPlatform.get(platform);
          const status = ACCOUNT_STATUS[account?.status ?? "disconnected"];
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
                {account?.status !== "connected" && (
                  <p className="mt-4 max-w-[220px] text-xs text-ink-soft">
                    Noch nicht verbunden — das machst du unter{" "}
                    <Link href="/verbinden" className="underline underline-offset-4">
                      Verbinden
                    </Link>
                    . Die Zeiten kannst du trotzdem schon festlegen.
                  </p>
                )}
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
