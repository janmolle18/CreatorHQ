import { db, clips, posts, settings, sourceVideos, type Post } from "@creatorhq/db";
import { DEFAULT_TIMEZONE, PUBLISH_PLATFORMS } from "@creatorhq/shared";
import { desc, eq } from "drizzle-orm";
import { AutoRefresh } from "@/components/auto-refresh";
import { EmptyState, PageHeader, SectionTitle, Stat, StatusText } from "@/components/ui";
import {
  LiveSection,
  ParkedSection,
  ProductionSection,
  ReviewSection,
  type BoardItem,
} from "./sections";

export const dynamic = "force-dynamic";

// Ein Board für den ganzen Clip-Lebenslauf: Freigabe → Produktion → Live →
// Aussortiert. Ersetzt die getrennten Seiten „Clips" und „Review".

type BoardGroup = "review" | "production" | "live" | "parked";

const LIVE_POST_STATES = new Set(["posted", "published"]);
const PRODUCTION_STATES = new Set(["approved", "rendering", "rendered", "scheduled"]);

function groupOf(item: BoardItem): BoardGroup {
  if (item.clip.status === "candidate") return "review";
  if (item.posts.some((post) => LIVE_POST_STATES.has(post.status))) return "live";
  if (PRODUCTION_STATES.has(item.clip.status)) return "production";
  return "parked";
}

export default async function ClipsBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ approved?: string; deleted?: string; error?: string }>;
}) {
  const { approved, deleted, error } = await searchParams;

  const [config] = await db.select().from(settings).limit(1);
  const timeZone = config?.timezone ?? DEFAULT_TIMEZONE;
  const defaultTargets: string[] =
    config && config.defaultTargets.length > 0
      ? config.defaultTargets
      : [...PUBLISH_PLATFORMS];

  const [rows, allPosts] = await Promise.all([
    db
      .select({ clip: clips, sourceTitle: sourceVideos.title })
      .from(clips)
      .leftJoin(sourceVideos, eq(clips.sourceVideoId, sourceVideos.id))
      .orderBy(desc(clips.updatedAt)),
    db.select().from(posts),
  ]);

  const postsByClip = new Map<string, Post[]>();
  for (const post of allPosts) {
    postsByClip.set(post.clipId, [...(postsByClip.get(post.clipId) ?? []), post]);
  }

  const items: BoardItem[] = rows.map((row) => ({
    clip: row.clip,
    sourceTitle: row.sourceTitle,
    posts: postsByClip.get(row.clip.id) ?? [],
  }));
  const groups: Record<BoardGroup, BoardItem[]> = {
    review: [],
    production: [],
    live: [],
    parked: [],
  };
  for (const item of items) {
    groups[groupOf(item)] = [...groups[groupOf(item)], item];
  }
  groups.review.sort((a, b) => (b.clip.score ?? 0) - (a.clip.score ?? 0));

  const stats: Array<{ id: string; label: string; value: number; hint: string }> = [
    { id: "freigabe", label: "Zur Freigabe", value: groups.review.length, hint: "warten auf Entscheidung" },
    { id: "produktion", label: "In Produktion", value: groups.production.length, hint: "Render, Planung, Upload" },
    { id: "live", label: "Live", value: groups.live.length, hint: "übergeben oder öffentlich" },
    { id: "aussortiert", label: "Aussortiert", value: groups.parked.length, hint: "abgelehnt oder Fehler" },
  ];

  return (
    <>
      <AutoRefresh intervalMs={8000} />
      <PageHeader
        kicker="Pipeline"
        title="Clips"
        description="Der ganze Clip-Lebenslauf auf einer Seite: freigeben, verfolgen, aufräumen. Löschen ist gesperrt, sobald ein Post live ist."
        action={
          <div className="flex gap-4">
            {approved && <StatusText tone="ok">Freigegeben — Rendering startet</StatusText>}
            {deleted && <StatusText tone="ok">Clip gelöscht</StatusText>}
            {error && <StatusText tone="err">{error}</StatusText>}
          </div>
        }
      />

      <section aria-label="Pipeline-Stufen" className="mb-14">
        <div className="grid grid-cols-2 divide-x divide-hairline border-y border-hairline lg:grid-cols-4">
          {stats.map((stat, index) => (
            <a
              key={stat.id}
              href={`#${stat.id}`}
              className={`px-5 hover:bg-ink/[0.03] lg:px-6 ${index === 0 ? "first:pl-0" : ""}`}
            >
              <Stat label={stat.label} value={String(stat.value)} hint={stat.hint} />
            </a>
          ))}
        </div>
      </section>

      {items.length === 0 ? (
        <EmptyState
          title="Noch keine Clips"
          hint="Auf der Quellen-Seite ein Video laden und „Clips erzeugen“ starten."
        />
      ) : (
        <div className="space-y-16">
          <section aria-labelledby="freigabe">
            <SectionTitle>
              <span id="freigabe">Zur Freigabe · {groups.review.length}</span>
            </SectionTitle>
            <ReviewSection items={groups.review} defaultTargets={defaultTargets} />
          </section>

          <section aria-labelledby="produktion">
            <SectionTitle>
              <span id="produktion">In Produktion · {groups.production.length}</span>
            </SectionTitle>
            <ProductionSection items={groups.production} timeZone={timeZone} />
          </section>

          <section aria-labelledby="live">
            <SectionTitle>
              <span id="live">Live · {groups.live.length}</span>
            </SectionTitle>
            <LiveSection items={groups.live} timeZone={timeZone} />
          </section>

          <section aria-labelledby="aussortiert">
            <SectionTitle>
              <span id="aussortiert">Aussortiert · {groups.parked.length}</span>
            </SectionTitle>
            <ParkedSection items={groups.parked} />
          </section>
        </div>
      )}
    </>
  );
}
