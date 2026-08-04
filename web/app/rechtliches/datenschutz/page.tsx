import { betreiber } from "@/lib/betreiber";
import {
  AngabenFehlen,
  PruefenHinweis,
  RechtAbschnitt,
  RechtTitel,
} from "@/components/rechtstext";

export const metadata = { title: "Datenschutz — CreatorHQ" };

// Diese Seite prüfen Google und Meta im Rahmen ihrer App-Freigabe. Sie muss
// öffentlich erreichbar sein und beschreiben, was mit den Plattformdaten
// geschieht — allgemeine Vorlagen fallen dort durch.
export default function DatenschutzPage() {
  const b = betreiber();

  return (
    <>
      <RechtTitel>Datenschutzerklärung</RechtTitel>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">
        CreatorHQ schneidet aus deinen langen Videos kurze Clips und veröffentlicht sie
        auf deinen eigenen Kanälen. Dafür verarbeiten wir Daten — hier steht, welche,
        wozu und wie lange.
      </p>

      {!b ? (
        <AngabenFehlen was="Verantwortlicher" />
      ) : (
        <RechtAbschnitt titel="Verantwortlicher">
          <p className="whitespace-pre-line text-ink">
            {[b.name, b.strasse, b.ort, b.land, b.email].join("\n")}
          </p>
        </RechtAbschnitt>
      )}

      <RechtAbschnitt titel="Welche Daten wir verarbeiten">
        <p>
          <strong className="text-ink">Konto:</strong> E-Mail-Adresse, ein Hash deines
          Passworts (nie das Passwort selbst), Kanalname, Zeitpunkt der Registrierung.
        </p>
        <p>
          <strong className="text-ink">Plattform-Zugänge:</strong> Wenn du YouTube,
          TikTok oder Instagram verbindest, speichern wir die Zugangs-Token dieser
          Plattformen — verschlüsselt (AES-256-GCM). Wir bekommen dabei nie dein
          Passwort; die Plattform fragt dich selbst und schickt uns nur die Erlaubnis,
          in deinem Namen zu handeln.
        </p>
        <p>
          <strong className="text-ink">Inhalte:</strong> Deine Quellvideos, die daraus
          erzeugten Clips, Transkripte, Untertitel und Texte.
        </p>
        <p>
          <strong className="text-ink">Zahlen:</strong> Aufrufe, Likes und Kommentare zu
          deinen Videos, die wir bei den Plattformen abrufen, um dir zu zeigen, was
          funktioniert.
        </p>
      </RechtAbschnitt>

      <RechtAbschnitt titel="Wozu, und auf welcher Grundlage">
        <p>
          Alles Genannte dient der Erfüllung unseres Vertrags mit dir (Art. 6 Abs. 1
          lit. b DSGVO): Ohne diese Daten kann der Dienst seine Aufgabe nicht erfüllen.
          Serverprotokolle verarbeiten wir auf Grundlage unseres berechtigten Interesses
          am sicheren Betrieb (lit. f).
        </p>
      </RechtAbschnitt>

      <RechtAbschnitt titel="Wer die Daten sonst noch sieht">
        <p>
          <strong className="text-ink">Deine Plattformen</strong> (YouTube/Google, TikTok,
          Instagram/Meta): Dorthin gehen die Videos, die du veröffentlichst — das ist der
          Zweck. Es gelten zusätzlich deren eigene Bestimmungen.
        </p>
        <p>
          <strong className="text-ink">Anthropic</strong> (USA): Erzeugt Textvorschläge
          und wertet Transkripte aus. Übermittelt werden Transkript-Ausschnitte und
          Videotitel, keine Kontodaten.
        </p>
        <p>
          <strong className="text-ink">Brevo</strong> (Frankreich): Versendet die
          Bestätigungs- und Passwortmails. Erhält dafür deine E-Mail-Adresse.
        </p>
        <p>
          Server, Datenbank und Videospeicher stehen in der EU. Außer den oben genannten
          Diensten geben wir nichts weiter — insbesondere gibt es keine Werbenetzwerke
          und kein Tracking durch Dritte.
        </p>
      </RechtAbschnitt>

      <RechtAbschnitt titel="Wie lange">
        <p>
          Deine Inhalte bleiben, solange dein Konto besteht. Nach einer Kündigung löschen
          wir Konto und Inhalte binnen 30 Tagen; danach bleiben nur Daten, zu deren
          Aufbewahrung wir gesetzlich verpflichtet sind (etwa Rechnungen, zehn Jahre).
          Trennst du eine Plattform-Verbindung, löschen wir die zugehörigen Token sofort.
        </p>
      </RechtAbschnitt>

      <RechtAbschnitt titel="Cookies">
        <p>
          Wir setzen genau einen Cookie: deine Anmeldung. Er ist technisch notwendig,
          enthält keine Werbe- oder Analysedaten und braucht deshalb keine
          Einwilligungsabfrage. Es gibt kein Tracking.
        </p>
      </RechtAbschnitt>

      <RechtAbschnitt titel="Deine Rechte">
        <p>
          Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und
          Widerspruch (Art. 15–21 DSGVO). Eine Mail an uns genügt. Außerdem kannst du
          dich bei einer Datenschutz-Aufsichtsbehörde beschweren.
        </p>
      </RechtAbschnitt>

      <PruefenHinweis>
        Dieser Text beschreibt die Verarbeitung so, wie die Software sie tatsächlich
        vornimmt — er ist keine Rechtsberatung. Vor dem öffentlichen Start einmal
        anwaltlich prüfen lassen, zusammen mit den AGB und dem
        Auftragsverarbeitungsvertrag.
      </PruefenHinweis>
    </>
  );
}
