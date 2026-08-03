import Link from "next/link";
import { db, metricsSnapshots, sourceVideos, type SourceVideo } from "@creatorhq/db";
import { asc, desc, isNotNull } from "drizzle-orm";
import { AutoRefresh } from "@/components/auto-refresh";
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  SectionTitle,
  StatusText,
  Table,
  Td,
} from "@/components/ui";
import { addSourceAction, createClipsAction, scanChannelAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<
  SourceVideo["status"],
  { label: string; tone: "ok" | "warn" | "err" | "muted" }
> = {
  discovered: { label: "Entdeckt", tone: "muted" },
  downloading: { label: "Lädt herunter", tone: "warn" },
  downloaded: { label: "Heruntergeladen", tone: "ok" },
  clipping: { label: "Clipping läuft", tone: "warn" },
  clipped: { label: "Geclippt", tone: "ok" },
  failed: { label: "Fehlgeschlagen", tone: "err" },
  reference: { label: "Referenz", tone: "muted" },
};

const KIND_LABEL: Record<SourceVideo["sourceKind"], string> = {
  youtube_video: "YouTube-Video",
  youtube_stream: "YouTube-Stream",
  twitch_vod: "Twitch-VOD",
  upload: "Upload",
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")} min`;
}

const MESSAGES: Record<string, { text: string; tone: "ok" | "warn" | "err" }> = {
  added: { text: "Quelle hinzugefügt — Download startet", tone: "ok" },
  exists: { text: "Video ist bereits in der Liste", tone: "warn" },
  scan: { text: "Kanal-Scan angestoßen — neue Videos erscheinen gleich in der Liste", tone: "ok" },
  clipping: { text: "Clip-Suche gestartet — Kandidaten erscheinen auf der Clips-Seite", tone: "ok" },
};

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{
    added?: string;
    exists?: string;
    scan?: string;
    clipping?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const message = params.error
    ? { text: params.error, tone: "err" as const }
    : MESSAGES[Object.keys(MESSAGES).find((key) => key in params) ?? ""];

  const [allVideos, performanceRows] = await Promise.all([
    db.select().from(sourceVideos).orderBy(desc(sourceVideos.createdAt)),
    db
      .select({
        sourceVideoId: metricsSnapshots.sourceVideoId,
        metrics: metricsSnapshots.metrics,
      })
      .from(metricsSnapshots)
      .where(isNotNull(metricsSnapshots.sourceVideoId))
      .orderBy(asc(metricsSnapshots.snapshotDate)),
  ]);

  // Jüngster Messwert je Video gewinnt (aufsteigend sortiert überschrieben).
  const viewsByVideo = new Map<string, number>();
  for (const row of performanceRows) {
    if (row.sourceVideoId && typeof row.metrics.views === "number") {
      viewsByVideo.set(row.sourceVideoId, row.metrics.views);
    }
  }

  const videos = allVideos.filter((video) => video.status !== "reference");
  const referenceVideos = allVideos
    .filter((video) => video.status === "reference")
    .sort((a, b) => (viewsByVideo.get(b.id) ?? 0) - (viewsByVideo.get(a.id) ?? 0));

  return (
    <>
      <AutoRefresh />
      <PageHeader
        kicker="Quellen-Ingest"
        title="Quellen"
        description="Davids Quellvideos: per Kanal-Scan oder Link hinzufügen. Geschnitten wird ausschließlich Langmaterial — fertige Shorts landen weiter unten als Referenz und zählen nur für die Analyse."
        action={
          <Link
            href="/import"
            className="text-[13px] font-medium tracking-wide text-ink-soft underline-offset-4 hover:text-ink hover:underline"
          >
            Instagram-Clips importieren
          </Link>
        }
      />

      <section className="mb-12 flex flex-wrap items-end gap-x-10 gap-y-6">
        <form action={addSourceAction} className="flex min-w-0 grow items-end gap-4 md:max-w-xl">
          <div className="grow">
            <label
              htmlFor="url"
              className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint"
            >
              Video-Link (YouTube oder Twitch-VOD)
            </label>
            <Input id="url" name="url" placeholder="https://www.youtube.com/watch?v=…" />
          </div>
          <Button type="submit">Hinzufügen</Button>
        </form>

        <form action={scanChannelAction}>
          <Button type="submit" variant="ghost">
            Kanal scannen
          </Button>
        </form>

        {message && <StatusText tone={message.tone}>{message.text}</StatusText>}
      </section>

      <SectionTitle>Clip-Material</SectionTitle>
      {videos.length === 0 ? (
        <EmptyState
          title="Noch keine Quellen"
          hint="„Kanal scannen“ holt alle Videos von Davids Kanal, oder füge einen einzelnen Link ein."
        />
      ) : (
        <Table head={["Titel", "Art", "Status", "Dauer", "Aktion"]}>
          {videos.map((video) => {
            const status = STATUS_LABEL[video.status];
            return (
              <tr key={video.id}>
                <Td className="max-w-md font-medium">
                  {video.url ? (
                    <a href={video.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {video.title ?? video.externalId}
                    </a>
                  ) : (
                    video.title ?? video.externalId
                  )}
                  {video.error && (
                    <span className="mt-1 block text-xs font-normal text-err">
                      {video.error.slice(0, 120)}
                    </span>
                  )}
                </Td>
                <Td className="text-ink-soft">{KIND_LABEL[video.sourceKind]}</Td>
                <Td>
                  <StatusText tone={status.tone}>{status.label}</StatusText>
                </Td>
                <Td>
                  <span className="tnum text-ink-soft">{formatDuration(video.durationSeconds)}</span>
                </Td>
                <Td>
                  {(video.status === "downloaded" || video.status === "clipped") && (
                    <form action={createClipsAction}>
                      <input type="hidden" name="sourceVideoId" value={video.id} />
                      <button
                        type="submit"
                        className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
                      >
                        {video.status === "clipped" ? "Erneut clippen" : "Clips erzeugen"}
                      </button>
                    </form>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}

      {referenceVideos.length > 0 && (
        <section className="mt-14">
          <SectionTitle>Referenz — fertige Shorts</SectionTitle>
          <p className="mb-5 max-w-2xl text-[13px] leading-relaxed text-ink-soft">
            Diese Videos sind bereits fertige Kurzvideos. Sie werden{" "}
            <strong className="font-medium text-ink">nie geschnitten oder neu gerendert</strong> —
            aber täglich gemessen. Aus ihren Zahlen lernt das Briefing, welche Formate und Themen
            bei David funktionieren.
          </p>
          <Table head={["Titel", "Dauer", "Views", ""]}>
            {referenceVideos.map((video) => {
              const views = viewsByVideo.get(video.id);
              return (
                <tr key={video.id}>
                  <Td className="max-w-md font-medium">
                    {video.url ? (
                      <a
                        href={video.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {video.title ?? video.externalId}
                      </a>
                    ) : (
                      (video.title ?? video.externalId)
                    )}
                  </Td>
                  <Td>
                    <span className="tnum text-ink-soft">
                      {video.durationSeconds ? `${video.durationSeconds} s` : "—"}
                    </span>
                  </Td>
                  <Td>
                    <span className="tnum">
                      {views === undefined ? (
                        <span className="text-ink-faint">wird gemessen</span>
                      ) : (
                        new Intl.NumberFormat("de-DE").format(views)
                      )}
                    </span>
                  </Td>
                  <Td className="text-ink-faint">Nur Analyse</Td>
                </tr>
              );
            })}
          </Table>
        </section>
      )}
    </>
  );
}
