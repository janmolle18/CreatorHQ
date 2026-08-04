import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  real,
  date,
  timestamp,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ───────────────────────── Enums ─────────────────────────

// Ziel-Plattformen fürs Publishing.
export const publishPlatformEnum = pgEnum("publish_platform", [
  "youtube",
  "instagram",
  "tiktok",
]);

// Plattform, von der Quellmaterial stammt.
export const sourcePlatformEnum = pgEnum("source_platform", [
  "youtube",
  "twitch",
  "upload",
]);

export const sourceKindEnum = pgEnum("source_kind", [
  "youtube_video",
  "youtube_stream",
  "twitch_vod",
  "upload",
]);

export const clipOriginEnum = pgEnum("clip_origin", [
  "pipeline", // aus der eigenen Clip-Pipeline
  "imported", // fertiger Clip (z. B. Davids Instagram-Clips)
]);

export const accountStatusEnum = pgEnum("account_status", [
  "disconnected", // angelegt, aber kein OAuth
  "connected", // OAuth aktiv, postbereit
  "expired", // Token ungültig → „Neu verbinden"
  "disabled", // manuell pausiert
]);

export const sourceStatusEnum = pgEnum("source_status", [
  "discovered",
  "downloading",
  "downloaded",
  "clipping",
  "clipped",
  "failed",
  // Fertiges Kurzvideo (Short): wird nie geschnitten, zählt nur für die Analyse.
  "reference",
]);

export const clipStatusEnum = pgEnum("clip_status", [
  "candidate", // von der Pipeline erkannt, wartet auf Review
  "approved", // freigegeben (targets gesetzt), wartet auf Render
  "rendering",
  "rendered", // fertiges 9:16-Video liegt in MinIO
  "scheduled", // Posts wurden erzeugt
  "rejected",
  "failed",
]);

export const postStatusEnum = pgEnum("post_status", [
  "draft",
  "scheduled",
  "uploading",
  "posted", // per API übergeben (z. B. TikTok-Inbox, YouTube privat)
  "published", // öffentlich live
  "awaiting_manual", // Manual-Fallback: Jan/David posten selbst
  "failed",
]);

export const ideaStatusEnum = pgEnum("idea_status", [
  "idea",
  "planned",
  "in_production",
  "published",
  "discarded",
]);

export const ideaSourceEnum = pgEnum("idea_source", [
  "manual",
  "briefing",
  "comment",
]);

export const briefingStatusEnum = pgEnum("briefing_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const calendarKindEnum = pgEnum("calendar_kind", [
  "shoot",
  "post",
  "stream",
  "other",
]);

export const tenantStatusEnum = pgEnum("tenant_status", [
  "trial",
  "active",
  // Zahlung offen: Der Mandant sieht weiter alles, aber nichts geht mehr raus.
  // Bewusst kein Datenverlust — gekündigt wird über "cancelled" + Aufbewahrungsfrist.
  "suspended",
  "cancelled",
]);

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner", // darf Konten verbinden, Abo ändern, Mitglieder einladen
  "editor", // darf Clips freigeben und posten, aber nichts Vertragliches
]);

export const emailTokenPurposeEnum = pgEnum("email_token_purpose", [
  "verify", // Adresse bestätigen
  "reset", // Passwort neu setzen
]);

// ─────────────────── JSONB-Strukturen ───────────────────

export interface BriefingContentIdea {
  title: string;
  description: string;
  targetPlatforms?: string[];
}

export interface BriefingReplyCandidate {
  commentId: string;
  whyWorthIt: string;
  replySketch: string;
}

export interface BriefingBrandRecommendation {
  area: string;
  finding: string;
  action: string;
}

// ─────────────────────── Tabellen ───────────────────────

// ───────────────── Mandanten, Nutzer, Mitgliedschaften ─────────────────
//
// Diese drei Tabellen sind die einzigen OHNE tenant_id — sie definieren ihn.
// Alles darunter gehört genau einem Mandanten und wird zusätzlich von
// Row Level Security in der Datenbank abgeschirmt (siehe rls.sql).

