# CreatorHQ betreiben — von „läuft bei mir" zu „ich schicke einen Link"

## Was Creator bekommen

**Einen Link. Keine Datei.** CreatorHQ läuft auf deinem Server; der Creator
öffnet die Adresse, legt seinen Kanal an und arbeitet los. Auf dem Handy tippt
er „Zum Startbildschirm hinzufügen" und hat ein Symbol wie bei einer App — ohne
App Store, ohne Installation, ohne dass du für iOS und Android getrennt baust.

Das ist bewusst so entschieden: Die schwere Arbeit (Schnitt, Transkription,
Rendern) läuft auf durchlaufenden Servern. Nur so gehen Videos auch nachts
raus, wenn der Rechner des Creators längst zugeklappt ist.

---

## Was du brauchst

| | | |
|---|---|---|
| **Server** | 4 Kerne, 8 GB RAM, 160 GB SSD | Quellvideos sind 1–3 GB je Stück, Transkription frisst CPU |
| **Domain** | eine Subdomain genügt, z. B. `app.deine-domain.de` | Der A-Eintrag zeigt auf die Server-IP |
| **Sonst** | nichts | Caddy holt das HTTPS-Zertifikat selbst |

Die Domain ist **nicht optional**: Ohne feste HTTPS-Adresse akzeptieren
YouTube, TikTok und Meta keine Rückleitung — dann kann sich niemand verbinden.

---

## Einrichten

**1. Domain auf den Server zeigen lassen.** A-Eintrag auf die IP. Prüfen mit
`dig +short app.deine-domain.de` — es muss die Server-IP herauskommen, sonst
scheitert die Zertifikatsausstellung.

**2. Projekt auf den Server holen und Zugangsdaten anlegen.**

```bash
git clone <dein-repo> creatorhq && cd creatorhq && cp .env.example .env.prod
```

In `.env.prod` ausfüllen — die Zufallswerte erzeugst du mit
`openssl rand -hex 32`:

| Schlüssel | Wert |
|---|---|
| `DOMAIN` | `app.deine-domain.de` (ohne `https://`) |
| `APP_BASE_URL` | `https://app.deine-domain.de` |
| `PUBLIC_MEDIA_BASE_URL` | dieselbe Adresse — ohne sie fällt Instagram immer auf Handbetrieb zurück |
| `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `MINIO_ROOT_PASSWORD`, `S3_SECRET_KEY` | je ein Zufallswert |
| `SESSION_SECRET`, `APP_ENCRYPTION_KEY` | je 64 Hex-Zeichen |
| `*_REDIRECT_URI` | `https://app.deine-domain.de/api/oauth/<google\|tiktok\|instagram>/callback` |
| Plattform-Schlüssel | aus deinen drei Entwickler-Apps |

> ⚠️ **`APP_ENCRYPTION_KEY` niemals nachträglich ändern.** Damit sind alle
> Plattform-Zugänge verschlüsselt. Ein neuer Schlüssel macht sie unlesbar, und
> jeder Creator muss neu verbinden.

**3. Starten.**

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

> Der **erste** Bau dauert: Node-Abhängigkeiten, ffmpeg, yt-dlp und das
> Whisper-Modell für den Worker. Auf einem Linux-Server mit ordentlicher
> Anbindung rechne mit 10–20 Minuten, danach greift der Zwischenspeicher und
> Aktualisierungen sind in ein bis zwei Minuten durch. Auf einem Mac mit
> Docker Desktop ist es deutlich langsamer — bau die Bilder auf dem Server,
> nicht lokal.

**4. Datenbank anlegen.** Einmalig, danach nur nach Schema-Änderungen:

```bash
docker compose -f docker-compose.prod.yml exec web sh -c 'cd /app && npm run db:migrate'
```

**5. Nachsehen, ob es steht.** `https://app.deine-domain.de/registrieren` muss
die Anmeldeseite zeigen — mit gültigem Schloss im Browser.

---

## Danach: den Link verschicken

Was du dem Creator schreibst, steht in
[`zugaenge-fuer-david.md`](zugaenge-fuer-david.md) — die Anleitung passt bis
auf den Namen. Kurzfassung: Link öffnen, Kanal anlegen, drei Mal „Verbinden".

> ⚠️ **Solange die Plattform-Apps nicht freigegeben sind, kann sich nur
> verbinden, wer dort als Test-Nutzer eingetragen ist.** Die Oberfläche sagt
> das dem Creator ehrlich („Freischaltung nötig") und nennt ihm, was er dir
> schicken muss. Nach der Freigabe setzt du `GOOGLE_APP_LIVE=true` (bzw.
> `TIKTOK_APP_LIVE`, `IG_APP_LIVE`) und der Knopf wird für jeden zum Ein-Klick.

---

## Betrieb

**Aktualisieren:**

```bash
git pull && docker compose -f docker-compose.prod.yml up -d --build
```

**Sichern.** Der Worker legt jede Nacht um 03:30 einen Datenbank-Abzug nach
`./backups`. Der liegt auf **derselben Maschine** — hol ihn regelmäßig
woanders hin, sonst ist er beim Serverausfall mit weg:

```bash
rsync -az server:creatorhq/backups/ ~/creatorhq-sicherungen/
```

Was der Abzug **nicht** enthält: die Videodateien in MinIO. Quellvideos und
gerenderte Clips lassen sich neu erzeugen — hochgeladene Instagram-Importe
nicht. Für die brauchst du eine eigene Sicherung, sobald Kunden sie nutzen.

**Nachsehen, was los ist:**

```bash
docker compose -f docker-compose.prod.yml logs -f web worker
```

---

## Was noch fehlt, bevor du an Fremde verschickst

- [ ] **E-Mail-Bestätigung bei der Registrierung.** Es gibt noch keinen
      Mailversand. Bis dahin kann sich jemand mit einer fremden Adresse
      anmelden — ohne Zugriff auf deren Postfach, aber der Platz ist belegt.
- [ ] **Plattform-Freigaben.** Ohne sie lädt YouTube privat hoch, TikTok legt
      Entwürfe ab, und nur eingetragene Test-Nutzer können verbinden.
- [ ] **YouTube-Kontingent erhöhen lassen.** 10.000 Einheiten am Tag geteilt
      durch 1.600 je Upload = rund **sechs Uploads täglich für alle Kunden
      zusammen**. Bei zehn Kunden sind das 0,6 pro Kunde und Tag.
- [ ] **Abrechnung.** Es gibt noch keine Bezahlschranke — wer sich anmeldet,
      nutzt alles.
