import { describe, expect, test } from "vitest";
import { backupsToPrune, sicherungsVerbindung } from "./backup.ts";

describe("sicherungsVerbindung", () => {
  test("nimmt BACKUP_DATABASE_URL", () => {
    expect(sicherungsVerbindung({ BACKUP_DATABASE_URL: "postgres://sicher@db/x" })).toBe(
      "postgres://sicher@db/x"
    );
  });

  test("faellt NICHT auf DATABASE_URL zurueck", () => {
    // Der Rückfall wäre schlimmer als der Abbruch: pg_dump schaltet
    // row_security ab und scheitert dann für die Anwendungsrolle an der
    // Mandantenregel — jede Nacht, mit einer Meldung, die nach einem
    // Datenbankproblem aussieht statt nach einer fehlenden Einstellung.
    expect(() => sicherungsVerbindung({ DATABASE_URL: "postgres://app@db/x" })).toThrow(
      /BACKUP_DATABASE_URL/
    );
  });

  test("leer zaehlt wie nicht gesetzt", () => {
    expect(() => sicherungsVerbindung({ BACKUP_DATABASE_URL: "   " })).toThrow();
  });
});

describe("backupsToPrune", () => {
  test("löscht die ältesten über der Retention", () => {
    const names = Array.from({ length: 16 }, (_, i) =>
      `creatorhq-2026-07-${String(i + 1).padStart(2, "0")}.sql.gz`
    );
    const prune = backupsToPrune(names, 14);
    expect(prune).toEqual(["creatorhq-2026-07-01.sql.gz", "creatorhq-2026-07-02.sql.gz"]);
  });

  test("unter der Retention wird nichts gelöscht", () => {
    expect(backupsToPrune(["creatorhq-2026-07-30.sql.gz"], 14)).toEqual([]);
  });

  test("fremde Dateien im Ordner werden ignoriert", () => {
    const prune = backupsToPrune(
      [".DS_Store", "notizen.txt", "creatorhq-2026-07-01.sql.gz", "creatorhq-2026-07-02.sql.gz"],
      1
    );
    expect(prune).toEqual(["creatorhq-2026-07-01.sql.gz"]);
  });

  test("Monatswechsel sortiert chronologisch (ISO-Namen)", () => {
    const prune = backupsToPrune(
      ["creatorhq-2026-08-01.sql.gz", "creatorhq-2026-07-31.sql.gz", "creatorhq-2026-07-30.sql.gz"],
      2
    );
    expect(prune).toEqual(["creatorhq-2026-07-30.sql.gz"]);
  });
});
