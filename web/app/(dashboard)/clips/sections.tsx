import Link from "next/link";
import type { Clip, Post } from "@creatorhq/db";
import {
  formatInTz,
  PLATFORM_LABELS,
  PLATFORM_SHORT,
  PUBLISH_PLATFORMS,
  type PublishPlatform,
} from "@creatorhq/shared";
import { Button, Field, Input, StatusText } from "@/components/ui";
import { CLIP_STATUS, POST_STATUS } from "@/lib/status";
import { ConfirmButton } from "@/components/confirm-button";
import {
  approveClipAction,
  deleteClipAction,
  reRenderClipAction,
  rejectClipAction,
  restoreClipAction,
  updateClipAction,
  updateSubtitlesAction,
} from "./actions";

// Präsentations-Bausteine des Clip-Boards. Server Components mit
// Server-Action-Formularen; einziges Client-Stück ist der ConfirmButton.

export interface BoardItem {
  clip: Clip;
  sourceTitle: string | null;
  posts: Post[];
}

const LIVE_POST_STATES = new Set(["uploading", "posted", "published"]);

// Statustexte kommen aus der Registry (web/lib/status.ts). Diese Datei hatte
// zwei eigene Tabellen, die der Registry widersprachen: `posted` war hier gelb
// „Übergeben", `published` hieß „Live" statt „Veröffentlicht", `failed` mal
// „Fehler" mal „Fehlgeschlagen". Dasselbe Wort muss überall dasselbe heißen.

