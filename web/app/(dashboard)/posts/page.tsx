import {
  clips,
  posts,
  settings,
  socialAccounts,
  type Clip,
  type Post,
  withTenant,
  type TenantDB,
} from "@creatorhq/db";
import { requireSession } from "@/lib/auth";
import {
  DEFAULT_TIMEZONE,
  formatInTz,
  PLATFORM_LABELS,
  type PublishPlatform,
} from "@creatorhq/shared";
import { asc, eq } from "drizzle-orm";
import { AutoRefresh } from "@/components/auto-refresh";
import { ConfirmButton } from "@/components/confirm-button";
import { CopyButton } from "@/components/copy-button";
import { Button, EmptyState, Input, PageHeader, StatusText } from "@/components/ui";
import { POST_PENDING, POST_STATUS } from "@/lib/status";
import {
  markPublishedAction,
  pushClipNowAction,
  pushNowAction,
  rebuildScheduleAction,
} from "./actions";

export const dynamic = "force-dynamic";

// Ein Video = EIN Eintrag: Posts sind pro Clip gruppiert (gemeinsamer
// Zeitpunkt), jede Plattform ist eine Zeile mit eigenem Push-Knopf.

// Statustexte und Zustandsmengen kommen aus der Registry (web/lib/status.ts).
// Diese Seite hatte eine eigene Tabelle, die der Registry widersprach: `posted`
// stand hier auf grün „Übergeben", dort auf gelb „Übergeben — du bist dran".
// Grün hieß damit „erledigt" für etwas, das noch einen Handgriff braucht.

interface VideoGroup {
  clip: Clip;
  posts: Post[];
  /** Gemeinsamer (frühester) Zeitpunkt der offenen Posts, sonst der letzten. */
  when: Date | null;
  pendingCount: number;
}

function groupByClip(rows: Array<{ post: Post; clip: Clip }>): VideoGroup[] {
  const byClip = new Map<string, Array<Post>>();
  const clipsById = new Map<string, Clip>();
  for (const { post, clip } of rows) {
    byClip.set(clip.id, [...(byClip.get(clip.id) ?? []), post]);
    clipsById.set(clip.id, clip);
  }
  const map = new Map<string, VideoGroup>();
  for (const [clipId, clipPosts] of byClip) {
    // Kopfzeit = gemeinsamer Termin der OFFENEN Posts; erst wenn alles
    // draußen ist, zählt die (vergangene) Zeit der veröffentlichten.
    const pendingTimes = clipPosts
      .filter((post) => POST_PENDING.has(post.status) && post.scheduledAt !== null)
      .map((post) => post.scheduledAt!) as Date[];
    const allTimes = clipPosts
      .filter((post) => post.scheduledAt !== null)
      .map((post) => post.scheduledAt!) as Date[];
    const pool = pendingTimes.length > 0 ? pendingTimes : allTimes;
    map.set(clipId, {
      clip: clipsById.get(clipId)!,
      posts: clipPosts,
      pendingCount: clipPosts.filter((post) => POST_PENDING.has(post.status)).length,
      when: pool.length > 0 ? new Date(Math.min(...pool.map((d) => d.getTime()))) : null,
    });
  }
  return [...map.values()].sort((a, b) => {
    if (a.pendingCount !== b.pendingCount && (a.pendingCount === 0 || b.pendingCount === 0)) {
      return a.pendingCount === 0 ? 1 : -1; // fertige Videos ans Ende
    }
    return (a.when?.getTime() ?? Infinity) - (b.when?.getTime() ?? Infinity);
  });
}

function VideoThumb({ clip }: { clip: Clip }) {
  if (clip.thumbPath) {
    return (
      <img
        src={`/api/clips/${clip.id}/thumb`}
        alt=""
        width={360}
        height={202}
        loading="lazy"
        className="w-full border border-hairline bg-ink/5"
      />
    );
  }
  if (clip.renderedPath) {
    return (
      <video
        src={`/api/clips/${clip.id}/video`}
        preload="metadata"
        muted
        className="aspect-[9/16] w-full max-h-40 border border-hairline bg-ink/5 object-cover"
      />
    );
  }
  return <div className="aspect-video w-full border border-dashed border-hairline" />;
}

export default async function PostsPage(props: Parameters<typeof PostsPageInhalt>[0]) {
  const session = await requireSession();
  // Der gesamte Seitenkoerper laeuft in der Mandantengrenze. Ohne sie
  // liefert die Datenbank null Zeilen — die Seite waere leer statt falsch.
  return withTenant(session.tenantId, (db) => PostsPageInhalt(props, db));
}

