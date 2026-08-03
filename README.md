# CreatorHQ

Creator Dashboard für David (@davidvorkamera): Clip-Pipeline (Download → KI-Clipping → Whisper-Untertitel → 9:16-Render mit Burn-in), Multi-Plattform-Publishing (TikTok, Instagram Reels, YouTube Shorts) mit durchgängigem Manual-Fallback, tägliche Analytics, KI-Briefing und Content-Planung. Eigenständige Weiterentwicklung der erprobten ClipPilot-Pipeline — mit behobenen Schwächen (Auth, Zeitzonen, Token-Verschlüsselung, Chunked-Uploads, Tests).

Bauplan, Phasen-Status und Abschlussbericht: [PLAN.md](PLAN.md).

## Struktur

```
db/        @creatorhq/db      Drizzle-Schema (10 Tabellen), Client, Migrationen
shared/    @creatorhq/shared  crypto (AES-256-GCM), platforms, time (DST-sicher), media-sign, youtube
worker/    @creatorhq/worker  BullMQ-Jobs (Download/Clip/Render/Publish/Analytics/Comments/Briefing)
web/       @creatorhq/web     Next.js 15 App Router, Server Actions, Auth-Middleware
scripts/   hash-password, enqueue-download, run-analytics, run-briefing, storage-ls, clear-queues
```

## Setup (einmalig)

Voraussetzungen: Node ≥ 20, Docker Desktop.

```bash
cp .env.example .env         # Passwörter/Keys eintragen (siehe Tabelle unten)
ln -s ../.env web/.env.local # Next.js liest Env aus dem web/-Ordner
touch cookies.txt            # optional: YouTube-Cookies (Netscape-Format)
npm install
docker compose up -d         # postgres (127.0.0.1:5433), redis (:6380), minio (:9002) + worker
npm run db:migrate
npm run check                # Typecheck aller Workspaces + Vitest
npm run web:build            # Produktions-Build des Dashboards
cp ops/com.creatorhq.web.plist ~/Library/LaunchAgents/
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.creatorhq.web.plist
```

Danach läuft das Dashboard dauerhaft auf http://localhost:3000 (startet beim Login mit, kommt nach Absturz zurück). Zusätzlich in **Docker Desktop → Settings → General** „Start Docker Desktop when you sign in" aktivieren — die Container (`restart: unless-stopped`) kommen dann nach jedem Neustart von selbst. Der Dienst `com.creatorhq.awake` hält den Mac am Netzteil wach (Display darf ausgehen), damit Davids Link jederzeit funktioniert; abschaltbar per `launchctl bootout "gui/$(id -u)/com.creatorhq.awake"`.

**Login:** Ein Admin-Konto. Passwort setzen/ändern: `node scripts/hash-password.mjs "passwort"` → als `ADMIN_PASSWORD_HASH` in `.env`, dann Web-Server neu starten.

## Täglicher Betrieb

| Was | Wie |
|---|---|
| Normalbetrieb | nichts — Dashboard (launchd) und Container (Docker-Autostart) laufen von selbst |
| Link für David | **https://creatorhq.vercel.app** — stabile, **passwortgeschützte** Eingangstür (Basic-Auth, Benutzername egal); zeigt automatisch auf den aktuellen Tunnel (`com.creatorhq.linksync`, Sync alle 5 Min). Passwort ändern: `printf %s "NEU" | npx vercel env add LINK_PASS production --cwd ops/link --force` + `npm run link:deploy` |
| Web nach Code-Änderung | `npm run web:deploy` (baut neu + startet den Dienst) |
| Worker nach Code-Änderung | `docker compose restart worker` (Quellcode ist gemountet) |
| Worker nach `.env`-Änderung | `docker compose up -d worker` — **nicht** `restart`: Env wird nur beim Neu-Erstellen des Containers eingelesen |
| Entwickeln am Web | `launchctl bootout "gui/$(id -u)/com.creatorhq.web"` → `npm run web:dev`; danach Dienst wieder per `launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.creatorhq.web.plist` |
| Logs | Web: `tail -f logs/web.log` · Worker: `docker logs -f creatorhq-worker-1` |
| Backup zurückspielen | `gunzip -c backups/creatorhq-DATUM.sql.gz \| docker exec -i creatorhq-postgres-1 psql -U creatorhq -d creatorhq` |

