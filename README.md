# CreatorHQ

Mandantenfähige Creator-Plattform: Aus Langvideos (YouTube, Twitch-VODs) werden automatisch Social-Media-Clips — Download, wortgenaue Transkription, KI-Clip-Auswahl, 9:16-Render mit Untertitel-Burn-in, Multi-Plattform-Publishing (TikTok, Instagram Reels, YouTube Shorts) mit durchgängigem Manual-Fallback, tägliche Analytics und ein KI-Briefing aus den Kommentaren.

Jeder Kanal registriert sich selbst, sieht ausschließlich seine eigenen Daten (Mandantentrennung bis auf Datenbank-Ebene, verifizierbar per `npm run testdb`) und durchläuft eine Freischaltung durch den Betreiber.

## Architektur

```
db/        @creatorhq/db      Drizzle-Schema (Postgres), Client, Migrationen
shared/    @creatorhq/shared  AES-256-GCM-Crypto, Plattform-Logik, DST-sichere Zeitplanung,
                              signierte Medien-URLs, Ingest-Policy
worker/    @creatorhq/worker  BullMQ-Jobs: Download / Clip / Render / Publish /
                              Analytics / Kommentare / Briefing (Docker, Redis)
web/       @creatorhq/web     Next.js App Router, Server Actions, Auth-Middleware,
                              Betreiber-Zentrale
scripts/   Setup, Admin, Analytics-/Briefing-Trigger, Queue-Verwaltung, DB-Tests
```

**Stack:** Next.js 15 (App Router, React 19, Tailwind 4) · Postgres 16 + Drizzle · BullMQ + Redis · MinIO (S3-kompatibel) · yt-dlp, ffmpeg, faster-whisper · Claude API · Docker Compose.

**Sicherheit:** Sessions als signierte HttpOnly-Cookies, scrypt-Passwort-Hashes, Login-Rate-Limit, OAuth-Tokens AES-256-GCM-verschlüsselt in der DB, eigene DB-Rolle mit Row-Level-Security für die App, alle Host-Ports nur an 127.0.0.1 gebunden. Secrets ausschließlich über `.env` (siehe [`.env.example`](.env.example)).

## Schnellstart

Voraussetzungen: Node ≥ 20, Docker Desktop.

```bash
npm run setup    # legt .env mit lokalen Zugangsdaten an, startet Postgres/Redis/MinIO, migriert
npm run web:dev  # Dashboard auf http://localhost:3001
```

Dann **http://localhost:3001/registrieren** öffnen und einen Kanal anlegen.

Die Plattform-Schlüssel (Google, TikTok, Meta, Anthropic) bleiben anfangs leer — ohne sie funktioniert alles außer Konten verbinden, KI-Clipping und Briefing.

## Pipeline

**Was geschnitten wird — und was nicht:** Geclippt wird ausschließlich **Langmaterial**. Fertige Shorts (≤ 180 s) und importierte Instagram-Clips sind Endprodukte: Sie werden nie geschnitten und nie neu gerendert, sondern nur täglich gemessen — ihre Zahlen fließen als Lernquelle ins Briefing. Die Regel steht in [`shared/src/ingest-policy.ts`](shared/src/ingest-policy.ts) und wird an der einzigen nicht umgehbaren Stelle durchgesetzt (Clip-/Render-Job im Worker) — auch ein manueller Klick im Dashboard kommt daran nicht vorbei.

Ablauf: Quelle (Kanal-Scan oder Link) → Download (720p) → das komplette Video wird **einmal wortgenau transkribiert** (faster-whisper mit Wort-Timestamps, Cache in der DB) → Clip-Kandidaten **immer auf Satzgrenzen** (62–90 s, Setup + Pointe statt Lautstärke-Peaks; Auswahl per Claude, ohne Key per Satz-Heuristik) mit kurzen, wortgenau getimten Untertitel-Cues → Clips-Board (Ziele wählen, freigeben) → 9:16-Render mit Untertitel-Burn-in + Loudness-Normalisierung (−16 LUFS) → automatische Slot-Planung (lokale Zeit, DST-sicher) → Publish oder Manual-Fallback.

