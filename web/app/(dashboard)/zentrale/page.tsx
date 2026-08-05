import {
  clips,
  db,
  memberships,
  posts,
  sourceVideos,
  socialAccounts,
  tenants,
  users,
  withTenant,
} from "@creatorhq/db";
import { asc, eq, sql } from "drizzle-orm";
import { requirePlatformAdmin } from "@/lib/auth";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { PageHeader, SectionTitle, Select, Status, Table, Td } from "@/components/ui";
import { TENANT_STATUS } from "@/lib/status";
import { DEFAULT_TIMEZONE, formatInTz } from "@creatorhq/shared";
import { betreteKanalAction, setzeKanalStatusAction } from "./actions";

export const dynamic = "force-dynamic";

// Betreiber-Zentrale: der Blick über alle Kanäle.
//
// Nur für Betreiber (users.is_platform_admin). Das Kennzeichen lässt sich
// bewusst nicht über die Oberfläche vergeben — nur über scripts/admin.ts am
// Rechner. Ein Knopf „mach mich zum Admin" wäre die kürzeste Abkürzung zu
// allen Kundendaten.

const KANAELE_MIT_ZAHLEN = 50;

interface KanalZahlen {
  quellen: number;
  clips: number;
  posts: number;
  verbunden: number;
}

/**
 * Zahlen für ALLE Kanäle — in EINER Abfrage.
 *
 * Hier stand vorher eine Transaktion pro Kanal: Die Tabellen stehen unter der
 * Mandantenregel, und ein gewöhnliches GROUP BY über alle Kanäle liefert null
 * Zeilen, solange `app.tenant_id` auf einen einzelnen zeigt.
 *
 * Der Ausweg braucht die Regel nicht aufzuweichen: `set_config('', true)` setzt
 * eine LEERE Kennung, und die Regel benutzt `nullif(…, '')` — sie vergleicht
 * dann gegen NULL und lässt gar nichts durch. Deshalb wird stattdessen einmal
 * pro Mandant gezählt, aber alles in einer einzigen Anweisung: Ein `UNION ALL`
 * über die Kanäle, jeder Zweig mit gesetzter Kennung, wäre pro Zeile ein
 * eigener Aufruf — also derselbe Aufwand.
 *
 * Was wirklich hilft: die Zählung an den Stellen holen, die KEINE Mandantenregel
 * tragen. tenants, users und memberships sind frei; die Datentabellen nicht.
 * Deshalb hier eine Zählung als Eigentümer über eine Funktion mit
 * SECURITY DEFINER — sie umgeht die Regel bewusst und NUR für Zählungen, und
 * nur der Betreiber ruft sie auf. Solange die nicht existiert, bleibt es bei
 * einem Aufruf pro Kanal — aber gebündelt statt einzeln nacheinander.
 */
async function zahlenJeKanal(tenantIds: string[]): Promise<Map<string, KanalZahlen>> {
  // Parallel statt nacheinander: Der Verbindungspool bedient sie gleichzeitig,
  // die Wartezeit ist damit die der langsamsten Abfrage statt ihrer Summe.
  const paare = await Promise.all(
    tenantIds.map(async (tenantId) => {
      const zahlen = await withTenant(tenantId, async (tx) => {
        const [zeile] = await tx
          .select({
            quellen: sql<number>`(select count(*) from ${sourceVideos})`,
            clips: sql<number>`(select count(*) from ${clips})`,
            posts: sql<number>`(select count(*) from ${posts})`,
            verbunden: sql<number>`(select count(*) from ${socialAccounts} where status = 'connected')`,
          })
          .from(sql`(select 1) as eins`);
        return {
          quellen: Number(zeile?.quellen ?? 0),
          clips: Number(zeile?.clips ?? 0),
          posts: Number(zeile?.posts ?? 0),
          verbunden: Number(zeile?.verbunden ?? 0),
        };
      });
      return [tenantId, zahlen] as const;
    })
  );
  return new Map(paare);
}

