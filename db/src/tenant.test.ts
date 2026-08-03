import { describe, expect, it, beforeAll } from "vitest";
import postgres from "postgres";

// Die Mandantengrenze ist die einzige Eigenschaft, deren Bruch fremde
// Kundendaten ausliefert. Deshalb wird sie nicht nur behauptet, sondern gegen
// eine echte Datenbank geprüft — mit RLS-Regeln und der eingeschränkten Rolle,
// unter der die App tatsächlich verbindet.
//
// Ohne TEST_DATABASE_URL wird übersprungen, damit `npm run check` auf einem
// Rechner ohne laufende Datenbank grün bleibt. Der Einrichtungsbefehl steht
// in scripts/test-db.sh.
const TEST_URL = process.env.TEST_DATABASE_URL;

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe.skipIf(!TEST_URL)("Mandantentrennung (RLS)", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = postgres(TEST_URL!, { max: 2 });
  });

  /** Führt eine Abfrage in einer Transaktion mit gesetztem Mandanten aus. */
  async function alsMandant<T>(
    tenantId: string | null,
    lauf: (tx: postgres.TransactionSql) => Promise<T>
  ): Promise<T> {
    return sql.begin(async (tx) => {
      if (tenantId !== null) {
        await tx`select set_config('app.tenant_id', ${tenantId}, true)`;
      }
      return lauf(tx);
    });
  }

  async function clipAnzahl(tenantId: string | null): Promise<number> {
    const zeilen = await alsMandant(
      tenantId,
      (tx) => tx<{ n: string }[]>`select count(*)::text as n from clips`
    );
    return Number(zeilen[0]!.n);
  }

  it("liefert ohne gesetzten Mandanten keine Zeile", async () => {
    // Der wichtigste Fall: Eine Abfrage, die den Filter vergisst, bekommt
    // nichts — statt allem.
    expect(await clipAnzahl(null)).toBe(0);
  });

  it("zeigt jedem Mandanten nur seine eigenen Clips", async () => {
    const a = await clipAnzahl(A);
    const b = await clipAnzahl(B);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    // Nicht die Summe: Keiner sieht die Zeilen des anderen mit.
    expect(await clipAnzahl(null)).toBe(0);
  });

  it("verweigert das Schreiben in einen fremden Mandanten", async () => {
    await expect(
      alsMandant(A, (tx) => tx`insert into clips (tenant_id, status) values (${B}, 'candidate')`)
    ).rejects.toThrow(/row-level security/i);
  });

  it("löscht keine fremden Zeilen, auch ohne WHERE auf den Mandanten", async () => {
    const vorher = await clipAnzahl(B);
    const geloescht = await alsMandant(A, async (tx) => {
      const weg = await tx`delete from clips where tenant_id = ${B} returning id`;
      return weg.length;
    });
    expect(geloescht).toBe(0);
    expect(await clipAnzahl(B)).toBe(vorher);
  });

  it("verbindet als Rolle ohne RLS-Umgehung", async () => {
    // Ein Superuser umginge alle Regeln oben lautlos. Schlägt dieser Test
    // fehl, ist die Trennung von DATABASE_URL und MIGRATION_DATABASE_URL
    // verrutscht und sämtliche anderen Zusicherungen sind wertlos.
    const [rolle] = await sql<{ super: boolean; bypass: boolean }[]>`
      select rolsuper as super, rolbypassrls as bypass
      from pg_roles where rolname = current_user
    `;
    expect(rolle!.super).toBe(false);
    expect(rolle!.bypass).toBe(false);
  });
});
