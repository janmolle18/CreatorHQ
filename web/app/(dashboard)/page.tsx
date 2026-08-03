import Link from "next/link";
import { briefings, clips, db, metricsSnapshots, posts, settings, type Clip, type Post } from "@creatorhq/db";
import {
  DEFAULT_TIMEZONE,
  formatInTz,
  PLATFORM_LABELS,
  slotToUtc,
  todayInTz,
  type PublishPlatform,
} from "@creatorhq/shared";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { CopyButton } from "@/components/copy-button";
import { EmptyState, PageHeader, SectionTitle, Status, StatusText } from "@/components/ui";
import { checkInfra } from "@/lib/infra";
import { POST_STATUS, postUrgency } from "@/lib/status";

export const dynamic = "force-dynamic";

// Die Startseite beantwortet genau eine Frage: Was ist jetzt zu tun?
// Technik gehört auf /system — hier steht nur seine Arbeit.

interface Aufgabe {
  clip: Clip;
  posts: Post[];
  faellig: Date | null;
  ueberfaellig: boolean;
}

/** Offene Posts zu Videos zusammenfassen — ein Video ist eine Aufgabe, nicht drei. */
function zuAufgaben(
  zeilen: Array<{ post: Post; clip: Clip }>,
  now: Date,
  tagesEnde: Date
): { heute: Aufgabe[]; spaeter: Aufgabe[] } {
  const proClip = new Map<string, Aufgabe>();
  for (const { post, clip } of zeilen) {
    const eintrag = proClip.get(clip.id) ?? {
      clip,
      posts: [],
      faellig: null,
      ueberfaellig: false,
    };
    eintrag.posts.push(post);
    if (post.scheduledAt && (eintrag.faellig === null || post.scheduledAt < eintrag.faellig)) {
      eintrag.faellig = post.scheduledAt;
    }
    if (postUrgency(post, now, tagesEnde) === "overdue") eintrag.ueberfaellig = true;
    proClip.set(clip.id, eintrag);
  }

  const alle = [...proClip.values()].sort(
    (a, b) => (a.faellig?.getTime() ?? Infinity) - (b.faellig?.getTime() ?? Infinity)
  );
  return {
    heute: alle.filter(
      (aufgabe) => aufgabe.ueberfaellig || (aufgabe.faellig !== null && aufgabe.faellig <= tagesEnde)
    ),
    spaeter: alle.filter(
      (aufgabe) => !aufgabe.ueberfaellig && (aufgabe.faellig === null || aufgabe.faellig > tagesEnde)
    ),
  };
}