export function formatWindow(start: number | null, end: number | null): string {
  if (start === null || end === null) return "—";
  const fmt = (value: number) => {
    const m = Math.floor(value / 60);
    const s = Math.round(value % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };
  return `${fmt(start)}–${fmt(end)} (${Math.round(end - start)} s)`;
}

function isDeletable(posts: Post[]): boolean {
  return posts.every((post) => !LIVE_POST_STATES.has(post.status));
}

/** Vorschau-Standbild aus der Fenster-Mitte; Platzhalter, solange keins existiert. */
function ClipThumb({ clip }: { clip: Clip }) {
  if (!clip.thumbPath) {
    return (
      <div className="flex aspect-video w-full max-w-[160px] items-center justify-center border border-dashed border-hairline text-[10px] uppercase tracking-[0.14em] text-ink-faint">
        Kein Bild
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- interner Same-Origin-Stream, kein next/image nötig
    <img
      src={`/api/clips/${clip.id}/thumb`}
      alt=""
      width={360}
      height={202}
      loading="lazy"
      className="w-full max-w-[160px] border border-hairline bg-ink/5"
    />
  );
}

/** Aufklappbarer SRT-Editor — Whisper-Fehler korrigieren, bevor eingebrannt wird. */
function SubtitleEditor({ clip }: { clip: Clip }) {
  return (
    <details>
      <summary className="cursor-pointer text-[13px] text-ink-soft underline-offset-4 hover:text-ink hover:underline">
        Untertitel bearbeiten
      </summary>
      <form action={updateSubtitlesAction} className="mt-3 space-y-3">
        <input type="hidden" name="clipId" value={clip.id} />
        <textarea
          name="subtitles"
          defaultValue={clip.subtitles ?? ""}
          rows={8}
          spellCheck={false}
          className="tnum w-full border border-hairline bg-transparent p-3 font-mono text-xs leading-relaxed focus:border-accent focus:shadow-[0_0_0_3px_rgb(124_92_255/0.18)] focus:outline-none"
          placeholder={"1\n00:00:00,000 --> 00:00:02,000\nText …"}
        />
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <Button type="submit" variant="ghost">
            Untertitel speichern
          </Button>
          <span className="text-xs text-ink-faint">
            {clip.renderedPath
              ? "Wird beim nächsten „Neu rendern“ eingebrannt"
              : "Wird beim Rendern eingebrannt · Feld leeren = ohne Untertitel"}
          </span>
        </div>
      </form>
    </details>
  );
}

function DeleteForm({ clip, label = "Endgültig löschen" }: { clip: Clip; label?: string }) {
  return (
    <form action={deleteClipAction}>
      <input type="hidden" name="clipId" value={clip.id} />
      <ConfirmButton message="Clip endgültig löschen? Video, Datensatz und offene Posts werden entfernt.">
        {label}
      </ConfirmButton>
    </form>
  );
}

function PostChips({ posts, timeZone }: { posts: Post[]; timeZone: string }) {
  if (posts.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {posts.map((post) => {
        const chip = POST_STATUS[post.status];
        const when =
          post.status === "published" || post.status === "posted"
            ? post.postedAt
            : post.scheduledAt;
        const body = (
          <span className="inline-flex items-baseline gap-1.5">
            <span className="font-semibold">
              {PLATFORM_SHORT[post.platform as PublishPlatform]}
            </span>
            <StatusText tone={chip.tone}>{chip.label}</StatusText>
            {when && (
              <span className="tnum text-ink-soft">
                {formatInTz(when, timeZone, "dd.MM. HH:mm")}
              </span>
            )}
          </span>
        );
        return (
          <li key={post.id} className="border border-hairline px-2 py-1 text-[11px]">
            {post.externalUrl ? (
              <a
                href={post.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {body} ↗
              </a>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Stufe 1 — Kandidaten: Ziele wählen, freigeben, aussortieren oder löschen. */
export function ReviewSection({
  items,
  defaultTargets,
}: {
  items: BoardItem[];
  defaultTargets: string[];
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        Keine offenen Kandidaten. Auf der{" "}
        <Link href="/sources" className="underline-offset-4 hover:underline">
          Quellen-Seite
        </Link>{" "}
        „Clips erzeugen" starten.
      </p>
    );
  }
  return (
    <div className="divide-y divide-hairline">
      {items.map(({ clip, sourceTitle }, index) => (
        <article
          key={clip.id}
          className="grid gap-6 py-8 md:grid-cols-[140px_1fr_260px]"
        >
          <div className="space-y-3">
            <ClipThumb clip={clip} />
            <p className="tnum text-xs text-ink-faint">
              Score{" "}
              <span className="text-base font-semibold text-ink">
                {clip.score !== null ? clip.score.toFixed(2) : "—"}
              </span>{" "}
              · Nr. {index + 1}
            </p>
          </div>

          <div className="min-w-0">
            <p className="text-sm font-medium">
              {sourceTitle ?? "Unbekannte Quelle"}
              <span className="tnum ml-3 text-xs text-ink-soft">
                {formatWindow(clip.startSeconds, clip.endSeconds)}
              </span>
            </p>
            {clip.caption && (
              <p className="mt-2 text-sm">
                {clip.caption}
                {clip.hashtags.length > 0 && (
                  <span className="ml-2 text-ink-soft">{clip.hashtags.join(" ")}</span>
                )}
              </p>
            )}
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
              {clip.transcript
                ? `„${clip.transcript.slice(0, 360)}${clip.transcript.length > 360 ? " …" : ""}"`
                : "Kein Transkript vorhanden."}
            </p>
            <div className="mt-4 max-w-2xl">
              <SubtitleEditor clip={clip} />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <form action={approveClipAction} className="space-y-4">
              <input type="hidden" name="clipId" value={clip.id} />
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
                  Ziel-Plattformen
                </p>
                <div className="flex flex-col gap-1">
                  {PUBLISH_PLATFORMS.map((platform) => (
                    <label key={platform} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="targets"
                        value={platform}
                        defaultChecked={defaultTargets.includes(platform)}
                        className="accent-ink"
                      />
                      {PLATFORM_LABELS[platform]}
                    </label>
                  ))}
                </div>
              </div>
              <Button type="submit" className="w-full">
                Freigeben
              </Button>
            </form>
            <form action={rejectClipAction}>
              <input type="hidden" name="clipId" value={clip.id} />
              <Button type="submit" variant="ghost" className="w-full">
                Aussortieren
              </Button>
            </form>
            <div className="text-center">
              <DeleteForm clip={clip} />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

/** Stufe 2 — In Produktion: Render-Status, Feinschliff, Posts im Blick. */
export function ProductionSection({
  items,
  timeZone,
}: {
  items: BoardItem[];
  timeZone: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-soft">Gerade nichts in Produktion.</p>;
  }
  return (
    <div className="grid gap-x-10 gap-y-12 md:grid-cols-2 xl:grid-cols-3">
      {items.map(({ clip, posts }) => {
        const status = CLIP_STATUS[clip.status];
        return (
          <article key={clip.id} className="flex flex-col gap-4">
            {clip.renderedPath ? (
              <video
                src={`/api/clips/${clip.id}/video`}
                controls
                preload="metadata"
                className="aspect-[9/16] w-full max-w-[280px] border border-hairline bg-ink/5"
              />
            ) : (
              <div className="flex aspect-[9/16] w-full max-w-[280px] items-center justify-center border border-dashed border-hairline">
                <StatusText tone="warn">Noch nicht gerendert</StatusText>
              </div>
            )}

            <div className="flex items-baseline justify-between gap-3">
              <StatusText tone={status.tone}>{status.label}</StatusText>
              <span className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">
                {clip.origin === "imported" ? "Import" : "Pipeline"}
                {clip.targets.length > 0 &&
                  ` · ${clip.targets.map((t) => PLATFORM_SHORT[t as PublishPlatform]).join(" ")}`}
              </span>
            </div>
            <PostChips posts={posts} timeZone={timeZone} />
            {posts.length > 0 && (
              <Link
                href="/posts"
                className="text-[13px] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
              >
                Im Zeitplan ansehen →
              </Link>
            )}
            {clip.error && <p className="text-xs text-err">{clip.error.slice(0, 160)}</p>}

            <form action={updateClipAction} className="space-y-4">
              <input type="hidden" name="clipId" value={clip.id} />
              <Field label="Titel">
                <Input
                  name="title"
                  defaultValue={clip.title ?? ""}
                  placeholder="Interner Titel / YouTube-Titel"
                />
              </Field>
              <Field label="Caption">
                <textarea
                  name="caption"
                  defaultValue={clip.caption ?? ""}
                  rows={3}
                  className="w-full border-0 border-b border-hairline bg-transparent py-2 text-[15px] placeholder:text-ink-faint focus:border-accent focus:shadow-[0_0_0_3px_rgb(124_92_255/0.18)] focus:outline-none"
                  placeholder="Caption für TikTok/Reels/Shorts"
                />
              </Field>
              <Field label="Hashtags (max. 6)">
                <Input
                  name="hashtags"
                  defaultValue={clip.hashtags.join(" ")}
                  placeholder="#david #clips"
                />
              </Field>
              <Button type="submit">Speichern</Button>
            </form>
            <SubtitleEditor clip={clip} />
            <div className="flex items-center justify-between gap-3">
              <form action={reRenderClipAction}>
                <input type="hidden" name="clipId" value={clip.id} />
                <Button type="submit" variant="ghost" disabled={clip.status === "rendering"}>
                  Neu rendern
                </Button>
              </form>
              {isDeletable(posts) && <DeleteForm clip={clip} label="Löschen" />}
            </div>
          </article>
        );
      })}
    </div>
  );
}

/** Stufe 3 — Live: mindestens ein Post ist übergeben oder öffentlich. */
export function LiveSection({ items, timeZone }: { items: BoardItem[]; timeZone: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-soft">Noch nichts veröffentlicht.</p>;
  }
  return (
    <div className="divide-y divide-hairline">
      {items.map(({ clip, posts, sourceTitle }) => (
        <article key={clip.id} className="flex flex-wrap items-baseline gap-x-6 gap-y-3 py-4">
          <p className="min-w-0 flex-1 truncate text-sm font-medium">
            {clip.title ?? clip.caption ?? sourceTitle ?? clip.id}
          </p>
          <PostChips posts={posts} timeZone={timeZone} />
          {clip.renderedPath && (
            <a
              href={`/api/clips/${clip.id}/video`}
              className="text-[13px] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
            >
              Video ansehen
            </a>
          )}
          <Link
            href="/analytics"
            className="text-[13px] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
          >
            Zahlen →
          </Link>
        </article>
      ))}
    </div>
  );
}

/** Stufe 4 — Aussortiert & Fehler: zurückholen, neu rendern oder löschen. */
export function ParkedSection({ items }: { items: BoardItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-soft">Nichts aussortiert — gute Quote.</p>;
  }
  return (
    <div className="divide-y divide-hairline">
      {items.map(({ clip, sourceTitle }) => {
        const status = CLIP_STATUS[clip.status];
        return (
          <article key={clip.id} className="flex flex-wrap items-baseline gap-x-6 gap-y-3 py-4">
            <div className="w-36 shrink-0">
              <StatusText tone={status.tone}>{status.label}</StatusText>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                {clip.caption ?? sourceTitle ?? "Ohne Titel"}
                <span className="tnum ml-3 text-xs text-ink-soft">
                  {formatWindow(clip.startSeconds, clip.endSeconds)}
                </span>
              </p>
              {clip.error && <p className="mt-1 text-xs text-err">{clip.error.slice(0, 200)}</p>}
            </div>
            <div className="flex items-center gap-4">
              <form action={restoreClipAction}>
                <input type="hidden" name="clipId" value={clip.id} />
                <Button type="submit" variant="ghost">
                  Zurückholen
                </Button>
              </form>
              {clip.status === "failed" && (
                <form action={reRenderClipAction}>
                  <input type="hidden" name="clipId" value={clip.id} />
                  <Button type="submit" variant="ghost">
                    Neu rendern
                  </Button>
                </form>
              )}
              <DeleteForm clip={clip} label="Löschen" />
            </div>
          </article>
        );
      })}
    </div>
  );
}
