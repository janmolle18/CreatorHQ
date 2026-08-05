# Verbinden zum Laufen bringen — der kurze Weg

Der Verbinden-Knopf ist gebaut. Was fehlt, sind drei Entwickler-Apps bei
Google, TikTok und Meta. Ohne sie zeigt `/verbinden` bewusst **gar keinen
Knopf** — lieber das, als einer, der beim Kunden in einer Fehlermeldung endet.

> **Der Punkt, der oft übersehen wird: Du brauchst für den Start keine
> Freigabe.** Alle drei Plattformen lassen echte Verbindungen sofort zu — für
> Konten, die du ausdrücklich einträgst. Die Freigabe (siehe
> [zulassungen.md](zulassungen.md)) brauchst du erst, wenn sich ein *beliebiger*
> Creator verbinden können soll.
>
> Heißt praktisch: **David und die ersten Handvoll Kunden gehen ab morgen** —
> die Anträge laufen parallel.

---

## Was vorher da sein muss

Eine feste HTTPS-Adresse. Alle drei akzeptieren nur HTTPS-Rückleitungen (Google
lässt für den Test auch `http://localhost` zu, die anderen nicht).

Setze `APP_BASE_URL` auf genau diese Adresse. Alles Weitere leitet sich daraus
ab — und die **Systemseite prüft es für dich**: Unter „Plattform-Zugänge" steht
je Plattform, ob Schlüssel und Rückleitung passen, samt der Adresse, die du in
der Konsole der Plattform hinterlegen musst.

---

## 1. YouTube (Google) — 15 Minuten

1. [console.cloud.google.com](https://console.cloud.google.com) → Projekt anlegen
2. **APIs aktivieren:** „YouTube Data API v3" und „YouTube Analytics API"
3. **OAuth-Zustimmungsbildschirm** → Nutzertyp *Extern* → ausfüllen
   → **Testnutzer hinzufügen:** die Google-Adressen deiner ersten Creator.
   Hier liegt der Trick — eingetragene Testnutzer dürfen sofort zustimmen.
4. **Anmeldedaten → OAuth-Client-ID → Webanwendung**
   → *Autorisierte Weiterleitungs-URIs*: die Adresse aus der Systemseite,
   zeichengenau
5. In die `.env`:
   ```
   GOOGLE_CLIENT_ID=…
   GOOGLE_CLIENT_SECRET=…
   GOOGLE_REDIRECT_URI=<Adresse aus der Systemseite>
   ```

**Was der Creator sieht:** Google zeigt bis zur Verifizierung eine rote
Warnseite („Diese App wurde nicht überprüft"). Über *Erweitert → Weiter zu …*
geht es. Die Verbinden-Seite sagt das dem Creator bereits von selbst.

**Was danach geht:** Upload — allerdings **privat**, bis das Audit durch ist
(`YT_UPLOAD_PRIVACY=private`). Der Creator schaltet in YouTube Studio auf
öffentlich, zwei Klicks.

---

## 2. TikTok — 20 Minuten

1. [developers.tiktok.com](https://developers.tiktok.com) → App anlegen
2. Produkte hinzufügen: **Login Kit** und **Content Posting API**
3. **Sandbox:** deine Creator als *Target User* eintragen. Sie müssen sich
   danach einmal selbst bei TikTok einloggen, damit die Zuordnung greift.
4. Redirect-URI aus der Systemseite eintragen
5. In die `.env`:
   ```
   TIKTOK_CLIENT_KEY=…
   TIKTOK_CLIENT_SECRET=…
   TIKTOK_REDIRECT_URI=<Adresse aus der Systemseite>
   ```

**Was danach geht:** Videos landen im **Entwurfsordner** des Creators statt
direkt auf dem Kanal. Erst nach dem Audit lässt sich `TIKTOK_DIRECT_POST=true`
setzen. Für den Anfang ist der Entwurfsordner brauchbar — der Creator tippt
einmal auf „Posten".

---

## 3. Instagram (Meta) — 30 Minuten, plus Wartezeit

1. [developers.facebook.com](https://developers.facebook.com) → App
   *„Instagram API with Instagram Login"*
2. Der Creator braucht ein **Business- oder Creator-Konto** (kein privates) —
   Umstellung dauert in der Instagram-App eine Minute.
3. **Rollen → Instagram-Tester** einladen; der Creator nimmt die Einladung in
   seinen Instagram-Einstellungen an.
4. Redirect-URI aus der Systemseite eintragen
5. In die `.env`:
   ```
   IG_APP_ID=…
   IG_APP_SECRET=…
   IG_REDIRECT_URI=<Adresse aus der Systemseite>
   ```

⚠️ Instagram braucht zusätzlich `PUBLIC_MEDIA_BASE_URL` — Instagram holt das
Video selbst von einer öffentlich erreichbaren Adresse ab. Fehlt sie, fällt
Instagram sauber auf Handbetrieb zurück, statt zu scheitern.

---

## Danach: prüfen, nicht hoffen

**Auf der Systemseite** steht unter „Plattform-Zugänge", ob Schlüssel und
Rückleitung sitzen. Weicht die Rückleitung ab, siehst du beide Adressen
untereinander — das ist der mit Abstand häufigste Fehler und sonst nur an einer
Meldung der Plattform erkennbar, die niemand deuten kann.

**Auf der Verbinden-Seite** steht bei jedem verbundenen Konto der Knopf
**„Kann hochgeladen werden?"**. Der fragt die Plattform tatsächlich — nicht die
eigene Datenbank — und beantwortet die Frage, die „Verbunden" offenlässt:

- gilt das Token noch?
- war die Berechtigung zum **Hochladen** bei der Zustimmung dabei?
- und antwortet die Plattform mit dem **richtigen Konto**?

Der dritte Punkt ist der, der in der Praxis überrascht: Wer bei Google
versehentlich seine private Adresse wählt statt der mit dem Kanal, ist
„verbunden" — nur eben mit einem Konto ohne Kanal.

---

## Freischalten, sobald die Plattform freigegeben hat

```bash
GOOGLE_APP_LIVE=true    # Verbinden-Seite hört auf, „Freischaltung nötig" zu sagen
TIKTOK_APP_LIVE=true
IG_APP_LIVE=true
TIKTOK_DIRECT_POST=true # sonst bleibt es beim Entwurfsordner
YT_UPLOAD_PRIVACY=public
```

Diese Schalter sind bewusst Handarbeit: Eine falsch geratene Freigabe schickt
zahlende Kunden in eine Sackgasse, die nach ihrem Fehler aussieht.
