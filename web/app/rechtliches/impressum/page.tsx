import { betreiber } from "@/lib/betreiber";
import { AngabenFehlen, RechtAbschnitt, RechtTitel } from "@/components/rechtstext";

export const metadata = { title: "Impressum — CreatorHQ" };

export default function ImpressumPage() {
  const b = betreiber();

  return (
    <>
      <RechtTitel>Impressum</RechtTitel>

      {!b ? (
        <AngabenFehlen was="Name, Anschrift, E-Mail" />
      ) : (
        <>
          <RechtAbschnitt titel="Angaben gemäß § 5 DDG">
            <p className="whitespace-pre-line text-ink">
              {[b.name, b.strasse, b.ort, b.land].join("\n")}
            </p>
          </RechtAbschnitt>

          <RechtAbschnitt titel="Kontakt">
            <p>
              E-Mail:{" "}
              <a href={`mailto:${b.email}`} className="text-ink underline underline-offset-4">
                {b.email}
              </a>
            </p>
            {b.telefon && <p>Telefon: {b.telefon}</p>}
          </RechtAbschnitt>

          {(b.ustId || b.register) && (
            <RechtAbschnitt titel="Registerangaben">
              {b.register && <p>{b.register}</p>}
              {b.ustId && <p>Umsatzsteuer-Identifikationsnummer: {b.ustId}</p>}
            </RechtAbschnitt>
          )}

          <RechtAbschnitt titel="Verantwortlich für den Inhalt">
            <p className="whitespace-pre-line">{[b.name, b.strasse, b.ort].join("\n")}</p>
          </RechtAbschnitt>

          <RechtAbschnitt titel="Streitbeilegung">
            <p>
              Die Europäische Kommission stellt eine Plattform zur
              Online-Streitbeilegung bereit:{" "}
              <a
                href="https://ec.europa.eu/consumers/odr/"
                className="text-ink underline underline-offset-4"
                target="_blank"
                rel="noopener noreferrer"
              >
                ec.europa.eu/consumers/odr
              </a>
            </p>
            <p>
              Wir sind weder bereit noch verpflichtet, an Streitbeilegungsverfahren vor
              einer Verbraucherschlichtungsstelle teilzunehmen.
            </p>
          </RechtAbschnitt>
        </>
      )}
    </>
  );
}