async function PostsPageInhalt({
  searchParams,
}: {
  searchParams: Promise<{
    done?: string;
    error?: string;
    pushed?: string;
    rebuilt?: string;
    manual?: string;
  }>;
},
  db: TenantDB,
) {
  const { done, error, pushed, rebuilt, manual } = await searchParams;
  const [config] = await db.select().from(settings).limit(1);
  const timeZone = config?.timezone ?? DEFAULT_TIMEZONE;

  const [rows, accounts] = await Promise.all([
    db
      .select({ post: posts, clip: clips })
      .from(posts)
      .innerJoin(clips, eq(posts.clipId, clips.id))
      .orderBy(asc(posts.scheduledAt)),
    db
      .select({ platform: socialAccounts.platform })
      .from(socialAccounts)
      .where(eq(socialAccounts.status, "connected")),
  ]);
  const groups = groupByClip(rows);
  // Nur verbundene Plattformen kann die App selbst bespielen — für alle
  // anderen wäre ein „Jetzt posten" eine Sackgasse.
  const connected = new Set(accounts.map((account) => account.platform));

  return (
    <>
      <AutoRefresh intervalMs={10000} />
      <PageHeader
        kicker="Zeitplan"
        title="Posts"
        description={`Ein Eintrag pro Video, alle Plattformen zum selben Zeitpunkt (${timeZone}). Pushen geht pro Plattform oder fürs ganze Video.`}
        action={
          <div className="flex items-baseline gap-4">
            {done && <StatusText tone="ok">Als veröffentlicht markiert</StatusText>}
            {pushed && <StatusText tone="ok">Wird jetzt hochgeladen</StatusText>}
            {manual && (
              <StatusText tone="warn">
                Diese Plattform ist nicht verbunden — bitte selbst posten
              </StatusText>
            )}
            {rebuilt && <StatusText tone="ok">{rebuilt} Videos neu eingeplant</StatusText>}
            {error && <StatusText tone="err">{error}</StatusText>}
            <form action={rebuildScheduleAction}>
              <ConfirmButton
                variant="ghost"
                message="Zeitplan neu aufbauen? Alle noch nicht veröffentlichten Posts werden neu terminiert (ein Video = ein Zeitpunkt). Bereits veröffentlichte bleiben unberührt."
              >
                Zeitplan neu aufbauen
              </ConfirmButton>
            </form>
          </div>
        }
      />

      {groups.length === 0 ? (
        <EmptyState
          title="Noch keine Posts"
          hint="Clips auf der Clips-Seite freigeben — nach dem Rendern plant der Worker die Slots automatisch."
        />
      ) : (
        <div className="divide-y divide-hairline">
          {groups.map(({ clip, posts: clipPosts, when, pendingCount }) => {
            const caption = [clip.caption ?? "", clip.hashtags.join(" ")]
              .filter(Boolean)
              .join("\n\n");
            return (
              <article key={clip.id} className="grid gap-6 py-8 md:grid-cols-[150px_130px_1fr]">
                <VideoThumb clip={clip} />

                <div>
                  <p className="tnum text-sm font-semibold">
                    {when ? formatInTz(when, timeZone, "dd.MM.yyyy") : "—"}
                  </p>
                  <p className="tnum text-3xl font-semibold tracking-tight">
                    {when ? formatInTz(when, timeZone, "HH:mm") : "—"}
                  </p>
                  {pendingCount > 1 &&
                    clipPosts.some(
                      (post) => POST_PENDING.has(post.status) && connected.has(post.platform)
                    ) && (
                      <form action={pushClipNowAction} className="mt-4">
                        <input type="hidden" name="clipId" value={clip.id} />
                        <Button type="submit" className="w-full">
                          Alle jetzt hochladen
                        </Button>
                      </form>
                    )}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {clip.title ?? clip.caption ?? clip.id}
                  </p>

                  <div className="mt-4 divide-y divide-hairline border-y border-hairline">
                    {clipPosts.map((post) => {
                      const status = POST_STATUS[post.status];
                      return (
                        <div
                          key={post.id}
                          className="flex flex-wrap items-baseline gap-x-5 gap-y-2 py-3"
                        >
                          <p className="w-24 shrink-0 text-[11px] font-medium uppercase tracking-[0.18em]">
                            {PLATFORM_LABELS[post.platform as PublishPlatform]}
                          </p>
                          <StatusText tone={status.tone}>{status.label}</StatusText>
                          {post.scheduledAt && when && post.scheduledAt.getTime() !== when.getTime() && (
                            <span className="tnum text-xs text-ink-faint">
                              {formatInTz(post.scheduledAt, timeZone, "dd.MM. HH:mm")}
                            </span>
                          )}
                          {post.externalUrl && (
                            <a
                              href={post.externalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-ink-soft underline-offset-4 hover:underline"
                            >
                              Ansehen ↗
                            </a>
                          )}
                          {/* Hinweise auch bei „Manuell posten" zeigen — dort
                              steht der wichtige Fall (z. B. YouTube noch auf
                              privat). Ausgenommen ist nur die Selbstverständ-
                              lichkeit „Plattform nicht verbunden": Das sagt die
                              Zeile bereits, und es steht 29-mal identisch da. */}
                          {post.error &&
                            !(post.status === "awaiting_manual" && !connected.has(post.platform)) && (
                              <span className="text-xs text-warn">{post.error.slice(0, 120)}</span>
                            )}

                          <span className="ml-auto flex flex-wrap items-baseline gap-3">
                            {post.status === "awaiting_manual" ? (
                              <form
                                action={markPublishedAction}
                                className="flex flex-wrap items-baseline gap-2"
                              >
                                <input type="hidden" name="postId" value={post.id} />
                                <Input
                                  name="externalUrl"
                                  placeholder="Link zum Post (optional)"
                                  className="w-48 text-xs"
                                />
                                <Button type="submit" variant="ghost">
                                  Erledigt
                                </Button>
                              </form>
                            ) : (
                              POST_PENDING.has(post.status) &&
                              connected.has(post.platform) && (
                                <form action={pushNowAction}>
                                  <input type="hidden" name="postId" value={post.id} />
                                  <Button type="submit" variant="ghost">
                                    Jetzt hochladen
                                  </Button>
                                </form>
                              )
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {clipPosts.some((post) => post.status === "awaiting_manual") && (
                    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
                      <a
                        href={`/api/clips/${clip.id}/video?download=1`}
                        className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
                      >
                        Video herunterladen
                      </a>
                      <CopyButton text={caption} />
                      <span className="text-xs text-ink-faint">
                        posten, dann in der Zeile „Erledigt“ drücken
                      </span>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
