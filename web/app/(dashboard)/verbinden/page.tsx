import { socialAccounts, type SocialAccount } from "@creatorhq/db";
import { PLATFORM_LABELS, PUBLISH_PLATFORMS, type PublishPlatform } from "@creatorhq/shared";
import { mitMandant } from "@/lib/auth";
import { plattformBereitschaft } from "@/lib/platform-status";
import { Card, PageHeader, StatusText } from "@/components/ui";

export const dynamic = "force-dynamic";

// Die Einrichtungsseite. Sie beantwortet genau eine Frage: Was muss ich tun,
// damit meine Videos rausgehen? Posting-Slots und Tageskappen gehören bewusst
// NICHT hierher — ein neuer Creator soll drei Knöpfe sehen, keine Tabelle.

/** Was der Creator gerade tun kann — der Ton der ganzen Karte hängt daran. */
type Lage = "verbunden" | "abgelaufen" | "bereit" | "wartet" | "kommt_noch";

function lageVon(
  konto: SocialAccount | undefined,
  bereitschaft: ReturnType<typeof plattformBereitschaft>
): Lage {
  if (konto?.status === "connected") return "verbunden";
  if (konto?.status === "expired") return "abgelaufen";
  if (bereitschaft.bereitschaft === "nicht_eingerichtet") return "kommt_noch";
  if (bereitschaft.bereitschaft === "nur_eingeladene") return "wartet";
  return "bereit";
}

const LAGE_TEXT: Record<Lage, { label: string; tone: "ok" | "warn" | "err" | "muted" }> = {
  verbunden: { label: "Verbunden", tone: "ok" },
  abgelaufen: { label: "Zugang abgelaufen", tone: "err" },
  bereit: { label: "Bereit zum Verbinden", tone: "warn" },
  wartet: { label: "Freischaltung nötig", tone: "warn" },
  kommt_noch: { label: "Kommt noch", tone: "muted" },
};

export default async function VerbindenPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;

  const konten = await mitMandant((tx) => tx.select().from(socialAccounts));
  const proPlattform = new Map(konten.map((konto) => [konto.platform, konto]));

  const stand = PUBLISH_PLATFORMS.map((platform) => {
    const konto = proPlattform.get(platform);
    const bereitschaft = plattformBereitschaft(platform);
    return { platform, konto, bereitschaft, lage: lageVon(konto, bereitschaft) };
  });
  const verbunden = stand.filter((eintrag) => eintrag.lage === "verbunden").length;

  return (
    <>
      <PageHeader
        kicker="Einrichten"
        title={
          verbunden === PUBLISH_PLATFORMS.length
            ? "Alles verbunden"
            : `${verbunden} von ${PUBLISH_PLATFORMS.length} verbunden`
        }
        description="Jede Verbindung ist ein Klick. Du gibst dabei nie ein Passwort bei uns ein — die Plattform fragt dich selbst und schickt uns nur die Erlaubnis, in deinem Namen zu posten."
        action={
          <div className="flex gap-4">
            {connected && <StatusText tone="ok">{connected} verbunden</StatusText>}
            {error && <StatusText tone="err">{error}</StatusText>}
          </div>
        }
      />

      {/* Warnung an genau der Stelle, an der Betrugsversuche ansetzen würden. */}
      <Card className="mb-10 border-warn/40">
        <p className="text-meta text-ink-soft">
          <strong className="font-medium text-ink">Wir fragen dich nie nach einem Passwort.</strong>{" "}
          Auch nicht nach Bestätigungscodes oder Wiederherstellungsschlüsseln. Wenn dich jemand
          danach fragt und es sieht aus, als käme es von uns — nicht schicken, sondern kurz anrufen.
        </p>
      </Card>

      <div className="divide-y divide-hairline border-y border-hairline">
        {stand.map(({ platform, konto, bereitschaft, lage }) => (
          <section key={platform} className="grid gap-x-10 gap-y-4 py-8 md:grid-cols-[220px_1fr]">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                {PLATFORM_LABELS[platform as PublishPlatform]}
              </h2>
              <p className="mt-2">
                <StatusText tone={LAGE_TEXT[lage].tone}>{LAGE_TEXT[lage].label}</StatusText>
              </p>
              {konto?.handle && <p className="mt-1 text-sm text-ink-soft">@{konto.handle}</p>}
            </div>

            <div className="min-w-0">
              <p className="max-w-xl text-meta text-ink-soft">{bereitschaft.hinweis}</p>

              {konto?.lastError && lage !== "verbunden" && (
                <p className="mt-3 max-w-xl text-xs text-err">
                  Letzter Fehler: {konto.lastError.slice(0, 160)}
                </p>
              )}

              {bereitschaft.href && (
                <div className="mt-5">
                  <a
                    href={bereitschaft.href}
                    className="inline-block bg-ink px-5 py-2.5 text-[13px] font-medium tracking-wide text-paper transition-colors hover:bg-ink/80"
                  >
                    {lage === "verbunden"
                      ? "Neu verbinden"
                      : lage === "abgelaufen"
                        ? "Zugang erneuern"
                        : `Mit ${PLATFORM_LABELS[platform as PublishPlatform]} verbinden`}
                  </a>
                  {lage === "verbunden" && (
                    <p className="mt-2 text-xs text-ink-faint">
                      Nur nötig, wenn etwas klemmt — verbunden bleibt verbunden.
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
