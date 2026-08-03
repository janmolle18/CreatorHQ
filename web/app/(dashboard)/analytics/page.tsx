import Link from "next/link";
import { clips, db, metricsSnapshots, posts } from "@creatorhq/db";
import { PLATFORM_LABELS, PLATFORM_SHORT, type PublishPlatform } from "@creatorhq/shared";
import { and, asc, eq, gte, isNull, isNotNull } from "drizzle-orm";
import { BarList, LineChart, type LineSeries } from "@/components/charts";
import { EmptyState, PageHeader, SectionTitle, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

const PERIODS = [7, 30, 90] as const;

function isoDaysAgo(days: number): string {
  const date = new Date(Date.now() - days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const days = PERIODS.includes(Number(params.days) as (typeof PERIODS)[number])
    ? Number(params.days)
    : 30;
  const since = isoDaysAgo(days);

  // Account-Ebene (postId NULL): Follower-Verlauf je Plattform.
  const accountRows = await db
    .select()
    .from(metricsSnapshots)
    .where(
      and(
        isNull(metricsSnapshots.postId),
        isNull(metricsSnapshots.sourceVideoId),
        gte(metricsSnapshots.snapshotDate, since)
      )
    )
    .orderBy(asc(metricsSnapshots.snapshotDate));

  const followerSeries: LineSeries[] = [];
  const latestByPlatform = new Map<string, Record<string, number>>();
  for (const platform of ["youtube", "instagram", "tiktok"] as PublishPlatform[]) {
    const rows = accountRows.filter((row) => row.platform === platform);
    latestByPlatform.set(platform, rows[rows.length - 1]?.metrics ?? {});
    const points = rows
      .filter((row) => typeof row.metrics.followers === "number")
      .map((row) => ({ x: row.snapshotDate, y: row.metrics.followers! }));
    if (points.length > 0) {
      followerSeries.push({ label: PLATFORM_SHORT[platform], points });
    }
  }

  const followersTotal = [...latestByPlatform.values()].reduce(
    (sum, metrics) => sum + (metrics.followers ?? 0),
    0
  );
  const channelViews = [...latestByPlatform.values()].reduce(
    (sum, metrics) => sum + (metrics.views ?? 0),
    0
  );

  // Post-Ebene: letzter Snapshot je Post im Zeitraum.
  const postRows = await db
    .select({ snapshot: metricsSnapshots, post: posts, clip: clips })
    .from(metricsSnapshots)
    .innerJoin(posts, eq(metricsSnapshots.postId, posts.id))
    .innerJoin(clips, eq(posts.clipId, clips.id))
    .where(and(isNotNull(metricsSnapshots.postId), gte(metricsSnapshots.snapshotDate, since)))
    .orderBy(asc(metricsSnapshots.snapshotDate));

  const latestPerPost = new Map<string, (typeof postRows)[number]>();
  for (const row of postRows) latestPerPost.set(row.post.id, row);
  const postItems = [...latestPerPost.values()]
    .map((row) => ({
      label: row.clip.title ?? row.clip.caption ?? row.post.id,
      sublabel: PLATFORM_SHORT[row.post.platform as PublishPlatform],
      value: row.snapshot.metrics.views ?? 0,
      hint:
        typeof row.snapshot.metrics.likes === "number"
          ? `${new Intl.NumberFormat("de-DE").format(row.snapshot.metrics.likes)} Likes`
          : undefined,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);

  return (
    <>
      <PageHeader
        kicker="Kennzahlen"
        title="Analytics"
        description="Täglicher Snapshot um 05:30 (Europe/Berlin). Datenquellen je Plattform: verbundener Account, sonst API-Key, für YouTube notfalls keyless — manuell anstoßen mit scripts/run-analytics.mjs."
        action={
          <nav className="flex gap-5" aria-label="Zeitraum">
            {PERIODS.map((period) => (
              <Link
                key={period}
                href={`/analytics?days=${period}`}
                className={`tnum text-sm underline-offset-4 ${
                  period === days
                    ? "font-semibold text-ink underline"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {period} Tage
              </Link>
            ))}
          </nav>
        }
      />

      <section className="mb-14">
        <div className="grid grid-cols-2 divide-x divide-hairline border-y border-hairline lg:grid-cols-3">
          <div className="px-5 first:pl-0 lg:px-6">
            <Stat
              label="Follower gesamt"
              value={followersTotal > 0 ? new Intl.NumberFormat("de-DE").format(followersTotal) : "—"}
              hint="Summe der letzten Snapshots"
            />
          </div>
          <div className="px-5 lg:px-6">
            <Stat
              label="Kanal-Views gesamt"
              value={channelViews > 0 ? new Intl.NumberFormat("de-DE").format(channelViews) : "—"}
              hint="alle Videos, letzte Snapshots"
            />
          </div>
          <div className="px-5 lg:px-6">
            <Stat
              label="Posts mit Daten"
              value={String(postItems.length)}
              hint={`im Zeitraum ${days} Tage`}
            />
          </div>
        </div>
      </section>

      <section className="mb-14">
        <SectionTitle>Follower-Verlauf</SectionTitle>
        {followerSeries.length === 0 ? (
          <EmptyState
            title="Noch keine Follower-Daten"
            hint="Analytics-Lauf anstoßen: node scripts/run-analytics.mjs — YouTube liefert auch ohne Keys."
          />
        ) : (
          <LineChart series={followerSeries} />
        )}
      </section>

      <section>
        <SectionTitle>Views je Post</SectionTitle>
        {postItems.length === 0 ? (
          <EmptyState
            title="Noch keine Post-Metriken"
            hint="Kommt, sobald Posts mit verbundenen Accounts veröffentlicht sind (Plattform-Keys nötig)."
          />
        ) : (
          <BarList items={postItems} unit="Views" />
        )}
      </section>
    </>
  );
}