/** Ein zahlender Creator-Account. Datengrenze des gesamten Produkts. */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // Für Unterordner im Speicher und später für eigene Adressen.
  slug: text("slug").notNull().unique(),
  status: tenantStatusEnum("status").notNull().default("trial"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Ein Mensch mit Zugangsdaten. Bewusst getrennt vom Mandanten: Ein Creator
 * kann später ein zweites Konto führen, und ein Video-Editor kann für mehrere
 * Creator arbeiten, ohne dafür zwei Passwörter zu brauchen.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Immer kleingeschrieben gespeichert — sonst wären "A@x.de" und "a@x.de"
  // zwei Konten und die Eindeutigkeit wäre eine Illusion.
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  // Jans Blick über alle Mandanten. Niemals über die Oberfläche vergebbar.
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqMembership: unique("uq_membership_tenant_user").on(t.tenantId, t.userId),
    // „Zu welchen Mandanten gehöre ich?" — läuft bei jeder Anmeldung.
    ixUser: index("ix_membership_user").on(t.userId),
  })
);

/**
 * Einmal-Token für Adressbestätigung und Passwort-Zurücksetzen.
 *
 * Gespeichert wird NUR der Hash, nie das Token selbst — genau wie beim
 * Passwort. Wer die Datenbank liest, kann damit keine fremde Adresse
 * bestätigen und kein Passwort übernehmen.
 *
 * Ohne Mandantenregel: Ein Token wird eingelöst, BEVOR jemand angemeldet ist —
 * es kann dabei keinen gesetzten Mandanten geben.
 */
export const emailTokens = pgTable(
  "email_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: emailTokenPurposeEnum("purpose").notNull(),
    /** SHA-256 des Tokens, hex. */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Gesetzt beim Einlösen — ein Token gilt genau einmal. */
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqHash: unique("uq_email_token_hash").on(t.tokenHash),
    // „Alle offenen Token dieses Nutzers" — beim Neuanfordern werden die
    // alten entwertet, damit nicht mehrere gleichzeitig gültig sind.
    ixUser: index("ix_email_token_user").on(t.userId, t.purpose),
  })
);

// ───────────────────────── Mandanten-Daten ─────────────────────────