## Automatische Jobs

| Zeit (Berlin) | Job | Zweck |
|---|---|---|
| alle 15 s | ingest-tick | Entdeckte Quellen laden, Importe validieren (selbstheilend) |
| alle 30 s | promote-approved | Freigaben rendern, Gerendertes einplanen |
| alle 60 s | due-posts | Fällige Posts veröffentlichen |
| 03:30 täglich | backup-daily | Postgres-Dump (gzip), 14 Tage Aufbewahrung |
| 04:45 täglich | cleanup-daily | `tmp/` aufräumen |
| 05:30 täglich | daily-analytics | Snapshots je Plattform (YouTube geht auch keyless) |
| 06:00 täglich | daily-briefing | Kommentare syncen + Claude-Briefing |
| Mo 04:00 | refresh-ig-token | Instagram-Long-lived-Token verlängern |
| 06:00 täglich | discovery-tick | Kanal-Scan (wenn Auto-Discovery aktiviert) |

## Fallback-Workflows (funktionieren immer, ohne Keys)

- **Manuell posten:** Posts-Seite → Zeitplan ansehen → Video herunterladen → Caption kopieren → in der Plattform-App posten → als veröffentlicht markieren (mit Link).
- **YouTube bis zum API-Audit:** Upload läuft automatisch, Video ist privat → Studio-Deeplink am Post → in YouTube Studio auf „Öffentlich" stellen.
- **Abgelaufene Verbindung:** Account zeigt „Abgelaufen — neu verbinden"; betroffene Posts stehen als „Manuell posten" bereit.

## Plattform-Keys

| Key in `.env` | Schaltet frei |
|---|---|
| `ANTHROPIC_API_KEY` | Claude-Clip-Auswahl (versteht Kontext/Pointen), Captions, tägliches Briefing |
| `YOUTUBE_API_KEY` | Discovery/Kommentare/Stats per API statt yt-dlp-Fallback |
| `TIKTOK_CLIENT_KEY/SECRET` | TikTok-Auto-Upload (Sandbox: Inbox-Draft; nach App-Audit Direct Post) |
| `GOOGLE_CLIENT_ID/SECRET` | YouTube-Auto-Upload (privat bis API-Audit → Studio-Link) |
| `IG_APP_ID/SECRET` | Instagram-Reels-Auto-Publish + Kommentare/Insights |
| `PUBLIC_MEDIA_BASE_URL` | öffentliche, signierte + ablaufende video_url für Instagram |

Nach jedem Key-Eintrag: `docker compose up -d worker` (Env wird nur beim Neu-Erstellen des Containers eingelesen, ein bloßes `restart` reicht nicht).

## Tests & Qualität

```bash
npm run check    # Typecheck aller Workspaces + Vitest (inkl. DST-Wechsel-Tests)
npm run testdb   # Mandantentrennung gegen eine echte Wegwerf-Postgres prüfen (RLS)
```

## Wichtige Scripts

| Script | Zweck |
|---|---|
| `npm run setup` | Einmalige lokale Einrichtung (Env, Container, Migrationen) |
| `node scripts/run-analytics.mjs` | Analytics-Snapshot sofort ziehen |
| `node scripts/run-briefing.mjs` | Kommentar-Sync + Briefing sofort |
| `node scripts/queues.mjs status` | Queue-Stand ansehen (`pause`/`resume <queue>`) |
| `node scripts/clear-queues.mjs` | Alle Queues leeren (Reset) |
| `npm run db:studio` | DB-Browser (Drizzle Studio) |
| `npm run admin` | Betreiber-Werkzeuge (Kanäle freischalten, sperren) |
