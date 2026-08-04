import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

// Einmal-Token tragen zwei Wege, auf denen jemand ohne Passwort weiterkommt:
// Adressbestätigung und Passwort-Zurücksetzen. Ein Fehler hier ist ein Fehler
// im Zugang selbst — deshalb gegen eine echte Datenbank geprüft, nicht mit
// Attrappen.
//
// Ohne TEST_DATABASE_URL wird übersprungen (siehe scripts/test-db.sh).
const TEST_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_URL)("Einmal-Token", () => {
  let sql: postgres.Sql;
  let userId: string;
  let erzeugeToken: typeof import("./email-tokens").erzeugeToken;
  let loeseTokenEin: typeof import("./email-tokens").loeseTokenEin;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    sql = postgres(TEST_URL!, { max: 2 });

    const [nutzer] = await sql<{ id: string }[]>`
      insert into users (email, password_hash)
      values (${`token-test-${Date.now()}@beispiel.test`}, 'egal')
      returning id
    `;
    userId = nutzer!.id;

    // Erst NACH gesetztem DATABASE_URL laden — das Modul öffnet beim ersten
    // Zugriff seine Verbindung.
    ({ erzeugeToken, loeseTokenEin } = await import("./email-tokens"));
  });

  afterAll(async () => {
    await sql`delete from users where id = ${userId}`;
    await sql.end();
  });

  it("löst ein frisches Token ein", async () => {
    const token = await erzeugeToken(userId, "verify");
    const ergebnis = await loeseTokenEin(token, "verify");
    expect(ergebnis?.userId).toBe(userId);
  });

  it("lässt dasselbe Token kein zweites Mal durch", async () => {
    // Der wichtigste Fall: Ein abgefangener Link darf nach dem Klick des
    // Empfängers wertlos sein.
    const token = await erzeugeToken(userId, "verify");
    expect(await loeseTokenEin(token, "verify")).not.toBeNull();
    expect(await loeseTokenEin(token, "verify")).toBeNull();
  });

  it("akzeptiert ein Token nicht für den falschen Zweck", async () => {
    // Sonst ließe sich ein Bestätigungslink zum Passwortsetzen umbiegen —
    // Bestätigungslinks gelten sieben Tage, Passwortlinks eine Stunde.
    const token = await erzeugeToken(userId, "verify");
    expect(await loeseTokenEin(token, "reset")).toBeNull();
  });

  it("entwertet das alte Token, sobald ein neues angefordert wird", async () => {
    const alt = await erzeugeToken(userId, "reset");
    const neu = await erzeugeToken(userId, "reset");
    expect(await loeseTokenEin(alt, "reset")).toBeNull();
    expect(await loeseTokenEin(neu, "reset")).not.toBeNull();
  });

  it("lehnt Erfundenes und Übergroßes ab", async () => {
    expect(await loeseTokenEin("voellig-erfunden", "verify")).toBeNull();
    expect(await loeseTokenEin("x".repeat(500), "verify")).toBeNull();
    expect(await loeseTokenEin("", "verify")).toBeNull();
  });

  it("lehnt ein abgelaufenes Token ab", async () => {
    const token = await erzeugeToken(userId, "reset");
    await sql`
      update email_tokens set expires_at = now() - interval '1 minute'
      where user_id = ${userId} and used_at is null
    `;
    expect(await loeseTokenEin(token, "reset")).toBeNull();
  });

  it("legt den Klartext nirgends in der Datenbank ab", async () => {
    // Wer die Datenbank liest, darf damit keine fremde Adresse bestätigen.
    const token = await erzeugeToken(userId, "verify");
    const [treffer] = await sql<{ n: string }[]>`
      select count(*)::text as n from email_tokens where token_hash = ${token}
    `;
    expect(Number(treffer!.n)).toBe(0);
  });
});
