import Link from "next/link";
import { briefings, db, comments } from "@creatorhq/db";
import { desc } from "drizzle-orm";
import { AutoRefresh } from "@/components/auto-refresh";
import { Button, EmptyState, PageHeader, StatusText } from "@/components/ui";
import { BriefingView } from "./briefing-view";
import { runBriefingAction } from "./actions";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

export default async function BriefingPage({
  searchParams,
}: {
  searchParams: Promise<{ adopted?: string; error?: string; started?: string }>;
}) {
  const { adopted, error, started } = await searchParams;
  const rows = await db.select().from(briefings).orderBy(desc(briefings.briefingDate));
  const latest = rows[0];
  const commentCount = (await db.select({ id: comments.id }).from(comments)).length;
  const isRunning = latest?.status === "running";

  return (
    <>
      {(isRunning || started) && <AutoRefresh intervalMs={6000} />}
      <PageHeader
        kicker="Täglich 06:00"
        title="Briefing"
        description={`Claude wertet Kommentare (${commentCount} gesammelt), Trends und Planungsstand aus — Video-Ideen, Antwort-Video-Kandidaten, Brand-Empfehlungen.`}
        action={
          <div className="flex items-baseline gap-4">
            {adopted && <StatusText tone="ok">In den Ideen-Backlog übernommen</StatusText>}
            {started && !isRunning && latest?.status !== "completed" && (
              <StatusText tone="ok">Gestartet — Sync läuft</StatusText>
            )}
            {isRunning && <StatusText tone="warn">Läuft — aktualisiert sich gleich</StatusText>}
            {error && <StatusText tone="err">{error}</StatusText>}
            <form action={runBriefingAction}>
              <Button type="submit" disabled={isRunning}>
                Briefing jetzt erstellen
              </Button>
            </form>
          </div>
        }
      />

      {!latest ? (
        <EmptyState
          title="Noch kein Briefing"
          hint="Oben „Briefing jetzt erstellen“ drücken — Kommentar-Sync + Claude-Auswertung laufen dann automatisch."
        />
      ) : (
        <>
          <p className="mb-8 text-sm text-ink-soft">
            Ausgabe vom <span className="tnum font-medium text-ink">{formatDate(latest.briefingDate)}</span>
          </p>
          <BriefingView briefing={latest} />

          {rows.length > 1 && (
            <nav className="mt-16 border-t border-hairline pt-6" aria-label="Briefing-Archiv">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
                Archiv
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {rows.slice(1).map((briefing) => (
                  <Link
                    key={briefing.id}
                    href={`/briefing/${briefing.briefingDate}`}
                    className="tnum text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline"
                  >
                    {formatDate(briefing.briefingDate)}
                  </Link>
                ))}
              </div>
            </nav>
          )}
        </>
      )}
    </>
  );
}
