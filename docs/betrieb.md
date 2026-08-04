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

> ⚠️ **Die Sicherung braucht eine eigene Datenbankrolle.** `pg_dump` schaltet
> `row_security = off` und liest dann jede Tabelle; für eine Rolle ohne
> `BYPASSRLS` bricht Postgres das ab. Mit der Anwendungsrolle scheitert die
> Sicherung deshalb **jede Nacht** — sichtbar nur als eine Zeile im Protokoll.
> Ein Server ohne Sicherungen, der aussieht wie einer mit.
>
> Bei einer **neu aufgesetzten** Datenbank legt `db/init/01-app-role.sh` die
> Rolle `creatorhq_backup` mit an. Eine **bestehende** Datenbank kennt sie
> nicht — dort einmal:
>
> ```bash
> ./scripts/sicherungs-rolle.sh
> ```
>
> Danach `BACKUP_DATABASE_URL` eintragen (siehe `.env.example`). Ohne diesen
> Wert bricht der Auftrag mit einer klaren Meldung ab, statt es mit einer
> Rolle zu versuchen, die es nicht darf.

**Prüfen, ob die Sicherung wirklich läuft** — nicht erst, wenn du sie
brauchst. Ein leerer oder nur schemaweiter Abzug sieht auf der Dateiliste
genauso aus wie ein guter:

```bash
gunzip -c backups/creatorhq-$(date +%F).sql.gz | grep -c '^COPY '
```

Erwartet werden **15** Blöcke. Kommt 0 oder 1 zurück, enthält der Abzug keine
Daten — dann stimmt etwas mit der Sicherungsrolle nicht.

Was der Abzug **nicht** enthält: die Videodateien in MinIO. Quellvideos und
gerenderte Clips lassen sich neu erzeugen — hochgeladene Instagram-Importe
nicht. Für die brauchst du eine eigene Sicherung, sobald Kunden sie nutzen.

**Nachsehen, was los ist:**

```bash
docker compose -f docker-compose.prod.yml logs -f web worker
```

---

## Was noch fehlt, bevor du an Fremde verschickst

- [x] ~~E-Mail-Bestätigung bei der Registrierung~~ — gebaut. Braucht nur
      noch die Brevo-Zugangsdaten (siehe unten).
- [ ] **Plattform-Freigaben** — Unterlagen und Reihenfolge stehen in
      [`zulassungen.md`](zulassungen.md). Ohne sie lädt YouTube privat hoch,
      TikTok legt Entwürfe ab, und nur eingetragene Test-Nutzer können
      verbinden.
- [ ] **YouTube-Kontingent erhöhen lassen** — ein **getrennter** Antrag neben
      der Verifizierung. 10.000 Einheiten am Tag ÷ 1.600 je Upload = rund
      **sechs Uploads täglich für alle Kunden zusammen**.
- [ ] **Betreiberangaben** (`BETREIBER_*`) ausfüllen, sonst zeigen Impressum
      und Datenschutz „noch nicht ausgefüllt" — und Google wie Meta prüfen
      genau diese Seiten.
- [ ] **Mailversand** (`BREVO_API_KEY`, `MAIL_FROM`) — ohne ihn lehnt die
      Registrierung in der Produktion ab.
- [ ] **Abrechnung.** Es gibt noch keine Bezahlschranke — wer sich anmeldet,
      nutzt alles.
