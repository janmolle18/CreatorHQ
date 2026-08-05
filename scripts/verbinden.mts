#!/usr/bin/env -S npx tsx
/**
 * Zeigt, was noch fehlt, damit sich Creator verbinden können.
 *
 *   npm run verbinden
 *
 * Warum ein Skript und nicht nur die Systemseite: Beim Einrichten sitzt man
 * zwischen drei Entwickler-Konsolen und einer .env — und braucht die Adressen
 * zum Kopieren, nicht zum Ablesen aus einer Tabelle im Browser.
 *
 * Geheimnisse werden NIE ausgegeben. Das Skript sagt nur, ob ein Wert da ist.
 * Ein Einrichtungshelfer, der Schlüssel in den Verlauf des Terminals schreibt,
 * ist ein Leck mit Bedienoberfläche.
 */
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env") });

const F = {
  fett: (s: string) => `[1m${s}[0m`,
  grau: (s: string) => `[90m${s}[0m`,
  gruen: (s: string) => `[32m${s}[0m`,
  gelb: (s: string) => `[33m${s}[0m`,
  rot: (s: string) => `[31m${s}[0m`,
};

const basis = (process.env.APP_BASE_URL ?? "").trim().replace(/\/+$/, "");

interface Plattform {
  name: string;
  konsole: string;
  minuten: number;
  /** Was der Betreiber dort anklicken muss — die Kurzfassung. */
  schritte: string[];
  envs: { name: string; geheim?: boolean }[];
  rueckleitung: { env: string; pfad: string };
  /** Was nach dem Einrichten schon geht, und was noch nicht. */
  danach: string;
}

const PLATTFORMEN: Plattform[] = [
  {
    name: "YouTube",
    konsole: "https://console.cloud.google.com",
    minuten: 15,
    schritte: [
      "Projekt anlegen",
      "APIs aktivieren: »YouTube Data API v3« und »YouTube Analytics API«",
      "OAuth-Zustimmungsbildschirm → Extern → ausfüllen",
      "TESTNUTZER hinzufügen: die Google-Adressen deiner ersten Creator ← der Trick",
      "Anmeldedaten → OAuth-Client-ID → Webanwendung → Weiterleitungs-URI unten eintragen",
    ],
    envs: [
      { name: "GOOGLE_CLIENT_ID" },
      { name: "GOOGLE_CLIENT_SECRET", geheim: true },
    ],
    rueckleitung: { env: "GOOGLE_REDIRECT_URI", pfad: "/api/oauth/google/callback" },
    danach:
      "Upload geht sofort — aber PRIVAT, bis das Audit durch ist. Der Creator schaltet in YouTube Studio auf öffentlich (2 Klicks).",
  },
  {
    name: "TikTok",
    konsole: "https://developers.tiktok.com",
    minuten: 20,
    schritte: [
      "App anlegen",
      "Produkte hinzufügen: Login Kit UND Content Posting API",
      "Sandbox → Target User: deine Creator eintragen",
      "Die Creator müssen sich danach einmal selbst bei TikTok einloggen",
    ],
    envs: [{ name: "TIKTOK_CLIENT_KEY" }, { name: "TIKTOK_CLIENT_SECRET", geheim: true }],
    rueckleitung: { env: "TIKTOK_REDIRECT_URI", pfad: "/api/oauth/tiktok/callback" },
    danach:
      "Videos landen im ENTWURFSORDNER des Creators, nicht direkt auf dem Kanal. Erst nach dem Audit lässt sich TIKTOK_DIRECT_POST=true setzen.",
  },
  {
    name: "Instagram",
    konsole: "https://developers.facebook.com",
    minuten: 30,
    schritte: [
      "App anlegen: »Instagram API with Instagram Login«",
      "Der Creator braucht ein Business- oder Creator-Konto (kein privates)",
      "Rollen → Instagram-Tester einladen; der Creator nimmt in seinen IG-Einstellungen an",
    ],
    envs: [{ name: "IG_APP_ID" }, { name: "IG_APP_SECRET", geheim: true }],
    rueckleitung: { env: "IG_REDIRECT_URI", pfad: "/api/oauth/instagram/callback" },
    danach:
      "Braucht zusätzlich PUBLIC_MEDIA_BASE_URL — Instagram holt das Video selbst von einer öffentlich erreichbaren Adresse ab.",
  },
];