**Automatische Jobs (Worker muss laufen, Mac an):**

| Zeit (Berlin) | Job | Zweck |
|---|---|---|
| alle 15 s | ingest-tick | Entdeckte Quellen laden, Importe validieren (selbstheilend) |
| alle 30 s | promote-approved | Freigaben rendern, Gerendertes einplanen |
| alle 60 s | due-posts | Fällige Posts veröffentlichen |
| 03:30 täglich | backup-daily | Postgres-Dump (gzip) nach `./backups`, 14 Tage Aufbewahrung |
| 04:45 täglich | cleanup-daily | `tmp/` aufräumen (Dateien älter als 3 Tage) |
| 05:30 täglich | daily-analytics | Snapshots je Plattform (YouTube geht auch keyless) |
| 06:00 täglich | daily-briefing | Kommentare syncen + Claude-Briefing |
| Mo 04:00 | refresh-ig-token | Instagram-Long-lived-Token verlängern |
| 06:00 täglich | discovery-tick | Kanal-Scan (nur wenn Auto-Discovery in den Einstellungen an) |

## Verbindungen & Keys (Status → was sie freischalten)

| Key in `.env` | Anleitung | Schaltet frei |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → Key erstellen | Claude-Clip-Auswahl (versteht Kontext/Pointen) + Captions + tägliches Briefing |
| `YOUTUBE_API_KEY` | aus ClipPilot-`.env` übernehmen | Discovery/Kommentare/Stats per API statt yt-dlp-Fallback |
| `TIKTOK_CLIENT_KEY/SECRET/REDIRECT_URI` | developers.tiktok.com, Sandbox, David als Target-User; Redirect `http://localhost:3000/api/oauth/tiktok/callback` | TikTok-Auto-Upload (Inbox-Draft; nach App-Audit Direct Post) |
| `GOOGLE_CLIENT_ID/SECRET` | console.cloud.google.com, YouTube Data + Analytics API, OAuth-Client (Web), Redirect `http://localhost:3000/api/oauth/google/callback`; **API-Audit früh einreichen** | YouTube-Auto-Upload (privat bis Audit → Studio-Link) |
| `IG_APP_ID/SECRET/REDIRECT_URI` | developers.facebook.com, „Instagram API with Instagram Login", Dev-Modus, David als Instagram-Tester | Instagram-Reels-Auto-Publish + IG-Kommentare/Insights |
| `PUBLIC_MEDIA_BASE_URL` | benannter Cloudflare Tunnel mit fester Domain — nach `cloudflared tunnel login` einfach `./ops/setup-named-tunnel.sh creatorhq.deine-domain.de` | öffentliche video_url für Instagram (signiert + ablaufend) |

Nach jedem Key-Eintrag: `docker compose up -d worker` (Container wird mit der neuen Env neu erstellt — ein bloßes `restart` übernimmt `.env`-Änderungen **nicht**; bei OAuth-Redirects zusätzlich den Web-Server neu starten). Verbinden dann unter **Accounts**.

## Fallback-Workflows (funktionieren IMMER, ohne Keys)

- **Manuell posten:** Posts-Seite → „Manuell posten"-Einträge zeigen Zeitplan → *Video herunterladen* → *Caption kopieren* → in der Plattform-App posten → *Als veröffentlicht markieren* (mit Link).
- **YouTube bis zum API-Audit:** Upload läuft automatisch, Video ist privat → Studio-Deeplink am Post → in YouTube Studio auf „Öffentlich" stellen → als veröffentlicht markieren.
- **Abgelaufene Verbindung:** Account zeigt „Abgelaufen — neu verbinden" → unter Accounts neu verbinden; betroffene Posts stehen als „Manuell posten" bereit.