function ersteSaetze(text: string, anzahl = 2): string {
  const saetze = text.replace(/[#*_`]/g, "").match(/[^.!?]+[.!?]+/g);
  return saetze ? saetze.slice(0, anzahl).join(" ").trim() : text.slice(0, 240);
}

export default async function OverviewPage() {
  const [config] = await db.select().from(settings).limit(1);
  const timeZone = config?.timezone ?? DEFAULT_TIMEZONE;
  const today = todayInTz(timeZone);
  const now = new Date();
  // Tagesende in der Zeitzone des Creators — die Grenze zwischen „heute" und „später".
  const tagesEnde = slotToUtc(today, "23:59", timeZone);

  const [infra, accountSnapshots, offenePosts, kandidaten, inArbeit, briefingZeilen] =
    await Promise.all([
      checkInfra(),
      db
        .select()
        .from(metricsSnapshots)
        // Nur Kanal-Zahlen: weder Post- noch Referenz-Video-Messungen.
        .where(and(isNull(metricsSnapshots.postId), isNull(metricsSnapshots.sourceVideoId)))
        .orderBy(asc(metricsSnapshots.snapshotDate)),
      db
        .select({ post: posts, clip: clips })
        .from(posts)
        .innerJoin(clips, eq(posts.clipId, clips.id))
        .where(inArray(posts.status, ["scheduled", "awaiting_manual", "uploading"]))
        .orderBy(asc(posts.scheduledAt)),
      db.select({ id: clips.id }).from(clips).where(eq(clips.status, "candidate")),
      db
        .select({ id: clips.id })
        .from(clips)
        .where(inArray(clips.status, ["approved", "rendering"])),
      db.select().from(briefings).orderBy(desc(briefings.briefingDate)).limit(1),
    ]);

  const { heute, spaeter } = zuAufgaben(offenePosts, now, tagesEnde);
  const briefing = briefingZeilen[0];
  const briefingIstHeute = briefing?.briefingDate === today;

  const followerGesamt = [...new Map(accountSnapshots.map((row) => [row.platform, row.metrics])).values()].reduce(
    (summe, metrics) => summe + (metrics.followers ?? 0),
    0
  );
  const technikProblem = infra.filter((dienst) => !dienst.ok);

  return (
    <>
      <PageHeader
        kicker={formatInTz(now, timeZone, "EEEE, d. MMMM")}
        title={
          heute.length > 0
            ? `${heute.length} ${heute.length === 1 ? "Video" : "Videos"} zu posten`
            : "Nichts offen"
        }
        description={
          heute.length > 0
            ? "Video herunterladen, Text kopieren, auf der Plattform posten — danach hier abhaken."
            : "Alles erledigt. Neue Aufgaben tauchen hier automatisch auf."
        }
      />

      {technikProblem.length > 0 && (
        <p className="mb-10 border border-err/40 px-5 py-4 text-meta">
          <StatusText tone="err">Die Technik hat gerade ein Problem</StatusText>{" "}
          <span className="text-ink-soft">
            — die Einzelheiten stehen unter{" "}
            <Link href="/system" className="underline underline-offset-4">
              System
            </Link>
            . Deine Videos gehen nicht verloren.
          </span>
        </p>
      )}

      <section className="mb-14" aria-labelledby="heute-heading">
        <SectionTitle>
          <span id="heute-heading">Jetzt dran</span>
        </SectionTitle>
        {heute.length === 0 ? (
          <EmptyState
            title="Heute nichts zu posten"
            hint={
              spaeter.length > 0
                ? `${spaeter.length} ${spaeter.length === 1 ? "Video ist" : "Videos sind"} für die nächsten Tage eingeplant.`
                : "Sobald du Clips freigibst, erscheinen sie hier mit Termin."
            }
          />
        ) : (
          <div className="divide-y divide-hairline border-y border-hairline">
            {heute.map(({ clip, posts: aufgabenPosts, faellig, ueberfaellig }) => {
              const text = [clip.caption ?? "", clip.hashtags.join(" ")]
                .filter(Boolean)
                .join("\n\n");
              return (
                <article key={clip.id} className="grid gap-x-8 gap-y-3 py-6 md:grid-cols-[130px_1fr]">
                  <div>
                    <p className="tnum text-2xl font-semibold tracking-tight">
                      {faellig ? formatInTz(faellig, timeZone, "HH:mm") : "—"}
                    </p>
                    {ueberfaellig ? (
                      <StatusText tone="warn">überfällig</StatusText>
                    ) : (
                      <span className="text-xs text-ink-soft">
                        {faellig ? formatInTz(faellig, timeZone, "dd.MM.") : ""}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="font-medium">{clip.title ?? clip.caption ?? "Ohne Titel"}</p>
                    <p className="mt-1 text-meta text-ink-soft">
                      {aufgabenPosts
                        .map((post) => PLATFORM_LABELS[post.platform as PublishPlatform])
                        .join(" · ")}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                      <a
                        href={`/api/clips/${clip.id}/video?download=1`}
                        className="text-label font-medium uppercase tracking-[0.14em] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
                      >
                        Video herunterladen
                      </a>
                      {text && <CopyButton text={text} />}
                      <Link
                        href="/posts"
                        className="text-label font-medium uppercase tracking-[0.14em] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
                      >
                        Abhaken →
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-14 md:grid-cols-2">
        <section aria-labelledby="entscheiden-heading">
          <SectionTitle>
            <span id="entscheiden-heading">Wartet auf deine Entscheidung</span>
          </SectionTitle>
          {kandidaten.length === 0 ? (
            <p className="text-meta text-ink-soft">
              Gerade nichts.{" "}
              <Link href="/sources" className="underline-offset-4 hover:underline">
                Neue Clips erzeugen
              </Link>
            </p>
          ) : (
            <p className="text-meta">
              <span className="tnum text-3xl font-semibold tracking-tight">
                {kandidaten.length}
              </span>{" "}
              <Link href="/clips#freigabe" className="underline-offset-4 hover:underline">
                {kandidaten.length === 1 ? "Clip ansehen" : "Clips ansehen"} →
              </Link>
            </p>
          )}
        </section>

        <section aria-labelledby="laeuft-heading">
          <SectionTitle>
            <span id="laeuft-heading">Läuft von allein</span>
          </SectionTitle>
          <ul className="space-y-2 text-meta text-ink-soft">
            {inArbeit.length > 0 && (
              <li>
                <Status meta={{ label: `${inArbeit.length} in Arbeit`, tone: "muted" }} /> — werden
                gerade fertiggemacht
              </li>
            )}
            <li>
              {spaeter.length > 0
                ? `${spaeter.length} ${spaeter.length === 1 ? "Video" : "Videos"} eingeplant${
                    spaeter[0]?.faellig
                      ? `, nächstes am ${formatInTz(spaeter[0].faellig, timeZone, "dd.MM. 'um' HH:mm")}`
                      : ""
                  }`
                : "Nichts eingeplant"}
            </li>
            {followerGesamt > 0 && (
              <li>
                {new Intl.NumberFormat("de-DE").format(followerGesamt)} Follower ·{" "}
                <Link href="/analytics" className="underline-offset-4 hover:underline">
                  Zahlen ansehen
                </Link>
              </li>
            )}
          </ul>
        </section>
      </div>

      <section className="mt-14" aria-labelledby="briefing-heading">
        <SectionTitle>
          <span id="briefing-heading">Briefing</span>
        </SectionTitle>
        {briefingIstHeute && briefing?.status === "completed" && briefing.summaryMd ? (
          <>
            <p className="max-w-2xl leading-relaxed">{ersteSaetze(briefing.summaryMd)}</p>
            <Link
              href="/briefing"
              className="mt-3 inline-block text-label font-medium uppercase tracking-[0.14em] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
            >
              Ganzes Briefing lesen →
            </Link>
          </>
        ) : (
          <p className="text-meta text-ink-soft">
            <Link href="/briefing" className="underline-offset-4 hover:underline">
              Zum Briefing
            </Link>{" "}
            — die tägliche Auswertung deiner Kommentare und Zahlen.
          </p>
        )}
      </section>
    </>
  );
}
