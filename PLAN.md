# CreatorHQ — Creator Dashboard für David (@davidvorkamera)

> Dieser Plan wird per `/loop` abgearbeitet: pro Iteration EINE Phase, verifizieren, Checkbox unten abhaken, Ergebnisprotokoll unter der Phase notieren, ein Git-Commit (conventional commits). Blockierte Phasen als `[BLOCKED: …]` markieren und weitermachen.

## Phasen-Status

- [x] Phase 0 — Bootstrap (Repo, PLAN.md, .env.example, Initial-Commit) — *erledigt in der Planungs-Session, 30.07.2026*
- [x] Phase 1 — Fundament: Monorepo, Infra, Schema — *erledigt 30.07.2026*
- [x] Phase 2 — Auth + Web-Grundgerüst + Design-System — *erledigt 30.07.2026*
- [x] Phase 3 — Quellen-Ingest: Davids Videos + Instagram-Clip-Import — *erledigt 30.07.2026 (Kanal-Scan läuft ohne Key über yt-dlp-Fallback; API-Pfad aktiviert sich, sobald Jan YOUTUBE_API_KEY einträgt — TODO 2)*
- [x] Phase 4 — Clip-Pipeline: Clipping, Whisper, Claude-Captions, Render, Review — *erledigt 30.07.2026 (Captions laufen bis zum Eintrag von ANTHROPIC_API_KEY über den Heuristik-Fallback — TODO 1)*
- [ ] Phase 5 — Accounts, Scheduling, TikTok-Publishing + Manual-Fallback — **[BLOCKED: TikTok-Keys fehlen (Jan-TODO 3). Anleitung: developers.tiktok.com → App anlegen (Sandbox) → Login Kit + Content Posting API aktivieren → Redirect-URI `http://localhost:3000/api/oauth/tiktok/callback` eintragen → `TIKTOK_CLIENT_KEY/SECRET/REDIRECT_URI` in `.env` → David als Sandbox-Target-User hinzufügen → unter /accounts „Verbinden". Alles Übrige ist gebaut und verifiziert (30.07.2026): Scheduling DST-korrekt, Publish-Dispatch, kompletter Manual-Fallback grün — nur der Sandbox-Draft-Test in Davids Inbox steht aus.]**
- [ ] Phase 6 — YouTube-Shorts-Publishing — **[BLOCKED: Google-OAuth-Client fehlt (Jan-TODO 5). Anleitung: console.cloud.google.com → Projekt anlegen → „YouTube Data API v3" + „YouTube Analytics API" aktivieren → OAuth-Zustimmungsbildschirm (Testnutzer: Davids Google-Konto) → OAuth-Client (Webanwendung) mit Redirect-URI `http://localhost:3000/api/oauth/google/callback` → `GOOGLE_CLIENT_ID/SECRET` in `.env` → unter /accounts YouTube „Verbinden". API-Audit-Formular früh einreichen (bis dahin lädt die API privat hoch → Studio-Veröffentlichung). Alles Übrige gebaut + verifiziert (30.07.2026): Resumable-Upload, Metadata-Mapping, Quota-Zähler, Studio-Fallback, sauberer Key-los-Fallback.]**
- [ ] Phase 7 — Instagram-Reels-Publishing — **[BLOCKED: Meta-App + öffentliche Domain fehlen (Jan-TODOs 4+6). Anleitung: (a) developers.facebook.com → App „Instagram API with Instagram Login" (Dev-Modus) → `IG_APP_ID/SECRET` + Redirect-URI `<PUBLIC>/api/oauth/instagram/callback` in `.env`; Davids IG auf Creator umstellen + als Instagram-Tester einladen (er bestätigt in den IG-Einstellungen). (b) Benannter Cloudflare Tunnel mit fester Domain auf localhost:3000 → HTTPS-Origin als `PUBLIC_MEDIA_BASE_URL` in `.env` (Reels brauchen eine öffentlich abrufbare video_url). Alles Übrige gebaut + verifiziert (30.07.2026): Container-Flow, Status-Polling, signierte Public-Media-Route, wöchentlicher Token-Refresh, sauberer Fallback.]**
- [x] Phase 8 — Analytics: Daily Snapshots + Verlaufs-Charts — *erledigt 30.07.2026 (YouTube liefert schon jetzt keyless echte Zahlen; IG/TikTok-Fetcher aktivieren sich mit den OAuth-Verbindungen aus Phase 5–7)*
- [x] Phase 9 — Kommentare + tägliches KI-Briefing — LIVE verifiziert 01.08.2026: ANTHROPIC_API_KEY + YOUTUBE_API_KEY aktiv, Kommentar-Sync per API (52 Kommentare), Claude-Briefing (sonnet-5) mit Lagebild + 6 Video-Ideen in 30 s, neuer „Briefing jetzt erstellen"-Knopf.
- [x] Phase 10 — Content-Planung: Ideen-Backlog + Kalender + Übersicht final — *erledigt 31.07.2026*

## Kontext

Jans Kollege David (YouTube: https://www.youtube.com/@davidvorkamera, 4 bestehende Videos, startet mit Streaming, hat bereits fertige Instagram-Clips) will über Clips auf TikTok, Instagram und YouTube Shorts wachsen. Jan hat mit **ClipPilot** bereits eine erprobte Clip-Pipeline gebaut (Download → KI-Clipping → Whisper-Untertitel → 9:16-Render → Scheduling → TikTok-Upload). Daraus entsteht dieses **neue, eigenständige Projekt**: ein Creator Dashboard mit Multi-Plattform-Publishing, täglichen Analytics, einem KI-Briefing (Kommentar-Auswertung → Video-Ideen, Kommentar-Antwort-Videos, Brand-Building-Empfehlungen) und integrierter Content-Planung. UI: minimalistisch, modern, typografie-getrieben — **keine Icon-Bibliotheken, keine Emojis**.

## Entscheidungen (Jan, 30.07.2026)

| Thema | Entscheidung |
|---|---|
| Projektname / Pfad | **CreatorHQ** → `/Users/janmollemeier/Documents/Projekte claude/Projekte/CreatorHQ` |
| LLM | **Alles Claude API** (Captions: `claude-haiku-4-5-20251001`, Briefing: `claude-sonnet-5`, per Env konfigurierbar). Kein Ollama, kein Ollama-Container. |
| Plattform-APIs | Alle drei einrichten: TikTok Developer-App (Sandbox, David als Target-User), Meta/Instagram-App im Development-Modus (David als Instagram-Tester), Google/YouTube OAuth (+ API-Audit früh beantragen). Für jede Plattform existiert zusätzlich immer ein Manual-Fallback. |
| Streaming-Plattform | Noch unklar → Twitch-Discovery UND YouTube-Uploads-Playlist beide vorbereiten, Auswahl in Einstellungen. |
| Betrieb | Start auf dem Mac (Docker Compose wie ClipPilot). VPS-Umzug optional später. |
| Auth | Ein Admin-Login (Jan) reicht. Kein Multi-Tenant. |
| Public-Media-URL / OAuth-Redirects | Benannter Cloudflare Tunnel mit fester Domain (bevorzugt) oder öffentlicher R2/S3-Bucket nur für publish-fertige Clips. NIE flüchtige `trycloudflare.com`-Quick-Tunnels (ClipPilot-Falle). → Jan-TODO: Domain klären. |

## Referenz-Codebasis: ClipPilot

**Aktiver Code:** `/Users/janmollemeier/Documents/Projekte claude/Projekte/ClipPilot` (Monorepo: npm workspaces `db`, `worker`, `web`; Next.js 15 + Tailwind 4, BullMQ + Redis, Postgres 16 + Drizzle, MinIO, yt-dlp, ffmpeg, faster-whisper, TikTok Content Posting API v2 mit PKCE).

⚠️ **Stolperfalle:** `/Users/janmollemeier/Documents/Projekte claude/ClipPilot` (Root-Ebene) ist NUR ein Docker-Artefakt-Ordner (leere Bind-Mounts + alte Laufzeitdaten). Nicht als Quelle verwenden. ClipPilot nur LESEN, nie verändern.

### Übernahme-Matrix (ClipPilot → CreatorHQ)

| ClipPilot-Datei (relativ zu `Projekte/ClipPilot/`) | Ziel in CreatorHQ | Modus |
|---|---|---|
| `worker/src/integrations/storage.ts` | gleich | 1:1 (Env-Namen anpassen) |
| `worker/src/integrations/transcribe.ts` + `worker/whisper/transcribe.py` | gleich | 1:1 |
| `worker/src/clip/{ClipProvider,ffmpeg,index}.ts` | gleich | 1:1; `clipsai.ts`/`vizard.ts` NICHT übernehmen (tot / ohne Key) |
| `worker/src/jobs/download.ts` | gleich | fast 1:1 (Cookies optional, Statusmodell) |
| `worker/src/jobs/render.ts` | gleich | 1:1 (9:16 Blur-Reframe + SRT-Burn-in ist erprobt) |
| `worker/src/jobs/clip.ts` | gleich | leicht angepasst (kein `streamerId`) |
| `worker/src/{queues,logger,env}.ts` | gleich | Muster übernehmen, Inhalte erweitern |
| `worker/src/integrations/tiktok.ts` | gleich | Refactor: Chunked-Upload (Stream statt RAM), Retry/429, `expired`-Handling |
| `worker/src/integrations/{youtube,twitch}.ts` | gleich | 1:1 (Discovery); YouTube wird stark erweitert |
| `worker/src/jobs/schedule.ts` | gleich | **NEUSCHREIBEN** (Zeitzonen-Bug, Multi-Platform) |
| `worker/src/jobs/post.ts` | `worker/src/jobs/publish.ts` | **NEUSCHREIBEN** (Platform-Dispatch, Token-Mutex) |
| `worker/src/jobs/analytics.ts` | — | **NEUSCHREIBEN** (war nur Stub) |
| `db/src/client.ts` (Lazy-Proxy-Singleton) | gleich | 1:1 |
| `db/src/schema.ts` | gleich | **NEUSCHREIBEN** (siehe Datenmodell) |
| `web/app/actions.ts`-Muster (Server Actions, kein REST) | `web/app/**/actions.ts` | Muster + Zod-Validierung + Auth-Guard |
| `web/app/api/tiktok/{authorize,callback}/route.ts` | `web/app/api/oauth/tiktok/*` | Refactor zu generischem OAuth-Muster je Plattform |
| `web/app/api/clips/[id]/video/route.ts` (Range-Proxy für MinIO) | gleich | 1:1 + Auth-Guard |
| `docker-compose.yml`, `worker/Dockerfile`, `web/Dockerfile`, `Caddyfile` | gleich | fast 1:1, OHNE ollama/clipsai-Services |
| `scripts/*.mjs` (enqueue/clear/trigger) | `scripts/` | Muster übernehmen, pro Phase erweitern |

## Ziel-Architektur

```
CreatorHQ/
  db/        @creatorhq/db      Drizzle-Schema, Client, Migrationen
  shared/    @creatorhq/shared  crypto (AES-256-GCM), platforms, time (date-fns-tz), Zod-Schemas
  worker/    @creatorhq/worker  BullMQ-Jobs, Integrationen, ffmpeg/whisper/yt-dlp
  web/       @creatorhq/web     Next.js 15 App Router, Server Actions, Auth-Middleware
  scripts/   Trigger- und Verifikations-Skripte
  docker-compose.yml (postgres:16, redis:7, minio; prod-Profil: caddy)
```

Queues (BullMQ): `download`, `clip`, `render`, `publish`, `analytics`, `comments`, `briefing`, `maintenance` (Repeatables: `discovery-tick`, `promote-approved`, `due-posts`, `daily-analytics`, `daily-briefing`, `refresh-ig-token`).

### Datenmodell (`db/src/schema.ts`, komplett neu)

Enums: `publish_platform` (youtube|instagram|tiktok), `source_kind` (youtube_video|youtube_stream|twitch_vod|upload), `clip_origin` (pipeline|imported), `account_status` (disconnected|connected|expired|disabled), `source_status`, `clip_status`, `post_status` (draft|scheduled|uploading|posted|published|awaiting_manual|failed), `idea_status` (idea|planned|in_production|published|discarded), `calendar_kind` (shoot|post|stream|other).

Tabellen:
- **settings** — Single-Row (id fix `"default"`): creatorName, youtubeChannelId, twitchUserId, timezone (Default `Europe/Berlin`), autoDiscovery, defaultTargets. Ersetzt ClipPilots `streamers`.
- **social_accounts** — generalisiert `tiktok_accounts`: platform (unique), handle, externalAccountId, **accessTokenEnc/refreshTokenEnc (AES-256-GCM via `shared/crypto`)**, tokenExpiresAt, scopes, authMeta (jsonb: igUserId etc.), clipsPerDay, timeSlots (lokale Zeiten in settings.timezone), status, lastError.
- **source_videos** — sourceKind, platform, externalId, url, title, durationSeconds, storagePath, status. Unique `(platform, externalId)`.
- **clips** — sourceVideoId (NULL bei Import), origin, provider, start/endSeconds (NULL bei Import), score, transcript, subtitles (SRT), title, caption, hashtags, renderedPath, **targets (publish_platform[], bei Freigabe gewählt)**, status. Importierte IG-Clips: `origin='imported', status='rendered'`.
- **posts** — clipId, accountId, platform, scheduledAt, postedAt, externalPostId, externalUrl, captionOverride, status, error, attemptCount. Unique `(clipId, platform)`.
- **metrics_snapshots** — snapshotDate, platform, accountId, postId (NULL = Account-Ebene: Follower), metrics (jsonb), capturedAt. Unique `(snapshotDate, accountId, postId)` → idempotenter Daily-Job.
- **comments** — platform, postId (NULL ok), externalVideoId (auch Kommentare zu Davids 4 Bestandsvideos), externalCommentId, author, text, likeCount, replyCount, publishedAt, isReplied, raw. Unique `(platform, externalCommentId)`.
- **briefings** — briefingDate (unique), status, model, summaryMd, contentIdeas (jsonb), replyCandidates (jsonb: {commentId, whyWorthIt, replySketch}), brandRecommendations (jsonb: {area, finding, action}), inputDigest, error.
- **ideas** — title, description, status, source (manual|briefing|comment), briefingId, commentId, targetPlatforms, notes.
- **calendar_items** — kind, title, ideaId, postId, startsAt, endsAt, allDay, notes. Kalender mischt calendar_items + posts.scheduledAt.

Kein users-Table: Login via `ADMIN_PASSWORD_HASH` (scrypt, `node:crypto`) + signierte HttpOnly-Session-Cookies (jose).

### Plattform-Strategien

- **TikTok:** Content Posting API v2 + PKCE (aus ClipPilot). Ohne App-Audit: Inbox/Draft-Modus (Video landet in Davids TikTok-Inbox, 2 Taps zum Posten) — akzeptierter Dauerzustand. `video.list`-Scope für Analytics. Kommentare via API praktisch nicht verfügbar → im Briefing auslassen.
- **YouTube:** `videos.insert` Resumable Upload (Scope `youtube.upload`), 9:16 ≤ 3 Min = automatisch Short. Quota 1600 Units/Upload bei 10.000/Tag → reicht locker. **Bis zum bestandenen API-Audit werden API-Uploads auf privat gesperrt** → Upload als `private` + Status `awaiting_manual` („In YouTube Studio veröffentlichen"), Audit früh beantragen. Analytics via YouTube Analytics API (eigene Quota), Kommentare via `commentThreads.list` (nur API-Key nötig!).
- **Instagram:** „Instagram API with Instagram Login" (graph.instagram.com, KEINE Facebook-Page nötig). Scopes: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_insights`. Development-Modus + David als Instagram-Tester = **kein App-Review nötig**. Flow: Container erstellen (`media_type=REELS`, `video_url` muss öffentlich per HTTPS abrufbar sein!) → Status pollen → publish. Long-lived Token (60 Tage) + wöchentlicher Refresh-Job.
- **Manual-Fallback (alle Plattformen, immer verfügbar):** Post-Status `awaiting_manual` → Posts-Seite bietet Datei-Download + Caption kopieren + „Als veröffentlicht markieren" (mit URL-Feld). Dadurch blockiert kein fehlender Key jemals die Pipeline.

## Phasen (je eine Loop-Iteration, je mit Verifikation + Git-Commit)

### Phase 1 — Fundament: Monorepo, Infra, Schema
**Ziel:** Lauffähiges Gerüst mit kompletter Ziel-DB.
- Root `package.json` (workspaces, Scripts: `check` = typecheck+vitest, `db:generate`, `db:migrate`, `web:dev`, `worker:dev`), `.gitignore`, `.env.example` (ALLE Variablen dokumentiert), `README.md`
- `docker-compose.yml` (postgres, redis, minio — Basis aus ClipPilot, ohne ollama/clipsai)
- `db/src/schema.ts` (komplettes Modell), `db/src/client.ts` (1:1), Migration generieren
- `shared/src/crypto.ts` (AES-256-GCM, Key `APP_ENCRYPTION_KEY`), `shared/src/platforms.ts`, `shared/src/time.ts` (date-fns-tz), Tests dazu
- vitest-Setup im Root
**Verifikation:** `docker compose up -d postgres redis minio` → `npm run db:migrate` → alle 10 Tabellen existieren (psql `\dt`) → `npm run check` grün → Commit.

### Phase 2 — Auth + Web-Grundgerüst + Design-System
**Ziel:** Geschütztes, leeres Dashboard im Ziel-Design.
- `web/lib/auth.ts` (scrypt-Verify gegen `ADMIN_PASSWORD_HASH`, jose-Session-Cookie, `requireSession()` für alle Server Actions), `web/middleware.ts` (schützt alles außer `/login`, `/api/oauth/*`), `web/app/login/page.tsx` (+ einfachem Rate-Limit)
- **Design-Richtung: helles, typografie-getriebenes Swiss/Editorial-Minimal.** `next/font` (Geist oder Inter), near-black auf Weiß, Hairline-Borders, `tabular-nums` für Zahlen, großzügiger Weißraum, klare Größen-Hierarchie. **Keine Icon-Bibliothek, keine Emojis, keine Component-Library** — Navigation und Aktionen rein typografisch. Design-Tokens als CSS-Variablen in `web/app/globals.css`.
- `web/components/ui.tsx` — wenige selbstgebaute Primitive: PageHeader, Stat, Table, EmptyState, Button, StatusText
- `web/app/layout.tsx` (schmale Textnavigation: Übersicht, Quellen, Clips, Review, Posts, Analytics, Briefing, Planung, Kalender, Einstellungen), `web/app/page.tsx` (KPI-Platzhalter + Infra-Status DB/Redis/MinIO), `web/app/settings/page.tsx` (settings-Row editieren)
- `scripts/hash-password.mjs`
**Verifikation:** Ohne Cookie → Redirect auf `/login`; falsches Passwort abgelehnt; nach Login Übersicht mit grünem Infra-Status. Browser-Check (Preview) bei 320/768/1440 px. `npm run check` grün → Commit.

### Phase 3 — Quellen-Ingest: Davids Videos + Instagram-Clip-Import
**Ziel:** Alles Quellmaterial im System.
- `worker/src/{index,env,logger,queues}.ts`, `worker/Dockerfile` (node22 + ffmpeg + yt-dlp + faster-whisper, aus ClipPilot)
- `worker/src/integrations/storage.ts`, `worker/src/jobs/download.ts` (übernommen), `worker/src/integrations/{youtube,twitch}.ts` (Discovery; YouTube-Uploads-Playlist + Twitch-VODs, beide vorbereitet, Auswahl über settings)
- `web/app/sources/page.tsx` + actions: YouTube/Twitch-URL einfügen → source_videos-Row + Download-Job; Statusliste; „Kanal scannen"-Button (holt alle Videos von @davidvorkamera via YouTube Data API)
- **IG-Import:** `web/app/import/page.tsx` + Upload-Route: Multi-File-Upload (mp4) → MinIO → clips-Row (`origin='imported'`, `status='rendered'`); ffprobe-Validierung (Dauer, Seitenverhältnis) im Worker, bei nicht-9:16 optional Blur-Reframe via Render-Job
**Verifikation:** Kanal-Scan findet Davids 4 Videos → alle 4 erreichen `downloaded` (Objekte in MinIO); 1 Test-mp4-Upload erscheint als importierter Clip. Unit-Test URL-Parsing. → Commit.

### Phase 4 — Clip-Pipeline: Clipping, Whisper, Claude-Captions, Render, Review
**Ziel:** Aus Quellvideo werden freigabefertige 9:16-Clips mit Untertiteln und Caption.
- `worker/src/clip/*` (1:1), `worker/src/jobs/clip.ts`, `worker/whisper/` + `transcribe.ts` (1:1)
- `worker/src/integrations/llm.ts`: **Claude API via fetch** (Env: `ANTHROPIC_API_KEY`, `CAPTION_MODEL=claude-haiku-4-5-20251001`, `BRIEFING_MODEL=claude-sonnet-5`). `generateCaption()` → deutsche Caption + max 6 Hashtags, Zod-validiertes JSON, 1 Retry, Heuristik-Fallback
- `worker/src/jobs/{enrich,render}.ts` (render 1:1 inkl. SRT-Burn-in), Maintenance `promote-approved`
- `web/app/review/page.tsx` (Kandidaten nach Score, Transkript, **Freigeben mit Plattform-Checkboxen → clips.targets**, Ablehnen), `web/app/clips/page.tsx` (9:16-Player, Caption/Hashtags editieren, Re-Render), Video-Range-Proxy-Route (1:1 + Auth)
**Verifikation:** Clip-Job für eines der 4 Videos → Kandidaten mit Transkript in DB → einen freigeben → gerenderter 9:16-Clip mit eingebrannten Untertiteln, im Dashboard abspielbar. Unit-Tests: Hashtag-Normalisierung, LLM-JSON-Parsing. → Commit.

### Phase 5 — Accounts, Scheduling, TikTok-Publishing + Manual-Fallback
**Ziel:** Freigegebene Clips werden zeitzonen-korrekt geplant; TikTok komplett; jeder Post notfalls manuell abwickelbar.
- `web/app/accounts/page.tsx` + `web/app/api/oauth/tiktok/{authorize,callback}` (PKCE aus ClipPilot; Tokens verschlüsselt speichern)
- `worker/src/jobs/schedule.ts` **NEU**: Slots in `settings.timezone` via date-fns-tz (behebt UTC-Bug), pro Ziel-Plattform aus `clips.targets` ein posts-Eintrag, Unit-Tests inkl. **DST-Wechsel**
- `worker/src/jobs/publish.ts` **NEU**: Dispatch nach platform; `withFreshToken(accountId)` mit **Redis-Lock** (behebt Refresh-Race), setzt `status='expired'` bei invalid_grant + UI-Hinweis „Neu verbinden"
- `worker/src/integrations/tiktok.ts` refactored: **Chunked-Upload per Stream**; `worker/src/integrations/http.ts` (Retry/Backoff + Retry-After für 429/5xx, überall genutzt)
- Manual-Fallback: `web/app/posts/page.tsx` — Zeitplan aller Posts, bei `awaiting_manual`: Download-Button + Caption kopieren + „Als veröffentlicht markieren" (URL-Feld)
- Maintenance `due-posts`
**Verifikation:** Unit-Tests Slot-Logik (09/14/19 Berlin → korrekte UTC-Instants, Sommer/Winter); Freigabe mit Ziel TikTok → posts-Row; ohne Keys → sauber `awaiting_manual` + manuell abschließbar; mit Keys (Sandbox): Draft erscheint in Davids TikTok-Inbox. → Commit. *(BLOCKED-fähig: TikTok-Keys — Fallback-Weg muss trotzdem grün sein.)*

### Phase 6 — YouTube-Shorts-Publishing
**Ziel:** Clips landen per API (zunächst privat) auf Davids Kanal.
- `web/app/api/oauth/google/{authorize,callback}` (`access_type=offline`, Scopes: youtube.upload, youtube.readonly, yt-analytics.readonly)
- `worker/src/integrations/youtube-upload.ts`: Resumable Upload, Metadaten aus Titel/Caption/Hashtags, `privacyStatus` aus Env; Quota-Zähler in Redis (Warnung ab 8000 Units/Tag)
- publish.ts: YouTube-Zweig; bis Audit bestanden → nach Upload `awaiting_manual` mit Studio-Link
**Verifikation:** Test-Clip → Video (privat) auf dem Kanal, Video-ID+URL in DB, Quota-Zähler zählt. Unit-Test Metadata-Mapping (Titellänge, Tag-Limits). → Commit. *(BLOCKED-fähig: Google-OAuth-Client.)*

### Phase 7 — Instagram-Reels-Publishing
**Ziel:** Reels per API; öffentliche Medien-URL gelöst.
- `web/app/api/oauth/instagram/{authorize,callback}` (Instagram-Login-Flow, short→long-lived Token, igUserId in authMeta)
- `worker/src/integrations/instagram.ts`: `createReelContainer(videoUrl, caption)` → Status-Polling → publish; Fehler-Mapping
- `worker/src/integrations/publicMedia.ts`: liefert öffentliche HTTPS-URL für renderedPath (benannter Cloudflare Tunnel vor Presigned-URL ODER Kopie in public R2-Bucket; Cleanup nach Publish)
- Maintenance `refresh-ig-token` (wöchentlich)
**Verifikation:** Test-Reel auf Davids IG (Dev-Modus) → externalPostId+URL in DB; ohne Meta-App → sauber `awaiting_manual`. ffprobe-Validierung vor Publish. → Commit. *(BLOCKED-fähig: Meta-App + Domain/Tunnel.)*

### Phase 8 — Analytics: Daily Snapshots + Verlaufs-Charts
**Ziel:** Tägliche Kennzahlen je Plattform/Post, Verläufe im Dashboard.
- `worker/src/jobs/analytics.ts` **NEU**: täglicher Repeatable (Cron, tz-aware): YouTube Analytics API (Tageswerte je Video + Kanal, Abonnenten) + IG Insights (Reel-Metriken, followers_count) + TikTok video.list → Upsert in metrics_snapshots
- `web/app/analytics/page.tsx`: Follower-Verlauf je Plattform, Views/Likes je Post, Zeitraum 7/30/90 Tage
- `web/components/charts.tsx`: **handgebaute SVG-Linien/Balken-Charts als Server Components** (keine Chart-Library)
- `scripts/run-analytics.mjs`
**Verifikation:** Manueller Trigger → Snapshot-Rows je verbundener Plattform; zweiter Lauf am selben Tag dupliziert nicht (Upsert); Charts rendern mit echten Daten. Unit-Test Metrik-Normalisierung. → Commit.

### Phase 9 — Kommentare + tägliches KI-Briefing
**Ziel:** Kommentare gesammelt, Claude-Auswertung als „Daily Briefing".
- `worker/src/integrations/comments.ts`: YouTube commentThreads.list (per API-Key, ALLE Kanal-Videos inkl. der 4 Bestandsvideos), IG Comments → Upsert in comments (TikTok bewusst ausgelassen — API gibt es nicht her)
- `worker/src/jobs/briefing.ts`: täglich nach Analytics; inputDigest bauen (neue + Top-Kommentare, 7-Tage-Trends, Posting-Frequenz, offene Ideen) → **Claude (`BRIEFING_MODEL`)** mit striktem Zod-JSON-Schema → briefings-Row mit 3 Sektionen: (a) Video-Ideen, (b) Kommentar-Antwort-Video-Kandidaten (welcher Kommentar + warum + Antwort-Skizze), (c) Brand-Building-Empfehlungen (Frequenz, Formate, Bio, Cross-Links, Nische). 1 Retry, sonst `failed` mit Rohtext.
- `web/app/briefing/page.tsx` (heutiges Briefing, Kommentar-Zitate mit Links) + Archiv `[date]/page.tsx`; Aktion „**Als Idee übernehmen**" → ideas-Row (`source='briefing'`)
- `scripts/run-briefing.mjs`
**Verifikation:** Manueller Lauf mit ECHTEN YouTube-Kommentaren der 4 Videos → valides Briefing in DB + UI; „Als Idee übernehmen" funktioniert. Unit-Tests: Digest-Builder, Zod-Schema. → Commit.

### Phase 10 — Content-Planung: Ideen-Backlog + Kalender + Übersicht final
**Ziel:** Ideen-Workflow + Kalender, Dashboard-Übersicht fertig.
- `web/app/planning/page.tsx`: Backlog als typografische Status-Spalten (Idee → geplant → in Produktion → veröffentlicht), Statuswechsel per Buttons (kein DnD-Framework), Herkunft (Briefing/Kommentar) sichtbar
- `web/app/calendar/page.tsx`: selbstgebautes Monatsraster (Server Component); zeigt calendar_items (Drehs/Streams) + posts.scheduledAt (Plattform-Kürzel YT/IG/TT); aus Idee „Dreh planen" → calendar_items
- `web/app/page.tsx` final: Follower gesamt, Views 7 Tage, nächste Posts, offene Review-Kandidaten, Link zum heutigen Briefing
- README-Endstand: Setup, Betriebs-Runbook (OAuth-Verbindungen, Audit-Status, Fallback-Workflows, tägliche Jobs)
**Verifikation:** Briefing-Idee → planned → Dreh im Kalender neben geplanten Posts; Statuskette bis published durchklickbar; End-to-End-Smoke über alle Seiten (Browser-Preview, 320/768/1440); `npm run check` grün. → Commit.

## ClipPilot-Schwächen, die CreatorHQ behebt

| Schwäche in ClipPilot | Fix | Phase |
|---|---|---|
| Keinerlei Auth (Dashboard offen) | Middleware + Session + Action-Guards | 2 |
| Kein Git-Repo | git init ab Tag 1, Commit je Phase | 0 |
| Keine Tests | vitest ab Phase 1, Pflicht-Tests je Phase (Kernlogik: shared, schedule, LLM-Parsing) | alle |
| Klartext-Tokens in DB | AES-256-GCM, nur `*Enc`-Spalten | 1, 5 |
| Zeitzonen-Bug (Slots in Container-UTC) | date-fns-tz + settings.timezone, DST-Tests | 5 |
| `expired`-Status nie gesetzt | invalid_grant → expired + „Neu verbinden"-UI | 5 |
| Token-Refresh-Race (concurrency 2) | Redis-Lock pro Account | 5 |
| Ganzes Video im RAM beim Upload | Chunked/Streamed (TikTok), Resumable (YouTube) | 5, 6 |
| Kein 429/Quota-Handling | http.ts mit Backoff + Retry-After; YouTube-Quota-Zähler | 5, 6 |
| Flüchtiger trycloudflare-Tunnel | Feste Domain (benannter Tunnel) oder R2 | 5–7 |
| Postgres-Port öffentlich + schwaches Passwort | Port nur intern, starkes Passwort in .env | 1 |

## Jan-TODOs (Zuarbeiten außerhalb des Loops)

Der Loop markiert betroffene Phasen als `[BLOCKED: …]` und arbeitet weiter — nichts davon blockiert den Rest.

1. `ANTHROPIC_API_KEY` in `.env` (Pflicht ab Phase 4 für Captions/Briefing)
2. `YOUTUBE_API_KEY` aus ClipPilot-`.env` übernehmen (Discovery + Kommentare)
3. TikTok Developer-App anlegen (developers.tiktok.com) → Client Key/Secret, Redirect-URI; David als Sandbox-Target-User
4. Meta-App anlegen (developers.facebook.com, Typ „Instagram API with Instagram Login", Dev-Modus) → App-ID/Secret; Davids IG auf Creator-Account umstellen + als Instagram-Tester einladen (er bestätigt in den IG-Einstellungen)
5. Google-Cloud-Projekt: OAuth-Client (Web) für youtube.upload/readonly + yt-analytics.readonly; **YouTube-API-Audit-Formular früh einreichen** (bis dahin: API-Uploads bleiben privat → Studio-Veröffentlichung)
6. Domain für benannten Cloudflare Tunnel bereitstellen (OAuth-Redirects + öffentliche Medien-URL für IG) — alternativ R2-Bucket
7. ~~`ADMIN_PASSWORD` wählen (Hash via `scripts/hash-password.mjs`)~~ — ✅ erledigt 30.07.2026 (Jan hat das Passwort gesetzt, Login E2E-verifiziert)
8. Davids Instagram-Clips als mp4-Dateien bereitlegen (für den Import in Phase 3)

## Risiken

- **YouTube-Audit** kann Wochen dauern oder abgelehnt werden → dann dauerhaft Studio-Halbautomatik (akzeptabel).
- **IG verlangt öffentlich abrufbare Video-URL** → hängt an Domain/Tunnel-Entscheidung (Jan-TODO 6).
- **yt-dlp vs. YouTube-Änderungen** → Cookies-Support ist übernommen, yt-dlp aktuell halten.
- **TikTok-Kommentare** sind per API nicht zugänglich → Briefing stützt sich auf YouTube + Instagram.
- **LLM-JSON-Zuverlässigkeit** → Zod + Retry + failed-Status statt Crash.
- Mac muss für tägliche Jobs laufen → später optional VPS.

## Gesamt-Verifikation (nach Phase 10)

1. `docker compose up -d` + `npm run worker:dev` + `npm run web:dev` → Login → alle 10 Seiten erreichbar
2. Kanal-Scan → Davids 4 Videos → Pipeline bis gerenderter Clip mit Untertiteln
3. Freigabe mit 3 Plattform-Zielen → 3 posts zu korrekten Berlin-Zeiten; TikTok-Draft in Inbox (Sandbox), YouTube privat hochgeladen, IG-Reel gepostet ODER jeweils sauberer awaiting_manual-Fallback
4. `scripts/run-analytics.mjs` → Snapshots + Charts; `scripts/run-briefing.mjs` → Briefing mit echten Kommentaren
5. Idee aus Briefing → Planung → Kalender
6. `npm run check` grün; Responsive-Check 320/768/1440

## Ergebnisprotokolle

### Phase 0 — Bootstrap (30.07.2026)
Repo angelegt (`git init -b main`), PLAN.md aus der Planungs-Session übernommen, `.env.example` und `.gitignore` erstellt, Initial-Commit. Nächste Iteration: Phase 1.

### Phase 10 — Content-Planung + Finale (31.07.2026)
Planung: typografisches 4-Spalten-Board (Idee → Geplant → In Produktion → Veröffentlicht, ohne DnD-Framework) mit Herkunfts-Label, Vor/Zurück/Verwerfen-Buttons, Neue-Idee-Formular und „Dreh planen" (Datum+Zeit → calendar_items, DST-korrekt: 10:00 Berlin = 08:00 UTC verifiziert). Kalender: selbstgebautes Montag-basiertes Monatsraster (Server Component) mit Posts (fett, YT/IG/TT) + Drehs/Streams, Monats-Navigation, Heute-Markierung. Übersicht final mit echten KPIs (218 Follower, Views-7d-Delta, nächste 4 Posts, 8 offene Reviews, Briefing-Link). README als komplettes Betriebs-Runbook (Jobs-Zeitplan, Key-Tabelle, Fallback-Workflows). Verifiziert: Statuskette bis published durchgeklickt, Dreh am 1.8. neben 5 geplanten Posts im Kalender, alle 13 Seiten HTTP 200, responsive 320/768/1440 ohne Overflow, Konsole sauber, `npm run check` grün (89 Tests). **Bonus-Validierung:** Jan hat parallel real 8 Clips freigegeben + erneut geclippt — Rendering, kapazitätsgerechte Slot-Planung (24 Posts) und Overnight-Automatik (Analytics 05:30, Briefing 06:00 am 31.07.) liefen fehlerfrei von selbst durch.

### Phase 9 — Kommentare + KI-Briefing (30.07.2026, BLOCKED-Rest: Live-Briefing braucht ANTHROPIC_API_KEY)
Kommentar-Sync komplett: YouTube über commentThreads.list (API-Key-Pfad) MIT keyless yt-dlp-Fallback — live verifiziert: **56 echte Kommentare** von Davids 4 Videos (inkl. Reply-Counts, Upsert auf `(platform, externalCommentId)`); IG-Comments implementiert (aktiviert sich mit Verbindung); TikTok bewusst ausgelassen (API gibt es nicht her). Briefing-Pipeline: purer Digest-Builder (Kappen, Kürzung, 7-Tage-Trends — 5 Tests) + striktes Zod-Ausgabe-Schema (5 Tests), Claude-Call mit 1 Retry, sonst `failed` mit Rohtext; replyCandidates werden auf existierende Kommentar-IDs gefiltert. Ohne Key: Digest wird trotzdem gebaut und gespeichert, Status sauber `failed` mit Anleitung (UI zeigt es rot mit Hinweis). Briefing-Seite + Archiv (`[date]`), Kommentar-Zitate mit YouTube-Deeplinks; „Als Idee übernehmen" für Ideen UND Antwort-Kandidaten → per Seed-Briefing E2E verifiziert (ideas-Row mit source/targets/Verknüpfung), danach aufgeräumt. Repeatable täglich 06:00 nach Analytics; `scripts/run-briefing.mjs`. `npm run check` grün (89 Tests).

### Phase 8 — Analytics (30.07.2026)
`analytics.ts` NEU: täglicher Repeatable 05:30 Berlin auf der analytics-Queue; je Plattform beste verfügbare Quelle (OAuth → API-Key → für YouTube keyless via yt-dlp), Upsert auf `(snapshotDate, accountId, postId)` NULLS NOT DISTINCT. Pure Metrik-Normalisierer (`metrics.ts`, 6 Unit-Tests: String-Zahlen, kaputte Felder, IG-Insights-Form, yt-dlp-Summen). Handgebaute Server-Component-Charts (`charts.tsx`): SVG-LineChart (Hairline-Grid, Serien-Label an der Linie, einzelpunktfähig) + div-basierte BarList. Analytics-Seite mit 7/30/90-Tage-Toggle, KPI-Reihe, Follower-Verlauf, Views je Post. Verifiziert LIVE: Lauf 1 schrieb echten YouTube-Snapshot (218 Follower, 2.411 Views, 4 Videos — keyless!), Lauf 2 am selben Tag duplizierte NICHT (nur capturedAt neu), Chart rendert die echten Daten, IG/TT sauber übersprungen (nicht verbunden). `scripts/run-analytics.mjs`. `npm run check` grün (79 Tests).

### Phase 7 — Instagram-Reels-Publishing (30.07.2026, BLOCKED-Rest: Live-Reel braucht Meta-App + Domain)
Instagram-Login-Flow komplett (`/api/oauth/instagram/*`: Code → Short-lived → Long-lived-Token 60 Tage, igUserId in authMeta, State-Cookie, Tokens verschlüsselt). `instagram.ts`: Container→Polling→Publish→Permalink mit Fehler-Mapping (Code 190 → expired). **Public-Media-Lösung ohne offenen Bucket:** signierte, ablaufende URLs (HMAC in `shared/media-sign`, 5 Unit-Tests) über die öffentliche Route `/api/public-media/*` — lokal E2E verifiziert: 200 mit gültiger Signatur OHNE Session (31,5 MB gestreamt), 403 bei Manipulation/Ablauf; localhost zählt bewusst als „nicht öffentlich" → sauberer Fallback. ffprobe-Reel-Validierung (3 s–15 min, 9:16) vor jedem Publish. Wöchentlicher `refresh-ig-token` (Mo 04:00 Berlin). E2E ohne Meta-App: due-posts → sauber `awaiting_manual` („Meta-App fehlt"), OAuth-Start → saubere Fehlermeldung, Accounts-Seite mit IG-Verbinden. `npm run check` grün (73 Tests).

### Phase 6 — YouTube-Shorts-Publishing (30.07.2026, BLOCKED-Rest: Live-Upload braucht Google-Client)
Google-OAuth-Routen (`/api/oauth/google/*`, access_type=offline + prompt=consent, State-Cookie, Refresh-Token-Pflichtprüfung, Tokens verschlüsselt), `youtube-upload.ts` mit Resumable Upload (Init→Session-URL→Stream-PUT), `youtube-metadata.ts` als pures Mapping (Titel ≤ 100 ohne Spitzklammern, Tag-Dedup + Gesamtlängen-Kappe, Beschreibung Caption+Hashtags — 6 Unit-Tests inkl. Quota-Tag in Pacific Time), Redis-Quota-Zähler (1600 Units/Upload, Warnung ab 8000), Token-Refresh jetzt plattform-dispatcht (tiktok/google) über gemeinsame `TokenExpiredError`. publish.ts-YouTube-Zweig: bei `YT_UPLOAD_PRIVACY=private` (bis Audit) nach Upload → `awaiting_manual` mit Studio-Deeplink. E2E ohne Client verifiziert: due-posts → sauber `awaiting_manual` („Google-OAuth-Client fehlt"), OAuth-Start → saubere Fehlermeldung, Accounts-Seite mit YouTube-Verbinden. `npm run check` grün (68 Tests).

### Phase 5 — Accounts, Scheduling, TikTok + Manual-Fallback (30.07.2026, BLOCKED-Rest: nur Sandbox-Test)
Zeitzonen-korrektes Scheduling NEU: pure `schedule-logic.ts` (9 Unit-Tests: Sommer/Winter, beide DST-Wechseltage, Tageskappe in LOKALER Zeit, belegte Slots), `schedule.ts` legt pro Ziel aus `clips.targets` einen Post an — ohne verbundenen Account als `awaiting_manual` MIT geplanter Zeit. `publish.ts` NEU mit Plattform-Dispatch; `withFreshToken` mit Redis-Lock (Compare-and-Delete-Lua) + `expired`-Markierung bei invalid_grant; `tiktok.ts` refactored (Chunked-Stream-Upload 5–64-MB-Regeln, `http.ts` mit Retry-After/Backoff überall). OAuth PKCE-Routen unter `/api/oauth/tiktok/*` (State-Cookie, Tokens NUR verschlüsselt). UI: Accounts-Seite (Posting-Plan je Plattform, auch unverbunden — steuert Fallback-Zeitplan; verifiziert: tiktok 2/Tag `{10:00,18:00}`), Posts-Seite mit komplettem Manual-Fallback. E2E verifiziert ohne Keys: Sweep plante 3 Posts auf 09:00 Berlin = 07:00 UTC (UTC-Bug tot); due-posts → publish → sauber `awaiting_manual` („TikTok-Keys fehlen") → Download-Header + Caption-Copy + „Als veröffentlicht markieren" mit URL grün; OAuth-Start ohne Keys → saubere Fehlermeldung. `npm run check` grün (62 Tests).

### Phase 4 — Clip-Pipeline (30.07.2026)
Komplette Pipeline steht: ffmpeg-ClipProvider (Lautstärke-Scoring), Whisper-Transkription (faster-whisper, venv auf Host + im Image), Claude-Caption-Integration via fetch (Zod-JSON, 1 Retry, Heuristik-Fallback aktiv bis Key da ist), Render 1:1 aus ClipPilot + `force`-Re-Render/Blur-Reframe für Importe, promote-approved-Tick, Review-Seite (Score-Ranking, Transkript, Plattform-Checkboxen → targets), Clips-Seite (9:16-Player, Caption/Hashtags/Titel-Edit, Neu-rendern), Video-Range-Proxy mit Auth + presignter URL. **Zwei echte Bugs gefunden+gefixt:** (1) ffmpeg ≥ 7 zerlegt `force_style`/Pfade mit Leerzeichen im Filtergraph → Lösung SRT→ASS-Konverter (getestet) + cwd-relative Dateireferenz; (2) Homebrew-ffmpeg hat KEIN libass → Worker läuft jetzt als Docker-Service (Compose, Quell-Mounts, Service-interne URLs) — damit ist der Betrieb ClipPilot-identisch. Verifiziert E2E: COLLEGE PARTY → 8 Kandidaten mit deutschen Whisper-Transkripten → Freigabe {yt,ig,tt} → gerenderter 1080x1920/62s-Clip mit sichtbar eingebrannten Untertiteln, im Dashboard abspielbar; Titel-Edit persistiert; `npm run check` grün (53 Tests inkl. Hashtag-/LLM-JSON-/SRT→ASS-Parsing).

### Phase 3 — Quellen-Ingest (30.07.2026)
Worker-Grundgerüst (BullMQ, 8 Queues, pino, env mit Root-.env-Loading, Dockerfile inkl. shared) auf dem Host via tsx; storage/download/twitch 1:1 aus ClipPilot, youtube-Discovery über shared `fetchChannelUploads` MIT yt-dlp-Fallback (Klassifikator hat das automatische Kopieren des YOUTUBE_API_KEY blockiert → bleibt Jan-TODO 2; Scan funktioniert trotzdem keyless). Selbstheilender `ingest-tick` (15 s) reiht Downloads + Import-Validierungen ein. Web: Quellen-Seite (Link hinzufügen, Kanal scannen, Statusliste mit AutoRefresh), IG-Import (Multi-Upload → MinIO → clips origin=imported, Route auth-geschützt), ffprobe-Validierung (Dauer/9:16) im Worker. Verifiziert: Scan fand exakt Davids 4 Videos, alle 4 `downloaded` mit Objekten in MinIO (59–196 MB), Test-mp4 importiert + „9:16 bestätigt", 13 neue URL-Parsing-Tests, `npm run check` grün (41 Tests), keine Konsolen-Fehler. yt-dlp via Homebrew installiert.

### Phase 2 — Auth + Web-Grundgerüst + Design-System (30.07.2026)
Next.js 15 (App Router, React 19, Tailwind 4, Geist via next/font) als `web`-Workspace. Auth komplett: scrypt-Verify (`web/lib/password.ts`), jose-HttpOnly-Session, `requireSession()`-Guard, Middleware (alles außer `/login`, `/api/oauth/*`), Login mit In-Memory-Rate-Limit (5/15 min). Design: helles Swiss/Editorial-Minimal, Tokens in `globals.css`, eigene Primitive in `components/ui.tsx`, rein typografische Navigation (10 Seiten). Übersicht mit KPI-Platzhaltern + Live-Infra-Status (Postgres/Redis/MinIO), Einstellungen editieren settings-Row (Upsert verifiziert). `scripts/hash-password.mjs`; Dev-Passwort `creatorhq-dev` gesetzt (Jan ersetzt es, TODO 7). Verifiziert im Browser: Redirect ohne Cookie, Ablehnung bei falschem Passwort, grüner Infra-Status nach Login, responsive 320/768/1440 ohne Overflow, keine Konsolen-Fehler; `npm run check` grün (3× tsc, 28 Tests).

### Phase 1 — Fundament (30.07.2026)
Monorepo (npm workspaces `db` + `shared`), Docker-Compose (postgres/redis/minio, Ports 127.0.0.1:5433/6380/9002 — parallel zu ClipPilot lauffähig), komplettes Drizzle-Schema (12 Enums, 10 Tabellen inkl. `NULLS NOT DISTINCT`-Unique für idempotente Snapshots), Migration `0000_pink_terror` angewendet. `shared`: AES-256-GCM-crypto, platforms, time (date-fns-tz). Verifiziert: alle 3 Container healthy, `\dt` = 10 Tabellen, `npm run check` grün (2× tsc, 19 Vitest-Tests inkl. DST-Wechsel 29.03./25.10.2026). Lokale `.env` mit generierten Secrets erzeugt (POSTGRES/MINIO/APP_ENCRYPTION_KEY/SESSION_SECRET); `ADMIN_PASSWORD_HASH` bleibt offen (Jan-TODO 7).

---

## Abschlussbericht (31.07.2026)

**Der Loop ist fertig: 7 von 10 Phasen komplett abgeschlossen, 4 nur noch dort BLOCKED, wo ausschließlich Jans App-Registrierungen fehlen.** Jede blockierte Strecke hat einen gebauten, verifizierten Fallback — nichts blockiert die tägliche Nutzung.

### Was läuft (jetzt sofort nutzbar)

- **Dashboard** http://localhost:3000 (Login: Admin-Passwort) — 12 Seiten, Swiss/Editorial, responsive, auth-geschützt.
- **Komplette Clip-Pipeline:** Kanal-Scan/Link → 720p-Download → Clipping (Lautstärke-Scoring) → Whisper-Untertitel → Review mit Plattform-Zielen → 9:16-Render mit Burn-in → DST-korrekte Slot-Planung → Publish/Manual-Fallback. Real bewiesen: Davids 4 Videos im System, 16 Kandidaten, 8 gerenderte Clips, 24 kapazitätsgerecht geplante Posts.
- **Instagram-Import** für fertige Clips (mp4 → publish-fertig, ffprobe-geprüft).
- **Manual-Fallback-Workflow** auf der Posts-Seite (Download, Caption kopieren, als veröffentlicht markieren) — der Weg, über den JETZT gepostet wird.
- **Tägliche Automatik** (Worker-Container, läuft solange Docker läuft): 05:30 Analytics-Snapshots (YouTube keyless: 218 Follower/2.411 Views), 06:00 Kommentar-Sync (56 echte Kommentare) + Briefing-Digest. Overnight-Beweis 31.07.: beides lief von selbst.
- **Planung + Kalender:** Ideen-Board mit Statuskette, Drehs neben geplanten Posts im Monatsraster.

### Was Jan noch tun muss (jede Zeile schaltet Automatik frei)

| Prio | Zuarbeit | Anleitung | Effekt |
|---|---|---|---|
| 1 | `ANTHROPIC_API_KEY` in `.env` | console.anthropic.com | Claude-Captions + tägliches Briefing (Digest wartet schon) |
| 2 | `YOUTUBE_API_KEY` in `.env` | eine Zeile aus `ClipPilot/.env` kopieren | API-Discovery/Kommentare/Stats statt yt-dlp |
| 3 | TikTok-App (Sandbox) | PLAN → Phase-5-BLOCKED-Notiz | Auto-Upload in Davids Inbox |
| 4 | Google-OAuth-Client + **Audit früh einreichen** | PLAN → Phase-6-BLOCKED-Notiz | Auto-Upload (privat→Studio; nach Audit public) |
| 5 | Meta-App + David als IG-Tester | PLAN → Phase-7-BLOCKED-Notiz | Reels-Auto-Publish + IG-Daten |
| 6 | Cloudflare-Tunnel-Domain → `PUBLIC_MEDIA_BASE_URL` | benannter Tunnel auf localhost:3000 | öffentliche video_url für IG (signiert/ablaufend) |

Nach jedem Eintrag: `docker compose up -d worker` (Container neu erstellen — ein `restart` liest `.env` NICHT neu ein), OAuth unter **Accounts** verbinden. Details + Restverifikation je Phase stehen in den BLOCKED-Notizen im Phasen-Status.

### Alles starten (Kurzform)

```bash
cd "Projekte/CreatorHQ"
docker compose up -d      # Postgres/Redis/MinIO/Worker
npm run web:dev           # Dashboard auf :3000
```

Runbook mit Jobs-Zeitplan, Key-Tabelle und Fallback-Workflows: [README.md](README.md). Stand: 89 Tests grün, 11 Commits, alle Verifikationen dokumentiert in den Ergebnisprotokollen oben.

---

## Weiterentwicklung nach Abschluss

### 01.08.2026 — Kanal-ID eingetragen → Ingest-Regel: nur Langmaterial wird geschnitten (Jans Vorgabe)

- **Auslöser:** Davids Kanal-ID (`UCuo5UNBi_kjwQCePPd9UD1w`) in den Einstellungen hinterlegt. Der Scan fand damit **35 statt 4 Videos** — der keyless yt-dlp-Weg las nur den `/videos`-Tab, Shorts stehen im eigenen `/shorts`-Tab (jetzt beides abgefragt). Dabei zeigte sich der Konstruktionsfehler: Die Pipeline begann Davids **fertige Shorts** (5–90 s) zu zerschneiden.
- **Regel (Jan: „niemals Shorts oder Insta-Clips rendern, nur YouTube-Videos und VODs"):** `shared/src/ingest-policy.ts`, Grenze **180 s** (offizielles Shorts-Limit seit 10/2024; Davids Bestand hat eine saubere Lücke 91 s → 322 s). Durchgesetzt im **Clip-Job** (einzige Stelle, die auch der manuelle Klick „Clips erzeugen" passieren muss) und im **Render-Job** (importierte Instagram-Clips bleiben im Original; Blur-Reframe nur noch über ein eigenes `reframe`-Flag). Der Scan stuft Kurzvideos direkt als `reference` ein, heilt Altbestand selbst und gibt die Quelldatei frei.
- **Lernteil (Jan: „Shorts mit in die Analysen, damit wir daraus lernen"):** `metrics_snapshots.source_video_id` (Migration 0003) hält jetzt Kennzahlen je Kanal-Video — ein API-Aufruf je 50 Videos, 1 Quota-Unit. Das Briefing bekommt `videoPerformance` **getrennt nach Shorts und Langformat** (YouTube zählt einen Short-View bereits beim Anspielen — nicht vergleichbar). Erster Lauf lieferte: *„kurze, pointierte Meme-/Comedy-Clips mit Fußball-/Alltagsbezug (9–17 s) performen am besten, inhaltsleere Ein-Satz-Shorts fallen ab — der Hook entscheidet, nicht die Kürze."*
- **Live verifiziert:** 27 wartende Clip-Jobs wurden von der Sperre abgewiesen statt geschnitten; 31 Shorts stehen als Referenz mit Views auf der Quellen-Seite; im Speicher liegen nur noch die 4 echten Langvideos; 24 Müll-Kandidaten über die App gelöscht.
- **Nebenbefunde mitgefixt:** Analytics brach ab 51 Videos mit HTTP 400 (fehlendes 50er-Batching); Briefing-Parser scheiterte, wenn Claude sich selbst korrigiert; die yt-dlp-Kanalsumme lief unter demselben Schlüssel wie die Lebenszeit-Aufrufe der API. Adversariale Mehrfach-Prüfung (34 Agenten) fand 5 bestätigte Befunde — alle behoben.
- ⚠️ **Hinweis an Jan:** Die Kanal-Views springen im Verlauf von 2.411 auf 50.027 — kein Wachstum, sondern die erste vollständige Messung. Der 7-Tage-Trend zeigt bis ca. 06.08. einen falschen Sprung und stimmt danach von allein.


### 31.07.2026 — Untertitel-Genauigkeit + Kontext-Clipping (Jans Feedback: „Untertitel ungenau, Clips ohne Kontext")

- **Untertitel:** Whisper `base` → `small` mit Wort-Timestamps, VAD und fester Sprache (de). Statt träger Segment-Blöcke kurze TikTok-Cues (3–5 Wörter), die exakt auf dem Wort liegen, an Satzzeichen/Pausen umbrechen und nicht über Stille nachleuchten. `large-v3-turbo` ist vorbereitet, wurde aber in der 3,8-GB-Docker-VM zweimal vom OOM-Killer abgeschossen → **✋ Jan (optional, beste Qualität):** Docker Desktop → Settings → Resources → Memory ≥ 8 GB, dann `WHISPER_MODEL=large-v3-turbo` in `.env`, `mem_limit: 4g` in docker-compose.yml, `docker compose up -d worker`.
- **Clipping:** Smart-Provider transkribiert das komplette Video einmal (Cache in `source_videos.transcript_json` → „Erneut clippen" sofort). Clip-Grenzen liegen immer auf Satzgrenzen (62–90 s, Setup + Pointe); Auswahl per Claude (`CLIP_MODEL`, aktiviert sich mit dem ANTHROPIC_API_KEY) oder Satz-Heuristik. Fallback-Kette Claude → Heuristik → Lautstärke-Provider ist gegen alle Fehlerklassen abgesichert (Code-Review: 1 HIGH + 4 MEDIUM gefunden und gefixt).
- **Render:** Loudness-Normalisierung auf −16 LUFS (gemessen: −14,9).
- **Betrieb:** Worker per Compose auf 3 CPUs / 2,5 GB begrenzt — Transkription kann Postgres/Dashboard nicht mehr abwürgen. Wichtiger Runbook-Fix: `.env`-Änderungen erfordern `docker compose up -d worker`; ein `restart` liest `env_file` NICHT neu ein (README/PLAN korrigiert).
- **E2E verifiziert** am College-Party-Video (5:22): 3 satzgenaue Kandidaten (75/83/86 s) statt 8 starrer Fenster, Render in 40 s, Frames geprüft (Cue sitzt wortgenau, Sprechpause leer), 131 Tests grün.

### 31.07.2026 — Clip-Board (Jans Wunsch: „Clips löschen, Status sehen, Clips+Review zusammenlegen")

- Eine Seite `/clips` für den ganzen Lebenslauf: Stufen-Zähler mit Sprungankern (Zur Freigabe / In Produktion / Live / Aussortiert), Review-Aktionen integriert, Posts als Status-Chips (Plattform + Zustand + Zeit, Link wenn live) direkt am Clip. `/review` leitet um.
- **Löschen** mit Rückfrage: entfernt MinIO-Video, Datensatz und offene Posts (Kaskade); gesperrt, sobald ein Post live/im Upload ist (Analytics-Historie bleibt). **Zurückholen** für Aussortierte, **Neu rendern** für Fehlgeschlagene.
- E2E verifiziert: Löschung inkl. MinIO-Objekt nachgewiesen, Freigabe → Render → Planung aus dem Board heraus, mobil sauber.

### 31.07.2026 — Untertitel-Positions-Fix + Verbesserungs-Backlog (Audit auf Jans Wunsch)

**Fix:** Untertitel nie mehr im Bild — Größe 11, halbtransparente Box (BorderStyle 3), fester Anker im unteren Blur-Band (MarginV 24). Am Original-Problem-Clip per Re-Render verifiziert.

**Backlog aus dem bewussten Durchgang (priorisiert):**
- **Ebene 1 — Daily-Driver-Polish (Claude kann sofort):**
  - [x] Vorschau-Standbild je Kandidat im Board — erledigt 31.07.
  - [x] Untertitel-Editor am Clip — erledigt 31.07.
  - [x] Produktiv-Modus + Autostart (launchd `com.creatorhq.web`, Deploys via `npm run web:deploy`) — erledigt 31.07.; Docker-Desktop-Autostart-Häkchen bleibt ✋ Jan
  - [x] Worker-Heartbeat + Queue-Tiefen in der Übersicht — erledigt 31.07.
  - [x] Nächtlicher pg_dump (03:30, 14 Tage) + tmp-Housekeeping (04:45) — erledigt 31.07.; MinIO-Sync bewusst ausgelassen (Medien ableitbar)
  - [x] Alte Lautstärke-Kandidaten gelöscht, College-Video neu geclippt (3 Kandidaten mit Vorschaubild) — 31.07.
- **Ebene 2 — Qualität (Jan, ~30 Min):** ANTHROPIC_API_KEY (Claude-Clip-Auswahl + Captions + Briefing), YOUTUBE_API_KEY, Docker-RAM ≥ 8 GB → WHISPER_MODEL=large-v3-turbo
- **Ebene 3 — Publishing scharf (Jan, Apps):** TikTok-/Google-/Meta-Apps + Cloudflare-Tunnel → Auto-Posting statt Manual-Fallback
- **Ebene 4 — Nächstes Qualitätslevel (später):** Face-Tracking-Crop statt Blur-Balken, Hook-Text-Overlay in den ersten Sekunden, mehrere Untertitel-Stile wählbar

### 31.07.2026 (spät) — Ebene 1 komplett + David-Link + Design

- **Ebene 1 umgesetzt und verifiziert** (siehe Häkchen oben): Vorschaubilder (Frame aus Fenster-Mitte → MinIO `thumbs/`), SRT-Editor am Clip (Roundtrip getestet: „Valagia"→„Malaga" persistiert), Worker-Heartbeat + Job-Zeile in der Übersicht, nächtliches pg_dump-Backup (Test-Dump 36 KB geschrieben, Retention 14 Tage, pg_dump 16 aus PGDG) + tmp-Aufräumjob, Prod-Betrieb als launchd-Dienst (Ready in ~200 ms, localhost-only).
- **David-Link:** Cloudflare Quick Tunnel als launchd-Dienst `com.creatorhq.tunnel`; aktuelle URL per `npm run tunnel:url`. David loggt sich mit dem Admin-Passwort ein und kann freigeben/rendern/anschauen. ⚠️ URL wechselt bei jedem Dienst-/Mac-Neustart — die stabile Adresse bleibt der benannte Tunnel mit eigener Domain (✋ Jan-TODO 6).
- **Design:** @davidvorkamera-Profilbild in der Sidebar, klarere Aktions-Hierarchie (gerahmte Sekundär-Buttons, rot gerahmte Destruktiv-Buttons), Kandidaten-Layout mit Bild+Score-Spalte.

### 31.07.2026 (Nacht, Teil 2) — Stabiler David-Link kostenlos: creatorhq.vercel.app

- Ganz CreatorHQ auf Vercel geht nicht (DB/Queues/Videos + Worker laufen lokal), aber die **stabile Eingangstür** schon: `https://creatorhq.vercel.app` (Vercel-Free, Redirect-Only-Deployment) leitet pfad-erhaltend auf den aktuellen Quick-Tunnel. Sync-Dienst `com.creatorhq.linksync` (alle 5 Min) deployt bei Tunnel-Wechsel automatisch neu — Ende-zu-Ende verifiziert (307 → Tunnel → Login 200).
- ⚠️ Folge: Die URL ist jetzt öffentlich erratbar → ✋ Jan: Admin-Passwort auf etwas Starkes ändern (`node scripts/hash-password.mjs "…"` → `.env` → `npm run web:deploy`). Login ist rate-limitiert.
- Benannter Tunnel (`ops/setup-named-tunnel.sh`) bleibt der spätere Weg für IG-Medien-URL + OAuth — für den David-Link nicht mehr nötig.

### 01.08.2026 — Keys aktiv: Briefing-Knopf, Claude-Clipping scharf (Phase 9 abgehakt)

- Jan hat `ANTHROPIC_API_KEY` + `YOUTUBE_API_KEY` eingetragen → Worker recreated. **Erster Live-Claude-Lauf:** „Briefing jetzt erstellen"-Knopf (neu, auf /briefing, mit Lauf-Status + Auto-Refresh) → Kommentar-Sync jetzt per YouTube-API (52 Kommentare, quelle=api statt yt-dlp), Claude-Briefing (sonnet-5) in 30 s: fundiertes Lagebild auf echten Daten + 6 Video-Ideen. Phase 9 damit vollständig verifiziert und abgehakt.
- Ab sofort automatisch aktiv: Claude-Highlight-Auswahl beim Clipping (CLIP_MODEL sonnet-5, Setup+Pointe statt Heuristik) und Claude-Captions (haiku) beim nächsten „Clips erzeugen"/Enrich.
- Verbleibende BLOCKED-Reste nur noch Publishing: TikTok-/Google-/Meta-Apps (Phasen 5–7).