## Pipeline-Ablauf

**Was geschnitten wird — und was nicht:** Geclippt wird ausschließlich **Langmaterial** (YouTube-Langvideos, Twitch-VODs). Davids fertige Shorts (≤ 180 s, das offizielle Shorts-Limit) und importierte Instagram-Clips sind Endprodukte: Sie werden **nie geschnitten und nie neu gerendert**, sondern nur täglich gemessen — ihre Zahlen fließen als Lernquelle ins Briefing („welche Formate funktionieren"). Die Regel steht in [`shared/src/ingest-policy.ts`](shared/src/ingest-policy.ts) und wird an der einzigen nicht umgehbaren Stelle durchgesetzt (Clip- bzw. Render-Job im Worker) — auch ein manueller Klick im Dashboard kommt daran nicht vorbei. Der Kanal-Scan stuft Kurzvideos direkt als „Referenz" ein und gibt ihre Quelldatei wieder frei.

Quellen (Kanal-Scan oder Link) → Download (720p) → „Clips erzeugen": Das komplette Video wird **einmal wortgenau transkribiert** (faster-whisper mit Wort-Timestamps; Cache in der DB → „Erneut clippen" ist danach sofort). Kandidaten liegen **immer auf Satzgrenzen** (62–90 s, Setup + Pointe statt Lautstärke-Peaks; Auswahl per Claude, ohne Key per Satz-Heuristik) und bekommen **kurze, wortgenau getimte Untertitel-Cues** (3–5 Wörter) → **Clips-Board** (Ziele wählen, freigeben) → 9:16-Render mit Untertitel-Burn-in + Loudness-Normalisierung (−16 LUFS) → automatische Slot-Planung (lokale Zeit, DST-sicher) → Publish oder Manual-Fallback. Fertige Instagram-Clips gehen über **Instagram-Import** direkt in die Bibliothek.

**Whisper-Modell:** Standard ist `small` — passt zuverlässig in die übliche Docker-VM (~4 GB, geteilt mit Postgres/Redis/MinIO und anderen Projekten). Für die beste Deutsch-Qualität: Docker Desktop → Settings → Resources → **Memory auf ≥ 8 GB**, dann in `.env` `WHISPER_MODEL=large-v3-turbo` setzen und `docker compose up -d worker` (turbo braucht allein ~2,5 GB und wird sonst vom OOM-Killer abgeschossen). Modelle landen einmalig in `data/whisper/`; der Worker ist per Compose auf 3 CPUs / 2 GB begrenzt, damit das Dashboard bei laufender Transkription flott bleibt (turbo-Umstieg: `mem_limit` in `docker-compose.yml` mitanheben, z. B. auf `4g`).

## Wichtige Scripts

| Script | Zweck |
|---|---|
| `npm run check` | Typecheck aller Workspaces + alle Tests (vor jedem Commit) |
| `node scripts/run-analytics.mjs` | Analytics-Snapshot sofort ziehen |
| `node scripts/run-briefing.mjs` | Kommentar-Sync + Briefing sofort |
| `node scripts/storage-ls.mjs [prefix]` | MinIO-Objekte auflisten |
| `node scripts/enqueue-download.mjs --all-discovered` | Downloads nachstoßen |
| `node scripts/clear-queues.mjs` | Alle Queues leeren (Reset, löscht auch Repeatables) |
| `node scripts/queues.mjs status` | Queue-Stand ansehen (`pause`/`resume <queue>` hält einzelne an) |
| `npm run db:studio` | DB-Browser (Drizzle Studio) |

Host-Ports sind bewusst verschoben (5433/6380/9002/9003), damit CreatorHQ parallel zu ClipPilot laufen kann; alles bindet nur an 127.0.0.1.