/** Eine Zeile je Mandant — die tenant_id IST der Primärschlüssel. */
export const settings = pgTable("settings", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  creatorName: text("creator_name").notNull(),
  youtubeChannelId: text("youtube_channel_id"),
  twitchUserId: text("twitch_user_id"),
  // IANA-Zeitzone; alle Slot-Zeiten werden in dieser Zone interpretiert.
  timezone: text("timezone").notNull().default("Europe/Berlin"),
  autoDiscovery: boolean("auto_discovery").notNull().default(false),
  // Hauptschalter fürs automatische Posten. Bewusst aus, bis die Konten
  // verbunden UND der Publish-Pfad geprüft ist: Alle wartenden Posts sind
  // überfällig, ein Anschalten ohne Drosselung würde sie binnen Minuten
  // gleichzeitig hochladen und das YouTube-Tageskontingent sprengen.
  autoPublish: boolean("auto_publish").notNull().default(false),
  defaultTargets: publishPlatformEnum("default_targets")
    .array()
    .notNull()
    .default(sql`'{}'::publish_platform[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Generalisiert ClipPilots `tiktok_accounts` für alle drei Plattformen.
export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    platform: publishPlatformEnum("platform").notNull(),
    handle: text("handle"),
    externalAccountId: text("external_account_id"),
    // Tokens NUR verschlüsselt (AES-256-GCM via @creatorhq/shared crypto).
    accessTokenEnc: text("access_token_enc"),
    refreshTokenEnc: text("refresh_token_enc"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    // Plattform-Spezifisches: igUserId, tiktokOpenId, googleChannelId, …
    authMeta: jsonb("auth_meta").$type<Record<string, string>>().notNull().default({}),
    clipsPerDay: integer("clips_per_day").notNull().default(1),
    // Posting-Slots als ["09:00","14:00","19:00"] — lokale Zeit in settings.timezone.
    timeSlots: text("time_slots").array().notNull().default(sql`'{}'::text[]`),
    status: accountStatusEnum("status").notNull().default("disconnected"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Je Mandant EIN Konto pro Plattform. Vorher war das global eindeutig —
    // damit hätte der zweite Kunde kein YouTube-Konto verbinden können.
    uqTenantPlatform: unique("uq_account_tenant_platform").on(t.tenantId, t.platform),
  })
);

// Wort-genaues Whisper-Transkript des kompletten Quellvideos.
// Wird einmal erzeugt und gecacht → „Erneut clippen" braucht keine neue Transkription.
export interface TranscriptWord {
  start: number;
  end: number;
  word: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words: TranscriptWord[];
}

export interface SourceTranscript {
  language: string | null;
  model: string;
  segments: TranscriptSegment[];
}

export const sourceVideos = pgTable(
  "source_videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sourceKind: sourceKindEnum("source_kind").notNull(),
    platform: sourcePlatformEnum("platform").notNull(),
    externalId: text("external_id").notNull(),
    url: text("url"),
    title: text("title"),
    durationSeconds: integer("duration_seconds"),
    storagePath: text("storage_path"), // S3-Key des heruntergeladenen Videos
    transcriptJson: jsonb("transcript_json").$type<SourceTranscript>(),
    status: sourceStatusEnum("status").notNull().default("discovered"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Mit tenant_id: Zwei Creator dürfen dasselbe öffentliche Video als Quelle
    // haben, ohne sich gegenseitig zu blockieren.
    uqExternal: unique("uq_source_tenant_platform_external").on(
      t.tenantId,
      t.platform,
      t.externalId
    ),
  })
);

export const clips = pgTable("clips",   {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // NULL bei importierten Clips (kein Quellvideo im System).
    sourceVideoId: uuid("source_video_id").references(() => sourceVideos.id, {
      onDelete: "cascade",
    }),
    origin: clipOriginEnum("origin").notNull().default("pipeline"),
    provider: text("provider"), // ffmpeg | import
    startSeconds: real("start_seconds"), // NULL bei Import
    endSeconds: real("end_seconds"), // NULL bei Import
    score: real("score"), // Highlight-Score 0..1
    transcript: text("transcript"),
    subtitles: text("subtitles"), // SRT (relativ zum Clip-Start), wird eingebrannt
    title: text("title"),
    caption: text("caption"),
    hashtags: text("hashtags").array().notNull().default(sql`'{}'::text[]`),
    renderedPath: text("rendered_path"), // S3-Key des fertigen 9:16-Clips
    thumbPath: text("thumb_path"), // S3-Key des Vorschau-Standbilds (Fenster-Mitte)
    // Bei Freigabe gewählte Ziel-Plattformen.
    targets: publishPlatformEnum("targets")
      .array()
      .notNull()
      .default(sql`'{}'::publish_platform[]`),
    status: clipStatusEnum("status").notNull().default("candidate"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Drei Sweeps im Sekundentakt filtern nach (Mandant, Status).
    ixTenantStatus: index("ix_clips_tenant_status").on(t.tenantId, t.status),
  })
);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clipId: uuid("clip_id")
      .notNull()
      .references(() => clips.id, { onDelete: "cascade" }),
    // NULL, wenn die Plattform nicht verbunden ist (Manual-Fallback).
    accountId: uuid("account_id").references(() => socialAccounts.id, {
      onDelete: "set null",
    }),
    platform: publishPlatformEnum("platform").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    externalPostId: text("external_post_id"),
    externalUrl: text("external_url"),
    captionOverride: text("caption_override"),
    status: postStatusEnum("status").notNull().default("draft"),
    error: text("error"),
    attemptCount: integer("attempt_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqClipPlatform: unique("uq_posts_clip_platform").on(t.clipId, t.platform),
  })
);

export const metricsSnapshots = pgTable(
  "metrics_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date").notNull(),
    platform: publishPlatformEnum("platform").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => socialAccounts.id, { onDelete: "cascade" }),
    // NULL = Account-Ebene (z. B. Follower), sonst Post-Ebene.
    postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
    // Gesetzt für Davids eigene Kanal-Videos (v. a. seine fertigen Shorts), die
    // nicht über CreatorHQ gepostet wurden — daraus lernen wir, was funktioniert.
    sourceVideoId: uuid("source_video_id").references(() => sourceVideos.id, {
      onDelete: "cascade",
    }),
    metrics: jsonb("metrics").$type<Record<string, number>>().notNull().default({}),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // NULLS NOT DISTINCT: auch Account-Ebene (postId + sourceVideoId NULL) ist
    // pro Tag eindeutig → der Daily-Job ist idempotent (Upsert statt Duplikate).
    uqSnapshot: unique("uq_snapshot_date_account_post")
      .on(t.snapshotDate, t.accountId, t.postId, t.sourceVideoId)
      .nullsNotDistinct(),
  })
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    platform: publishPlatformEnum("platform").notNull(),
    // NULL, wenn der Kommentar zu einem Video gehört, das nicht über CreatorHQ
    // gepostet wurde (z. B. Davids 4 Bestandsvideos).
    postId: uuid("post_id").references(() => posts.id, { onDelete: "set null" }),
    externalVideoId: text("external_video_id").notNull(),
    externalCommentId: text("external_comment_id").notNull(),
    author: text("author"),
    text: text("text").notNull(),
    likeCount: integer("like_count").notNull().default(0),
    replyCount: integer("reply_count").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    isReplied: boolean("is_replied").notNull().default(false),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqExternal: unique("uq_comments_tenant_platform_external").on(
      t.tenantId,
      t.platform,
      t.externalCommentId
    ),
  })
);

export const briefings = pgTable(
  "briefings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    briefingDate: date("briefing_date").notNull(),
    status: briefingStatusEnum("status").notNull().default("pending"),
    model: text("model"),
    summaryMd: text("summary_md"),
    contentIdeas: jsonb("content_ideas")
      .$type<BriefingContentIdea[]>()
      .notNull()
      .default([]),
    replyCandidates: jsonb("reply_candidates")
      .$type<BriefingReplyCandidate[]>()
      .notNull()
      .default([]),
    brandRecommendations: jsonb("brand_recommendations")
      .$type<BriefingBrandRecommendation[]>()
      .notNull()
      .default([]),
    // Der kompilierte Input (Kommentare, Trends, …), der ans LLM ging.
    inputDigest: jsonb("input_digest").$type<Record<string, unknown>>(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Ein Briefing je Mandant und Tag. Vorher war das Datum global eindeutig —
    // damit hätte es im ganzen Produkt täglich nur EIN Briefing gegeben.
    uqTenantDate: unique("uq_briefing_tenant_date").on(t.tenantId, t.briefingDate),
  })
);

export const ideas = pgTable("ideas",   {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: ideaStatusEnum("status").notNull().default("idea"),
    source: ideaSourceEnum("source").notNull().default("manual"),
    briefingId: uuid("briefing_id").references(() => briefings.id, {
      onDelete: "set null",
    }),
    commentId: uuid("comment_id").references(() => comments.id, {
      onDelete: "set null",
    }),
    targetPlatforms: publishPlatformEnum("target_platforms")
      .array()
      .notNull()
      .default(sql`'{}'::publish_platform[]`),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ixTenant: index("ix_ideas_tenant").on(t.tenantId),
  })
);

export const calendarItems = pgTable("calendar_items",   {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: calendarKindEnum("kind").notNull(),
    title: text("title").notNull(),
    ideaId: uuid("idea_id").references(() => ideas.id, { onDelete: "set null" }),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ixTenantStart: index("ix_calendar_tenant_start").on(t.tenantId, t.startsAt),
  })
);

// ─────────────────────── Relations ───────────────────────

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  settings: one(settings, {
    fields: [tenants.id],
    references: [settings.tenantId],
  }),
  memberships: many(memberships),
  socialAccounts: many(socialAccounts),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
}));

export const emailTokensRelations = relations(emailTokens, ({ one }) => ({
  user: one(users, { fields: [emailTokens.userId], references: [users.id] }),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  tenant: one(tenants, { fields: [memberships.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));

export const socialAccountsRelations = relations(socialAccounts, ({ many }) => ({
  posts: many(posts),
  metricsSnapshots: many(metricsSnapshots),
}));

export const sourceVideosRelations = relations(sourceVideos, ({ many }) => ({
  clips: many(clips),
}));

export const clipsRelations = relations(clips, ({ one, many }) => ({
  sourceVideo: one(sourceVideos, {
    fields: [clips.sourceVideoId],
    references: [sourceVideos.id],
  }),
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  clip: one(clips, { fields: [posts.clipId], references: [clips.id] }),
  account: one(socialAccounts, {
    fields: [posts.accountId],
    references: [socialAccounts.id],
  }),
  metricsSnapshots: many(metricsSnapshots),
  comments: many(comments),
}));

export const metricsSnapshotsRelations = relations(metricsSnapshots, ({ one }) => ({
  account: one(socialAccounts, {
    fields: [metricsSnapshots.accountId],
    references: [socialAccounts.id],
  }),
  post: one(posts, { fields: [metricsSnapshots.postId], references: [posts.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
}));

export const briefingsRelations = relations(briefings, ({ many }) => ({
  ideas: many(ideas),
}));

export const ideasRelations = relations(ideas, ({ one, many }) => ({
  briefing: one(briefings, {
    fields: [ideas.briefingId],
    references: [briefings.id],
  }),
  comment: one(comments, { fields: [ideas.commentId], references: [comments.id] }),
  calendarItems: many(calendarItems),
}));

export const calendarItemsRelations = relations(calendarItems, ({ one }) => ({
  idea: one(ideas, { fields: [calendarItems.ideaId], references: [ideas.id] }),
  post: one(posts, { fields: [calendarItems.postId], references: [posts.id] }),
}));

// ─────────────────────── Typen ───────────────────────

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type MembershipRole = (typeof membershipRoleEnum.enumValues)[number];
export type EmailToken = typeof emailTokens.$inferSelect;
export type NewEmailToken = typeof emailTokens.$inferInsert;
export type EmailTokenPurpose = (typeof emailTokenPurposeEnum.enumValues)[number];
export type TenantStatus = (typeof tenantStatusEnum.enumValues)[number];
export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;
export type SocialAccount = typeof socialAccounts.$inferSelect;
export type NewSocialAccount = typeof socialAccounts.$inferInsert;
export type SourceVideo = typeof sourceVideos.$inferSelect;
export type NewSourceVideo = typeof sourceVideos.$inferInsert;
export type Clip = typeof clips.$inferSelect;
export type NewClip = typeof clips.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type MetricsSnapshot = typeof metricsSnapshots.$inferSelect;
export type NewMetricsSnapshot = typeof metricsSnapshots.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type Briefing = typeof briefings.$inferSelect;
export type NewBriefing = typeof briefings.$inferInsert;
export type Idea = typeof ideas.$inferSelect;
export type NewIdea = typeof ideas.$inferInsert;
export type CalendarItem = typeof calendarItems.$inferSelect;
export type NewCalendarItem = typeof calendarItems.$inferInsert;
