import { comments, db, type Briefing } from "@creatorhq/db";
import { inArray } from "drizzle-orm";
import { Button, SectionTitle, StatusText } from "@/components/ui";
import { adoptContentIdeaAction, adoptReplyCandidateAction } from "./actions";

// Gemeinsame Briefing-Darstellung für „heute" und das Archiv.

const STATUS_LABEL: Record<
  Briefing["status"],
  { label: string; tone: "ok" | "warn" | "err" | "muted" }
> = {
  pending: { label: "Wartet", tone: "muted" },
  running: { label: "Läuft", tone: "warn" },
  completed: { label: "Fertig", tone: "ok" },
  failed: { label: "Fehlgeschlagen", tone: "err" },
};

export async function BriefingView({ briefing }: { briefing: Briefing }) {
  const commentIds = briefing.replyCandidates.map((c) => c.commentId);
  const commentRows =
    commentIds.length > 0
      ? await db.select().from(comments).where(inArray(comments.externalCommentId, commentIds))
      : [];
  const commentById = new Map(commentRows.map((row) => [row.externalCommentId, row]));
  const status = STATUS_LABEL[briefing.status];

  return (
    <div className="space-y-14">
      <div className="flex items-baseline gap-4">
        <StatusText tone={status.tone}>{status.label}</StatusText>
        {briefing.model && briefing.status === "completed" && (
          <span className="text-xs text-ink-faint">{briefing.model}</span>
        )}
      </div>

      {briefing.error && (
        <p className="max-w-2xl border-l-2 border-err pl-4 text-sm text-err">
          {briefing.error}
        </p>
      )}

      {briefing.summaryMd && (
        <section>
          <SectionTitle>Lagebild</SectionTitle>
          <div className="max-w-2xl space-y-3 text-[15px] leading-relaxed">
            {briefing.summaryMd.split(/\n{2,}/).map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        </section>
      )}

      {briefing.contentIdeas.length > 0 && (
        <section>
          <SectionTitle>Video-Ideen</SectionTitle>
          <div className="divide-y divide-hairline">
            {briefing.contentIdeas.map((idea, index) => (
              <article key={index} className="grid gap-4 py-6 md:grid-cols-[1fr_200px]">
                <div>
                  <h3 className="text-base font-semibold">{idea.title}</h3>
                  <p className="mt-1 max-w-xl text-sm text-ink-soft">{idea.description}</p>
                  {idea.targetPlatforms && idea.targetPlatforms.length > 0 && (
                    <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                      {idea.targetPlatforms.join(" · ")}
                    </p>
                  )}
                </div>
                <form action={adoptContentIdeaAction} className="md:justify-self-end">
                  <input type="hidden" name="briefingId" value={briefing.id} />
                  <input type="hidden" name="index" value={index} />
                  <Button type="submit" variant="ghost">
                    Als Idee übernehmen
                  </Button>
                </form>
              </article>
            ))}
          </div>
        </section>
      )}

      {briefing.replyCandidates.length > 0 && (
        <section>
          <SectionTitle>Kommentar-Antwort-Videos</SectionTitle>
          <div className="divide-y divide-hairline">
            {briefing.replyCandidates.map((candidate, index) => {
              const comment = commentById.get(candidate.commentId);
              return (
                <article key={index} className="grid gap-4 py-6 md:grid-cols-[1fr_200px]">
                  <div className="max-w-xl">
                    <blockquote className="border-l-2 border-ink pl-4 text-sm">
                      „{comment?.text ?? candidate.commentId}“
                      <footer className="mt-1 text-xs text-ink-soft">
                        {comment?.author ?? "Unbekannt"}
                        {comment && (
                          <>
                            {" · "}
                            <a
                              href={`https://www.youtube.com/watch?v=${comment.externalVideoId}&lc=${comment.externalCommentId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="underline-offset-4 hover:underline"
                            >
                              Zum Kommentar
                            </a>
                          </>
                        )}
                      </footer>
                    </blockquote>
                    <p className="mt-3 text-sm">
                      <span className="font-medium">Warum:</span> {candidate.whyWorthIt}
                    </p>
                    <p className="mt-1 text-sm text-ink-soft">
                      <span className="font-medium text-ink">Skizze:</span> {candidate.replySketch}
                    </p>
                  </div>
                  <form action={adoptReplyCandidateAction} className="md:justify-self-end">
                    <input type="hidden" name="briefingId" value={briefing.id} />
                    <input type="hidden" name="index" value={index} />
                    <Button type="submit" variant="ghost">
                      Als Idee übernehmen
                    </Button>
                  </form>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {briefing.brandRecommendations.length > 0 && (
        <section>
          <SectionTitle>Brand-Building</SectionTitle>
          <div className="divide-y divide-hairline">
            {briefing.brandRecommendations.map((rec, index) => (
              <article key={index} className="py-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
                  {rec.area}
                </p>
                <p className="mt-1 max-w-xl text-sm">{rec.finding}</p>
                <p className="mt-1 max-w-xl text-sm font-medium">→ {rec.action}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
