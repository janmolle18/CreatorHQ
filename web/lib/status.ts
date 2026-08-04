import type { Briefing, Clip, Idea, Post, SocialAccount, SourceVideo } from "@creatorhq/db";

// Die EINZIGE Quelle für Statustexte und -farben im Dashboard.
//
// Vorher hatte jede Seite ihre eigene Tabelle — mit Widersprüchen: `posted`
// war einmal grün und einmal gelb, `published` hieß mal „Veröffentlicht" und
// mal „Live", `failed` mal „Fehler" und mal „Fehlgeschlagen".
//
// Die Farbregel, die alles entscheidet:
//   ok    (grün) = erledigt, der Creator muss nichts tun
//   warn  (gelb) = der Creator ist dran
//   err   (rot)  = kaputt, wir müssen ran
//   muted (grau) = läuft von allein
//
// Bewusst hier und nicht in shared/: shared/ ist der Vertrag zwischen Worker
// und Web — jede Wortänderung würde sonst einen Docker-Neubau erzwingen.
//
// Sprachregel für die ganze Oberfläche (die Wörter des Creators, nicht unsere):
//   Push → „hochladen" · Slot → „Zeit" · Backlog → „Ideen" · Ingest → „Quellen"
//   Publish-fertig → „Fertig zum Posten" · Snapshot → „Messung"
//   Queue/Worker/Render/Container gehören ausschließlich auf die System-Seite.

export type Tone = "ok" | "warn" | "err" | "muted";

export interface StatusMeta {
  /** Das Wort des Creators — überall identisch. */
  label: string;
  tone: Tone;
  /** Ein Satz Klartext, wo das Label allein nicht reicht. */
  hint?: string;
}

/**
 * Records sind exhaustiv über die DB-Enums typisiert: Ein neuer Enum-Wert
 * bricht den Typecheck, statt still als roher Datenbankwert durchzurutschen.
 */
export const POST_STATUS: Record<Post["status"], StatusMeta> = {
  draft: { label: "Entwurf", tone: "muted" },
  scheduled: { label: "Geplant", tone: "muted" },
  uploading: { label: "Wird hochgeladen", tone: "muted" },
  // Übergeben heißt NICHT veröffentlicht: Bei TikTok liegt das Video im
  // Posteingang, bei YouTube auf privat. Es fehlt noch ein Handgriff.
  posted: { label: "Übergeben — du bist dran", tone: "warn" },
  published: { label: "Veröffentlicht", tone: "ok" },
  awaiting_manual: { label: "Du bist dran", tone: "warn" },
  failed: { label: "Fehlgeschlagen", tone: "err" },
};

export const CLIP_STATUS: Record<Clip["status"], StatusMeta> = {
  candidate: { label: "Wartet auf dich", tone: "warn" },
  approved: { label: "Freigegeben", tone: "muted" },
  rendering: { label: "Wird fertiggemacht", tone: "muted" },
  rendered: { label: "Fertig zum Posten", tone: "ok" },
  scheduled: { label: "Eingeplant", tone: "ok" },
  rejected: { label: "Aussortiert", tone: "muted" },
  failed: { label: "Fehlgeschlagen", tone: "err" },
};

export const SOURCE_STATUS: Record<SourceVideo["status"], StatusMeta> = {
  discovered: { label: "Gefunden", tone: "muted" },
  downloading: { label: "Wird geladen", tone: "muted" },
  downloaded: { label: "Bereit zum Schneiden", tone: "ok" },
  clipping: { label: "Wird geschnitten", tone: "muted" },
  clipped: { label: "Geschnitten", tone: "ok" },
  failed: { label: "Fehlgeschlagen", tone: "err" },
  reference: { label: "Referenz", tone: "muted", hint: "wird nur gemessen" },
};

export const ACCOUNT_STATUS: Record<SocialAccount["status"], StatusMeta> = {
  disconnected: { label: "Nicht verbunden", tone: "muted" },
  connected: { label: "Verbunden", tone: "ok" },
  expired: { label: "Verbindung abgelaufen", tone: "err" },
  disabled: { label: "Pausiert", tone: "muted" },
};

export const BRIEFING_STATUS: Record<Briefing["status"], StatusMeta> = {
  pending: { label: "Wartet", tone: "muted" },
  running: { label: "Wird erstellt", tone: "muted" },
  completed: { label: "Fertig", tone: "ok" },
  failed: { label: "Fehlgeschlagen", tone: "err" },
};

export const IDEA_STATUS: Record<Idea["status"], StatusMeta> = {
  idea: { label: "Idee", tone: "muted" },
  planned: { label: "Geplant", tone: "muted" },
  in_production: { label: "In Arbeit", tone: "warn" },
  published: { label: "Veröffentlicht", tone: "ok" },
  discarded: { label: "Verworfen", tone: "muted" },
};

// ── Zustandsmengen ─────────────────────────────────────────────────────────
// Bisher mehrfach kopiert — und zweimal hieß Verschiedenes gleich:
// `LIVE_POST_STATES` bezeichnete auf der Clips-Seite einmal posted|published
// und einmal zusätzlich uploading. Deshalb hier mit sprechenden Namen.

/** Noch nicht draußen: neu planbar, verschiebbar, löschbar. */
export const POST_PENDING = new Set<Post["status"]>([
  "draft",
  "scheduled",
  "awaiting_manual",
  "failed",
]);

/** Bei der Plattform angekommen — der Clip zählt als veröffentlicht. */
export const POST_LIVE = new Set<Post["status"]>(["posted", "published"]);

/** Zusätzlich „uploading": in diesen Zuständen darf ein Clip nie gelöscht werden. */
export const POST_LOCKS_DELETE = new Set<Post["status"]>([
  "uploading",
  "posted",
  "published",
]);

export type PostUrgency = "overdue" | "today" | "later" | "done";

/**
 * Wie dringend ist ein Post? `todayEnd` ist das Ende des laufenden Tages in
 * Zeitzone des Creators — bewusst als Parameter, damit die Zeitzonen-Rechnung
 * einmal an der Seite passiert und nicht in jeder Zeile neu.
 */
export function postUrgency(
  post: Pick<Post, "status" | "scheduledAt">,
  now: Date,
  todayEnd: Date
): PostUrgency {
  if (!POST_PENDING.has(post.status)) return "done";
  if (post.scheduledAt === null) return "later";
  if (post.scheduledAt < now) return "overdue";
  return post.scheduledAt <= todayEnd ? "today" : "later";
}
