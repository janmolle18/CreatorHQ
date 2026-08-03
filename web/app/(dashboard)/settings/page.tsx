import { db, settings, type Settings } from "@creatorhq/db";
import { PLATFORM_LABELS, PUBLISH_PLATFORMS } from "@creatorhq/shared";
import { Button, Field, Input, PageHeader, SectionTitle, StatusText } from "@/components/ui";
import { saveSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

const DEFAULTS: Pick<
  Settings,
  "creatorName" | "youtubeChannelId" | "twitchUserId" | "timezone" | "autoDiscovery" | "defaultTargets"
> = {
  creatorName: "",
  youtubeChannelId: null,
  twitchUserId: null,
  timezone: "Europe/Berlin",
  autoDiscovery: false,
  defaultTargets: [],
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const [row] = await db.select().from(settings).limit(1);
  const current = row ?? DEFAULTS;

  return (
    <>
      <PageHeader
        kicker="Konfiguration"
        title="Einstellungen"
        description="Kanal-Identität, Zeitzone und Standard-Ziele für neue Freigaben. Plattform-Verbindungen (OAuth) folgen in Phase 5–7 unter Accounts."
      />

      <form action={saveSettingsAction} className="max-w-2xl">
        <SectionTitle>Creator</SectionTitle>
        <div className="mb-12 grid gap-8 md:grid-cols-2">
          <Field label="Name">
            <Input name="creatorName" defaultValue={current.creatorName} required />
          </Field>
          <Field label="Zeitzone (IANA)">
            <Input
              name="timezone"
              defaultValue={current.timezone}
              placeholder="Europe/Berlin"
              required
            />
          </Field>
          <Field label="YouTube-Kanal-ID">
            <Input
              name="youtubeChannelId"
              defaultValue={current.youtubeChannelId ?? ""}
              placeholder="UC…"
            />
          </Field>
          <Field label="Twitch-User-ID">
            <Input
              name="twitchUserId"
              defaultValue={current.twitchUserId ?? ""}
              placeholder="leer, wenn kein Twitch"
            />
          </Field>
        </div>

        <SectionTitle>Automatik</SectionTitle>
        <div className="mb-12 space-y-6">
          <label className="flex items-baseline gap-3 text-sm">
            <input
              type="checkbox"
              name="autoDiscovery"
              defaultChecked={current.autoDiscovery}
              className="accent-ink"
            />
            <span>
              Neue Videos automatisch entdecken
              <span className="block text-xs text-ink-soft">
                Täglicher Scan des Kanals (ab Phase 3 aktiv).
              </span>
            </span>
          </label>

          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
              Standard-Ziele bei Freigabe
            </p>
            <div className="flex flex-wrap gap-6">
              {PUBLISH_PLATFORMS.map((platform) => (
                <label key={platform} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="defaultTargets"
                    value={platform}
                    defaultChecked={current.defaultTargets.includes(platform)}
                    className="accent-ink"
                  />
                  {PLATFORM_LABELS[platform]}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button type="submit">Speichern</Button>
          {saved && <StatusText tone="ok">Gespeichert</StatusText>}
          {error && <StatusText tone="err">{error}</StatusText>}
        </div>
      </form>
    </>
  );
}
