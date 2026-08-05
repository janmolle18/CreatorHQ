import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { DARF_POSTEN, darfPosten } from "./tenant";
import type { DB } from "./client";

// Die Sperre — gegen eine ECHTE Datenbank, nicht gegen eine Attrappe.
//
// Dieser Wert entscheidet, ob im Namen eines Kunden etwas nach aussen geht.
// Eine Attrappe würde nur beweisen, dass die Attrappe tut, was ich ihr gesagt
// habe. Deshalb echte Zeilen, echte Zustände — in der Wegwerf-Datenbank aus
// scripts/test-db.sh, nie in der des laufenden Systems.
const TEST_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_URL)("Sperre: darf dieser Kanal nach aussen wirken?", () => {
  let sql: postgres.Sql;
  let handle: Pick<DB, "execute">;

  beforeAll(async () => {
    sql = postgres(TEST_URL!, { max: 2 });
    handle = drizzle(sql) as unknown as Pick<DB, "execute">;
    await sql`
      insert into tenants (id, name, slug, status) values
        ('aaaaaaaa-0000-0000-0000-000000000001', 'Sperrtest Testphase', 'sperrtest-trial', 'trial'),
        ('aaaaaaaa-0000-0000-0000-000000000002', 'Sperrtest Zahlt', 'sperrtest-active', 'active'),
        ('aaaaaaaa-0000-0000-0000-000000000003', 'Sperrtest Gesperrt', 'sperrtest-suspended', 'suspended'),
        ('aaaaaaaa-0000-0000-0000-000000000004', 'Sperrtest Gekuendigt', 'sperrtest-cancelled', 'cancelled')
      on conflict (id) do nothing`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from tenants where slug like 'sperrtest-%'`;
    await sql.end({ timeout: 5 });
  });

  it("Testphase darf senden — sonst probiert niemand das Produkt aus", async () => {
    expect(await darfPosten("aaaaaaaa-0000-0000-0000-000000000001", handle)).toBe(true);
  });

  it("zahlender Kanal darf senden", async () => {
    expect(await darfPosten("aaaaaaaa-0000-0000-0000-000000000002", handle)).toBe(true);
  });

  it("gesperrter Kanal darf NICHT senden", async () => {
    expect(await darfPosten("aaaaaaaa-0000-0000-0000-000000000003", handle)).toBe(false);
  });

  it("gekündigter Kanal darf NICHT senden", async () => {
    expect(await darfPosten("aaaaaaaa-0000-0000-0000-000000000004", handle)).toBe(false);
  });

  it("ein Kanal, den es nicht gibt, darf nicht senden", async () => {
    // Fällt zu, nicht auf: Eine gelöschte Zeile darf nicht dadurch zur
    // Freigabe werden, dass die Abfrage nichts findet.
    expect(await darfPosten("00000000-0000-0000-0000-000000000000", handle)).toBe(false);
  });
});

describe("Liste der sendeberechtigten Zustände", () => {
  it("enthält genau Testphase und Zahlt", () => {
    // Wächter gegen ein versehentlich hinzugefügtes „suspended": Wer die Liste
    // erweitert, muss diesen Test bewusst anfassen — und dabei nachdenken.
    expect([...DARF_POSTEN].sort()).toEqual(["active", "trial"]);
  });
});
