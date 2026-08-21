import { describe, expect, it } from "vitest";
import {
  bereichsPraefix,
  mandantAusSchluessel,
  mandantenPraefix,
  speicherSchluessel,
} from "./storage-keys";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("Speicher-Schlüssel je Mandant", () => {
  it("legt jeden Bereich unter den Mandanten", () => {
    expect(speicherSchluessel(A, "sources", "abc.mp4")).toBe(
      `tenants/${A}/sources/abc.mp4`
    );
  });

  it("trennt zwei Mandanten auch bei gleichem Dateinamen", () => {
    expect(speicherSchluessel(A, "clips", "x.mp4")).not.toBe(
      speicherSchluessel(B, "clips", "x.mp4")
    );
  });

  it("liefert das Präfix eines Mandanten fürs Aufräumen", () => {
    expect(mandantenPraefix(A)).toBe(`tenants/${A}/`);
    expect(bereichsPraefix(A, "thumbs")).toBe(`tenants/${A}/thumbs/`);
  });

  it("liest den Mandanten aus einem Schlüssel zurück", () => {
    const schluessel = speicherSchluessel(B, "imports", "y.mp4");
    expect(mandantAusSchluessel(schluessel)).toBe(B);
  });

  it("gibt bei Altbestand ohne Präfix null zurück", () => {
    // Aus dem Schwesterprojekt übernommene Pfade sahen so aus. Der Aufrufer muss diesen
    // Fall erkennen, statt ihn versehentlich einem Mandanten zuzuordnen.
    expect(mandantAusSchluessel("sources/abc.mp4")).toBeNull();
  });

  it("lässt sich nicht durch einen untergeschobenen Pfad täuschen", () => {
    // Ein Schlüssel, der irgendwo in der Mitte "tenants/…" enthält, gehört
    // nicht dorthin — die Prüfung ist am Anfang verankert.
    expect(mandantAusSchluessel(`clips/tenants/${A}/x.mp4`)).toBeNull();
  });
});
