import Link from "next/link";
import {
  ideas,
  type Idea,
  withTenant,
  type TenantDB,
} from "@creatorhq/db";
import { requireSession } from "@/lib/auth";
import { PLATFORM_SHORT, PUBLISH_PLATFORMS, PLATFORM_LABELS, type PublishPlatform } from "@creatorhq/shared";
import { asc } from "drizzle-orm";
import {
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  StatusText,
} from "@/components/ui";
import { createIdeaAction, scheduleShootAction, setIdeaStatusAction } from "./actions";

export const dynamic = "force-dynamic";

const COLUMNS: Array<{ status: Idea["status"]; title: string }> = [
  { status: "idea", title: "Ideen" },
  { status: "planned", title: "Geplant" },
  { status: "in_production", title: "In Produktion" },
  { status: "published", title: "Veröffentlicht" },
];

const NEXT_STATUS: Partial<Record<Idea["status"], { status: Idea["status"]; label: string }>> = {
  idea: { status: "planned", label: "→ Geplant" },
  planned: { status: "in_production", label: "→ In Produktion" },
  in_production: { status: "published", label: "→ Veröffentlicht" },
};

const PREV_STATUS: Partial<Record<Idea["status"], { status: Idea["status"]; label: string }>> = {
  planned: { status: "idea", label: "← Idee" },
  in_production: { status: "planned", label: "← Geplant" },
  published: { status: "in_production", label: "← Produktion" },
};

const SOURCE_LABEL: Record<Idea["source"], string> = {
  manual: "Manuell",
  briefing: "Aus Briefing",
  comment: "Aus Kommentar",
};

function StatusButton({
  ideaId,
  transition,
}: {
  ideaId: string;
  transition: { status: Idea["status"]; label: string };
}) {
  return (
    <form action={setIdeaStatusAction}>
      <input type="hidden" name="ideaId" value={ideaId} />
      <input type="hidden" name="status" value={transition.status} />
      <button
        type="submit"
        className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
      >
        {transition.label}
      </button>
    </form>
  );
}

export default async function PlanningPage(props: Parameters<typeof PlanningPageInhalt>[0]) {
  const session = await requireSession();
  // Der gesamte Seitenkoerper laeuft in der Mandantengrenze. Ohne sie
  // liefert die Datenbank null Zeilen — die Seite waere leer statt falsch.
  return withTenant(session.tenantId, (db) => PlanningPageInhalt(props, db));
}

