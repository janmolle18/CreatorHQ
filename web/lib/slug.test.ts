import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("macht aus einem Kanalnamen einen URL-tauglichen Kurznamen", () => {
    expect(slugify("Müller & Söhne")).toBe("mueller-soehne");
  });

  it("wirft Akzente weg, statt sie zu verschlucken", () => {
    // Ohne NFD-Zerlegung bliebe von "Café" nur "caf" übrig.
    expect(slugify("Café Crème")).toBe("cafe-creme");
  });

  it("lässt keine Trennstriche am Rand stehen", () => {
    expect(slugify("!!! Gaming !!!")).toBe("gaming");
  });

  it("gibt bei rein nicht-lateinischen Namen leer zurück", () => {
    // Der Aufrufer setzt dann "creator" ein — ein Kurzname aus lauter
    // Trennstrichen wäre in einer Adresse unbrauchbar.
    expect(slugify("日本語")).toBe("");
  });

  it("kürzt sehr lange Namen", () => {
    expect(slugify("a".repeat(200)).length).toBe(48);
  });

  it("behandelt Groß- und Kleinschreibung gleich", () => {
    expect(slugify("CreatorHQ")).toBe(slugify("creatorhq"));
  });
});
