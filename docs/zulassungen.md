# Plattform-Zulassungen — Unterlagen und Reihenfolge

Ohne diese drei Freigaben ist der öffentliche Link wertlos: Nur ausdrücklich
eingetragene Test-Nutzer können sich verbinden, YouTube lädt privat hoch, und
TikTok legt alles im Entwurfsordner ab.

**Sie sind der Taktgeber.** Die Prüfungen dauern Wochen und liegen nicht in
deiner Hand — deshalb gehen sie raus, sobald Domain und Datenschutzerklärung
stehen, und alles Weitere wird währenddessen gebaut.

---

## Was vorher stehen muss

| | Warum |
|---|---|
| **Feste HTTPS-Domain** | Alle drei akzeptieren nur HTTPS-Rückleitungen |
| **`/rechtliches/datenschutz` öffentlich erreichbar** | Google und Meta rufen sie im Review auf |
| **`/rechtliches/impressum` ausgefüllt** | Meta prüft die Unternehmensangaben dagegen |
| **Ein Testkonto, das du herzeigen kannst** | Alle drei verlangen Zugangsdaten für den Prüfer |

---

## 1. Google / YouTube — **zwei getrennte Anträge**

Das ist der häufigste Fehler: Verifizierung und Kontingent sind zwei Vorgänge.
Wer nur den ersten stellt, hat danach eine freigegebene App mit sechs Uploads
am Tag.

### 1a. OAuth-Verifizierung

Nötig, weil `youtube.upload` und `youtube.force-ssl` als *sensibel* gelten.
Ohne sie: höchstens 100 eingetragene Test-Nutzer, plus eine rote Warnseite.

Einzureichen:

- **Startseite** unter der eigenen Domain, die erklärt, was die App tut
- **Datenschutzerklärung** unter derselben Domain
- **Demo-Video** (unten)
- **Begründung je Berechtigung** — knapp und konkret:

> `youtube.upload` — Die App lädt Kurzvideos hoch, die sie aus den eigenen
> Langvideos des Nutzers geschnitten hat. Ohne diese Berechtigung müsste der
> Nutzer jedes Video von Hand hochladen; genau das nimmt die App ihm ab.
>
> `youtube.readonly` — Liest die Videoliste des eigenen Kanals, um daraus
> Quellmaterial für den Schnitt zu finden.
>
> `yt-analytics.readonly` — Liest die Zahlen der eigenen Videos, um dem Nutzer
> zu zeigen, welche Formate bei ihm funktionieren.
>
> `youtube.force-ssl` — Beantwortet Kommentare unter den eigenen Videos. Jede
> Antwort wird vom Nutzer im Dashboard freigegeben, bevor sie gesendet wird.

### 1b. Kontingenterhöhung

**Getrennt beantragen** über das Formular „YouTube API Services – Audit and
Quota Extension".

Die Rechnung, die in den Antrag gehört: 10.000 Einheiten am Tag, ein Upload
kostet 1.600 → rund **sechs Uploads täglich für alle Kunden zusammen**. Bei
zehn Kunden 0,6 pro Kunde und Tag.

Was ein solcher Antrag braucht: die geplante Nutzerzahl, die Uploads je Nutzer
und Tag, und die Aussage, dass ausschließlich in eigene Kanäle der Nutzer
hochgeladen wird — nicht in fremde.

> ⚠️ **Wenn dieser Antrag scheitert, ändert sich das Produkt**: YouTube wird
> zur reinen *Quelle*, veröffentlicht wird auf TikTok und Instagram. Das ist
> überlebensfähig, aber es verschiebt Preis und Ansprache. Deshalb früh
> einreichen — die Antwort soll da sein, bevor viel darauf gebaut ist.

---

## 2. TikTok — Audit der Content Posting API

Ohne Audit landet jedes Video im Entwurfsordner des Nutzers statt direkt auf
dem Kanal. Die App ist darauf vorbereitet (`TIKTOK_DIRECT_POST`), aber der
Unterschied ist für den Kunden spürbar.

Einzureichen: Demo-Video, Datenschutzerklärung, Beschreibung des Ablaufs.

Der Punkt, auf den TikTok achtet: **Der Nutzer muss sehen, was gepostet wird,
bevor es rausgeht.** Genau so arbeitet die App — Clips werden im Dashboard
freigegeben, nicht automatisch veröffentlicht. Das gehört ausdrücklich in die
Beschreibung.

---

## 3. Meta / Instagram — App Review **und** Unternehmensverifizierung

Zwei Vorgänge, und die Unternehmensverifizierung dauert erfahrungsgemäß am
längsten. **Zuerst starten.**

Benötigte Berechtigungen: `instagram_business_basic`,
`instagram_business_content_publish`, `instagram_business_manage_comments`.

Für die Verifizierung: Gewerbeanmeldung oder Handelsregisterauszug, plus eine
Adresse, die mit dem Impressum übereinstimmt.

Meta lehnt Anträge regelmäßig ab, deren Demo-Video nicht **jede** beantragte
Berechtigung im tatsächlichen Gebrauch zeigt. Ein Video, das nur das Posten
zeigt, reicht nicht, wenn auch Kommentare beantragt werden.

---

## Das Demo-Video — ein Skript für alle drei

Zwei bis drei Minuten, Bildschirmaufnahme mit Ton oder Untertiteln. Es muss
den **vollständigen** Weg zeigen, ohne Schnitt an den entscheidenden Stellen.

1. **Anmeldung** (10 s) — Registrierung mit E-Mail, Bestätigungsmail, Login.
2. **Verbinden** (30 s) — „Mit YouTube verbinden" klicken, den echten
   Zustimmungsbildschirm der Plattform zeigen, **jede angehakte Berechtigung
   im Bild lassen**, zurückkommen, „Verbunden" zeigen.
3. **Quelle hinzufügen** (20 s) — Link zu einem eigenen Langvideo einfügen.
4. **Clips entstehen** (20 s) — die erzeugten Vorschläge im Board zeigen.
5. **Freigeben** (30 s) — einen Clip auswählen, Text prüfen, Zielplattformen
   anhaken, freigeben. **Hier deutlich machen: nichts geht ohne diesen Klick
   raus.** Das ist der Punkt, an dem alle drei Prüfungen hinsehen.
6. **Veröffentlichen** (20 s) — der Post erscheint auf dem echten Kanal.
7. **Zahlen und Kommentare** (20 s) — die gemessenen Werte, und eine
   Kommentar-Antwort im Entwurf, die der Nutzer freigibt.

Für Meta zusätzlich denselben Ablauf mit Instagram — sie akzeptieren keine
Aufnahme, die nur eine andere Plattform zeigt.

---

## Nach der Freigabe

Je Plattform den Schalter umlegen, damit die Oberfläche aufhört, „Freischaltung
nötig" anzuzeigen:

```bash
GOOGLE_APP_LIVE=true
TIKTOK_APP_LIVE=true
IG_APP_LIVE=true
```

Bei TikTok zusätzlich `TIKTOK_DIRECT_POST=true`, sonst landen Videos weiter im
Entwurfsordner. Bei YouTube `YT_UPLOAD_PRIVACY=public`, sonst bleiben Uploads
privat.

Diese drei Schalter sind bewusst Handarbeit: Eine falsch geratene Freigabe
schickt zahlende Kunden in eine Sackgasse, die nach ihrem Fehler aussieht.
