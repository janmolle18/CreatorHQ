# Zugänge einrichten — Reihenfolge (für Jan)

Gegenstück zu [zugaenge-fuer-david.md](zugaenge-fuer-david.md). Die Reihenfolge ist nicht
beliebig: Schritt 0 muss stehen, bevor David in Teil 3 auf „Verbinden" tippt.

## Die Falle: die Redirect-URI ist fest, nicht dynamisch

`web/app/api/oauth/*/authorize/route.ts` nimmt die Rückleit-Adresse aus `*_REDIRECT_URI` in
`.env` — nicht aus dem Host der Anfrage. Steht dort `http://localhost:3000/...`, landet David
nach der Zustimmung auf **seinem eigenen Handy** auf localhost, und der State-Cookie der
Tunnel-Domain passt ohnehin nicht mehr. Der aktuelle Quick-Tunnel
(`logs/.link-target`) wechselt zudem bei jedem Neustart die Adresse — jede Wechsel würde alle
drei Entwickler-Apps gleichzeitig ungültig machen.

Google erlaubt `http://localhost` als Ausnahme; TikTok und Meta verlangen HTTPS. Ohne feste
Domain sind TikTok und Instagram also nicht verbindbar — auch nicht am eigenen Mac.

## Schritt 0 — Feste Domain (Jan-TODO 6, jetzt auf dem kritischen Pfad)

```bash
cd "/Users/janmollemeier/Documents/Projekte claude/Projekte/CreatorHQ" && ./ops/setup-named-tunnel.sh creatorhq.deine-domain.de
```

Danach in `.env`:

| Variable | Wert |
|---|---|
| `APP_BASE_URL` | `https://creatorhq.deine-domain.de` |
| `PUBLIC_MEDIA_BASE_URL` | dieselbe Adresse (Instagram braucht eine öffentlich abrufbare `video_url`) |
| `GOOGLE_REDIRECT_URI` | `https://creatorhq.deine-domain.de/api/oauth/google/callback` |
| `TIKTOK_REDIRECT_URI` | `https://creatorhq.deine-domain.de/api/oauth/tiktok/callback` |
| `IG_REDIRECT_URI` | `https://creatorhq.deine-domain.de/api/oauth/instagram/callback` |

Der Vercel-Gate darf danach dauerhaft auf diese Adresse zeigen; `com.creatorhq.linksync` und der
Quick-Tunnel-Dienst werden überflüssig.

## Schritt 1 — Davids Teil 1 + 2 anstoßen

Hängt an nichts. Kann parallel zu Schritt 0 laufen — die Anleitung ist so geschnitten, dass
David sofort loslegen kann und erst Teil 3 auf dich wartet.

## Schritt 2 — Die drei Entwickler-Apps anlegen

Erst möglich, wenn Davids drei Angaben da sind.

**Google** — console.cloud.google.com → Projekt → „YouTube Data API v3" + „YouTube Analytics
API" aktivieren → Zustimmungsbildschirm (Extern, Modus *Testing*) → **Davids Google-Adresse als
Testnutzer** → OAuth-Client (Webanwendung) mit obiger Redirect-URI → `GOOGLE_CLIENT_ID/SECRET`.
Das Audit-Formular gleich mit einreichen: bis zur Freigabe bleiben API-Uploads privat.

**TikTok** — developers.tiktok.com → App → Login Kit + Content Posting API → Sandbox →
Redirect-URI → `TIKTOK_CLIENT_KEY/SECRET`. Der Target-User lässt sich **nicht** per Name
eintragen: TikTok verlangt einen echten Login des Kontos. Deshalb der Call in Teil 3b — David
scannt den QR-Code der TikTok-Loginseite mit seiner App, sein Passwort bleibt bei ihm.
`TIKTOK_DIRECT_POST=false` bleibt bis zum Audit.

**Meta** — developers.facebook.com → App vom Typ „Instagram API with Instagram Login"
(Entwicklungsmodus) → `IG_APP_ID/SECRET` → Davids Instagram-Konto **als Instagram-Tester
einladen** (per @Name). Die Einladung ist das, was David in Teil 3a annimmt.

## Schritt 3 — Übernehmen

```bash
cd "/Users/janmollemeier/Documents/Projekte claude/Projekte/CreatorHQ" && docker compose up -d --build worker
```

`restart` reicht nicht — nur ein Neuaufbau übernimmt geänderte `.env`-Werte. Web-Dienst
ebenfalls neu starten (`launchctl kickstart -k gui/$UID/com.creatorhq.web`), sonst kennt die
OAuth-Route die neuen Werte nicht. Vorher auf `/system` prüfen, dass die Render-Queue leer ist.

## Schritt 4 — Teil 3 mit David

Erst jetzt Bescheid geben. Reihenfolge: Instagram-Einladung annehmen → Call für TikTok → im
Dashboard dreimal „Verbinden". Danach unter **Konten** kontrollieren, dass alle drei auf
„Verbunden" stehen, und einen Testpost über einen echten Clip laufen lassen.