async function PlanningPageInhalt({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; shoot?: string; error?: string }>;
},
  db: TenantDB,
) {
  const { created, shoot, error } = await searchParams;
  const rows = await db.select().from(ideas).orderBy(asc(ideas.createdAt));
  const discarded = rows.filter((idea) => idea.status === "discarded");

  return (
    <>
      <PageHeader
        kicker="Content-Planung"
        title="Planung"
        description="Ideen-Backlog vom Einfall bis zur Veröffentlichung. Ideen kommen manuell, aus dem Briefing oder aus Kommentaren; „Dreh planen“ legt den Termin in den Kalender."
        action={
          <div className="flex gap-4">
            {created && <StatusText tone="ok">Idee angelegt</StatusText>}
            {shoot && <StatusText tone="ok">Dreh im Kalender eingetragen</StatusText>}
            {error && <StatusText tone="err">{error}</StatusText>}
          </div>
        }
      />

      <section className="mb-14 max-w-2xl">
        <form action={createIdeaAction} className="space-y-6">
          <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
            <Field label="Neue Idee">
              <Input name="title" placeholder="Titel der Video-Idee" required />
            </Field>
            <Button type="submit">Hinzufügen</Button>
          </div>
          <Field label="Beschreibung (optional)">
            <Input name="description" placeholder="Worum geht es?" />
          </Field>
          <div className="flex flex-wrap gap-6">
            {PUBLISH_PLATFORMS.map((platform) => (
              <label key={platform} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="targetPlatforms"
                  value={platform}
                  defaultChecked
                  className="accent-ink"
                />
                {PLATFORM_LABELS[platform]}
              </label>
            ))}
          </div>
        </form>
      </section>

      <div className="grid gap-10 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((column) => {
          const columnIdeas = rows.filter((idea) => idea.status === column.status);
          return (
            <section key={column.status} aria-label={column.title}>
              <h2 className="mb-4 flex items-baseline justify-between border-b border-hairline pb-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.18em]">
                  {column.title}
                </span>
                <span className="tnum text-[11px] text-ink-faint">{columnIdeas.length}</span>
              </h2>
              {columnIdeas.length === 0 ? (
                <p className="text-sm text-ink-faint">—</p>
              ) : (
                <div className="space-y-6">
                  {columnIdeas.map((idea) => (
                    <article key={idea.id} className="border-l-2 border-hairline pl-4">
                      <h3 className="text-sm font-semibold">{idea.title}</h3>
                      {idea.description && (
                        <p className="mt-1 line-clamp-3 text-sm text-ink-soft">
                          {idea.description}
                        </p>
                      )}
                      <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                        {SOURCE_LABEL[idea.source]}
                        {idea.targetPlatforms.length > 0 &&
                          ` · ${idea.targetPlatforms
                            .map((p) => PLATFORM_SHORT[p as PublishPlatform])
                            .join(" ")}`}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                        {PREV_STATUS[idea.status] && (
                          <StatusButton ideaId={idea.id} transition={PREV_STATUS[idea.status]!} />
                        )}
                        {NEXT_STATUS[idea.status] && (
                          <StatusButton ideaId={idea.id} transition={NEXT_STATUS[idea.status]!} />
                        )}
                        {idea.status !== "published" && (
                          <StatusButton
                            ideaId={idea.id}
                            transition={{ status: "discarded", label: "Verwerfen" }}
                          />
                        )}
                      </div>
                      {(idea.status === "idea" || idea.status === "planned") && (
                        <form
                          action={scheduleShootAction}
                          className="mt-3 flex flex-wrap items-center gap-2"
                        >
                          <input type="hidden" name="ideaId" value={idea.id} />
                          <input
                            type="date"
                            name="date"
                            required
                            className="border-0 border-b border-hairline bg-transparent py-1 text-xs focus:border-accent focus:shadow-[0_0_0_3px_rgb(124_92_255/0.18)] focus:outline-none"
                          />
                          <input
                            type="time"
                            name="time"
                            defaultValue="10:00"
                            className="tnum border-0 border-b border-hairline bg-transparent py-1 text-xs focus:border-accent focus:shadow-[0_0_0_3px_rgb(124_92_255/0.18)] focus:outline-none"
                          />
                          <button
                            type="submit"
                            className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink underline-offset-4 hover:underline"
                          >
                            Dreh planen
                          </button>
                        </form>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {rows.length === 0 && (
        <div className="mt-10">
          <EmptyState
            title="Noch keine Ideen"
            hint="Oben eine Idee anlegen — oder im Briefing „Als Idee übernehmen“ nutzen."
          />
        </div>
      )}

      {discarded.length > 0 && (
        <section className="mt-16 border-t border-hairline pt-6">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
            Verworfen ({discarded.length})
          </p>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            {discarded.map((idea) => (
              <form key={idea.id} action={setIdeaStatusAction} className="flex items-center gap-3">
                <span className="text-sm text-ink-faint line-through">{idea.title}</span>
                <input type="hidden" name="ideaId" value={idea.id} />
                <input type="hidden" name="status" value="idea" />
                <button
                  type="submit"
                  className="text-[11px] uppercase tracking-[0.14em] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
                >
                  Zurückholen
                </button>
              </form>
            ))}
          </div>
        </section>
      )}

      <p className="mt-16 text-xs text-ink-faint">
        Termine ansehen: <Link href="/calendar" className="underline-offset-4 hover:underline hover:text-ink">Kalender</Link>
      </p>
    </>
  );
}
