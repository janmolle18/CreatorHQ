import { betreiber } from "@/lib/betreiber";
import { PruefenHinweis, RechtAbschnitt, RechtTitel } from "@/components/rechtstext";

export const metadata = { title: "AGB — CreatorHQ" };

export default function AgbPage() {
  const b = betreiber();

  return (
    <>
      <RechtTitel>Allgemeine Geschäftsbedingungen</RechtTitel>

      <RechtAbschnitt titel="1. Was CreatorHQ tut">
        <p>
          CreatorHQ schneidet aus Videos, die du bereitstellst, kurze Clips und
          veröffentlicht sie auf Kanälen, die du selbst verbindest. Anbieter ist{" "}
          {b ? b.name : "der im Impressum genannte Betreiber"}.
        </p>
      </RechtAbschnitt>

      <RechtAbschnitt titel="2. Vertrag und Testphase">
        <p>
          Der Vertrag kommt mit der Registrierung zustande. Die Testphase ist kostenlos
          und endet automatisch — sie geht nicht von selbst in ein zahlungspflichtiges
          Abonnement über.
        </p>
      </RechtAbschnitt>

      <RechtAbschnitt titel="3. Preise und Zahlung">
        <p>
          Das Abonnement wird monatlich im Voraus abgerechnet. Preise stehen bei der
          Buchung; alle Beträge verstehen sich inklusive Umsatzsteuer, soweit anwendbar.
        </p>
        <p>
          Bleibt eine Zahlung aus, pausieren wir das Veröffentlichen. Deine Daten bleiben
          dabei sichtbar und werden nicht gelöscht — wer eine Rechnung übersieht, soll
          nicht seine Arbeit verlieren.
        </p>
      </RechtAbschnitt>

      <RechtAbschnitt titel="4. Kündigung">
        <p>
          Zum Ende des jeweiligen Abrechnungszeitraums, ohne Frist und ohne Angabe von
          Gründen. Nach der Kündigung löschen wir Konto und Inhalte binnen 30 Tagen.
        </p>
      </RechtAbschnitt>

      <RechtAbschnitt titel="5. Deine Inhalte">
        <p>
          Deine Videos bleiben deine. Du räumst uns nur das Recht ein, sie zu
          verarbeiten, um daraus Clips zu erzeugen und sie auf deinen Kanälen zu
          veröffentlichen — nichts darüber hinaus. Wir nutzen deine Inhalte nicht, um
          Modelle zu trainieren, und geben sie keinem Dritten zu eigenen Zwecken.
        </p>
        <p>
          Du sicherst zu, dass du die Rechte an dem Material hast, das du hochlädst.
        </p>
      </RechtAbschnitt>

      <RechtAbschnitt titel="6. Grenzen des Dienstes">
        <p>
          Wir sind auf die Schnittstellen von YouTube, TikTok und Instagram angewiesen.
          Ändern oder beschränken diese Plattformen ihre Regeln, kann das die
          Veröffentlichung verzögern oder verhindern. Insbesondere gelten dort
          Tageskontingente, die wir nicht bestimmen. Dafür können wir keine
          Verfügbarkeit zusichern.
        </p>
        <p>
          Was automatisch erzeugt wird — Clip-Auswahl, Untertitel, Texte — ist ein
          Vorschlag. Die Entscheidung, was veröffentlicht wird, triffst du.
        </p>
      </RechtAbschnitt>

      <RechtAbschnitt titel="7. Haftung">
        <p>
          Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei
          Verletzung von Leben, Körper und Gesundheit. Bei einfacher Fahrlässigkeit
          haften wir nur für die Verletzung wesentlicher Vertragspflichten und der Höhe
          nach begrenzt auf den vertragstypischen, vorhersehbaren Schaden.
        </p>
      </RechtAbschnitt>

      <RechtAbschnitt titel="8. Änderungen">
        <p>
          Änderungen dieser Bedingungen kündigen wir mindestens 30 Tage vorher per Mail
          an. Widersprichst du nicht bis zum Wirksamwerden, gelten sie als angenommen;
          auf diese Folge weisen wir in der Ankündigung ausdrücklich hin.
        </p>
      </RechtAbschnitt>

      <RechtAbschnitt titel="9. Anwendbares Recht">
        <p>
          Es gilt deutsches Recht. Gegenüber Verbrauchern bleiben zwingende Vorschriften
          des Staates unberührt, in dem sie ihren gewöhnlichen Aufenthalt haben.
        </p>
      </RechtAbschnitt>

      <PruefenHinweis>
        Dies ist ein Entwurf, der die tatsächliche Funktionsweise beschreibt — keine
        Rechtsberatung. Insbesondere Haftung, Änderungsklausel und die
        Verbraucher-Widerrufsbelehrung gehören vor dem öffentlichen Start anwaltlich
        geprüft. Zusätzlich brauchst du einen Auftragsverarbeitungsvertrag: Du
        verarbeitest personenbezogene Daten im Auftrag deiner Kunden.
      </PruefenHinweis>
    </>
  );
}