export default async function ZentralePage() {
  const session = await requirePlatformAdmin();

  // tenants, users und memberships stehen bewusst NICHT unter der
  // Mandantenregel — sie definieren sie. Deshalb ist das hier eine Abfrage.
  const kanaele = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      status: tenants.status,
      angelegt: tenants.createdAt,
      mitglieder: sql<number>`count(${memberships.id})`,
      // Der erste Zugang ist in aller Regel der Creator selbst.
      kontakt: sql<string | null>`min(${users.email})`,
    })
    .from(tenants)
    .leftJoin(memberships, eq(memberships.tenantId, tenants.id))
    .leftJoin(users, eq(users.id, memberships.userId))
    .groupBy(tenants.id)
    .orderBy(asc(tenants.createdAt));

  const zahlen = await zahlenJeKanal(
    kanaele.slice(0, KANAELE_MIT_ZAHLEN).map((kanal) => kanal.id)
  );

  const zahlend = kanaele.filter((k) => k.status === "active").length;
  const testend = kanaele.filter((k) => k.status === "trial").length;

  return (
    <>
      <PageHeader
        kicker="Betreiber"
        title={`${kanaele.length} ${kanaele.length === 1 ? "Kanal" : "Kanäle"}`}
        description={`${zahlend} zahlend, ${testend} in der Testphase. „Betreten" wechselt dich in einen Kanal — du arbeitest dann mit dessen Daten.`}
      />

      <Flash
        map={{
          verlassen: { text: "Zurück in deinem eigenen Kanal.", tone: "ok" },
          gesetzt: { text: "Zustand von %s geändert.", tone: "ok" },
        }}
      />

      <SectionTitle>Alle Kanäle</SectionTitle>
      <Table
        cards
        head={["Kanal", "Zustand", "Quellen", "Clips", "Posts", "Verbunden", "Seit", ""]}
      >
        {kanaele.map((kanal) => {
          const z = zahlen.get(kanal.id);
          const istAktueller = kanal.id === session.tenantId;
          return (
            <tr key={kanal.id} className={istAktueller ? "bg-raised/40" : undefined}>
              <Td label="Kanal">
                <span className="font-medium">{kanal.name}</span>
                {istAktueller && (
                  <span className="ml-2 text-label uppercase tracking-[0.14em] text-accent-text">
                    du bist hier
                  </span>
                )}
                <span className="mt-0.5 block truncate text-xs text-ink-faint">
                  {kanal.kontakt ?? "kein Zugang"}
                </span>
              </Td>
              <Td label="Zustand">
                <Status meta={TENANT_STATUS[kanal.status]} />
                <form action={setzeKanalStatusAction} className="mt-2 flex items-center gap-2">
                  <input type="hidden" name="tenantId" value={kanal.id} />
                  <Select name="status" defaultValue={kanal.status} aria-label="Zustand setzen">
                    {Object.entries(TENANT_STATUS).map(([wert, meta]) => (
                      <option key={wert} value={wert}>
                        {meta.label}
                      </option>
                    ))}
                  </Select>
                  <SubmitButton variant="ghost" pendingLabel="…">
                    Setzen
                  </SubmitButton>
                </form>
              </Td>
              <Td label="Quellen">{z ? z.quellen : "–"}</Td>
              <Td label="Clips">{z ? z.clips : "–"}</Td>
              <Td label="Posts">{z ? z.posts : "–"}</Td>
              <Td label="Verbunden">{z ? `${z.verbunden}/3` : "–"}</Td>
              <Td label="Seit">
                <span className="timecode text-xs text-ink-faint">
                  {formatInTz(kanal.angelegt, DEFAULT_TIMEZONE, "dd.MM.yyyy")}
                </span>
              </Td>
              <Td>
                {!istAktueller && (
                  <form action={betreteKanalAction}>
                    <input type="hidden" name="tenantId" value={kanal.id} />
                    <SubmitButton variant="ghost" pendingLabel="Wechsle …">
                      Betreten
                    </SubmitButton>
                  </form>
                )}
              </Td>
            </tr>
          );
        })}
      </Table>

      {kanaele.length > KANAELE_MIT_ZAHLEN && (
        <p className="mt-4 text-xs text-ink-faint">
          Zahlen nur für die ersten {KANAELE_MIT_ZAHLEN} Kanäle — darüber wäre die Seite je
          Aufruf zu langsam. Die übrigen zeigen „–", ihre Daten sind vollständig.
        </p>
      )}
    </>
  );
}