function gesetzt(name: string): boolean {
  return (process.env[name] ?? "").trim().length > 0;
}

console.log();
console.log(F.fett("  Verbinden einrichten"));
console.log(F.grau("  Was fehlt, damit sich Creator mit einem Klick verbinden können."));
console.log();

if (!basis) {
  console.log(F.rot("  ✗ APP_BASE_URL fehlt."));
  console.log(
    F.grau("    Ohne sie stehen unten keine Rückleitungen. Trag die feste HTTPS-Adresse ein,")
  );
  console.log(F.grau("    unter der CreatorHQ erreichbar ist — lokal http://localhost:3001."));
  console.log();
} else {
  console.log(`  ${F.grau("Adresse dieser Installation:")} ${basis}`);
  console.log();
}

let fertig = 0;

for (const p of PLATTFORMEN) {
  const schluesselDa = p.envs.every((e) => gesetzt(e.name));
  const erwartet = basis ? `${basis}${p.rueckleitung.pfad}` : "";
  const eingetragen = (process.env[p.rueckleitung.env] ?? "").trim().replace(/\/+$/, "");
  const rueckleitungPasst = erwartet !== "" && eingetragen === erwartet;
  const komplett = schluesselDa && rueckleitungPasst;
  if (komplett) fertig += 1;

  const marke = komplett ? F.gruen("✓") : F.gelb("○");
  console.log(
    `  ${marke} ${F.fett(p.name)} ${F.grau(`— ca. ${p.minuten} Min · ${p.konsole}`)}`
  );

  if (komplett) {
    console.log(F.grau(`     Eingerichtet. ${p.danach}`));
    console.log();
    continue;
  }

  for (const [i, schritt] of p.schritte.entries()) {
    console.log(F.grau(`     ${i + 1}. ${schritt}`));
  }

  if (erwartet) {
    console.log();
    console.log(`     ${F.fett("Weiterleitungs-URI")} ${F.grau("(zeichengenau, in die Konsole):")}`);
    console.log(`     ${erwartet}`);
  }

  const fehlend = p.envs.filter((e) => !gesetzt(e.name)).map((e) => e.name);
  if (!rueckleitungPasst && erwartet) fehlend.push(p.rueckleitung.env);

  if (fehlend.length > 0) {
    console.log();
    console.log(`     ${F.fett("In die .env:")}`);
    for (const name of fehlend) {
      const wert = name === p.rueckleitung.env ? erwartet : "…";
      console.log(`     ${name}=${wert}`);
    }
    if (eingetragen && !rueckleitungPasst) {
      console.log();
      console.log(F.rot(`     ✗ ${p.rueckleitung.env} weicht ab.`));
      console.log(F.grau(`       eingetragen: ${eingetragen}`));
      console.log(F.grau(`       erwartet:    ${erwartet}`));
    }
  }
  console.log(F.grau(`     Danach: ${p.danach}`));
  console.log();
}

console.log(F.grau("  ────────────────────────────────────────────────"));
if (fertig === 0) {
  console.log(`  ${F.gelb("Noch keine Plattform eingerichtet.")}`);
  console.log(F.grau("  Die Verbinden-Seite zeigt deshalb bewusst gar keinen Knopf —"));
  console.log(F.grau("  lieber das als einer, der beim Kunden in einer Fehlermeldung endet."));
} else {
  console.log(`  ${F.gruen(`${fertig} von ${PLATTFORMEN.length} eingerichtet.`)}`);
  console.log(F.grau("  Für diese zeigt /verbinden jetzt einen Knopf."));
}
console.log();
console.log(F.grau("  Danach: Server neu starten, auf /verbinden verbinden,"));
console.log(F.grau("  dann dort »Kann hochgeladen werden?« drücken — das fragt die Plattform."));
console.log(F.grau("  Ausführlich: docs/verbinden-einrichten.md"));
console.log();
