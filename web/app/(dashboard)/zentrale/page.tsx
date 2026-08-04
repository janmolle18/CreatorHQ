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

/** Ab hier lohnt sich der Umbau auf eine Sammelabfrage (siehe zahlenJeKanal). */
const KANAELE_MIT_ZAHLEN = 50;

interface KanalZahlen {
  quellen: number;
  clips: number;
  posts: number;
  verbunden: number;
}

/**
 * Zahlen je Kanal — eine Abfrage PRO Kanal.
 *
 * Nicht aus Bequemlichkeit: Diese Tabellen stehen unter der Mandantenregel,
 * und die lässt sich nicht umgehen, ohne die Regel selbst aufzuweichen. Ein
 * GROUP BY über alle Kanäle gäbe null Zeilen. Bei den ersten Dutzend Kunden
 * ist das unauffällig; darüber gehört hier eine eigene, mandantenfreie
 * Zähltabelle hin, die der Worker fortschreibt.
 */
async function zahlenJeKanal(tenantId: string): Promise<KanalZahlen> {
  return withTenant(tenantId, async (tx) => {
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

  const mitZahlen = kanaele.slice(0, KANAELE_MIT_ZAHLEN);
  const zahlen = new Map(
    await Promise.all(
      mitZahlen.map(async (kanal) => [kanal.id, await zahlenJeKanal(kanal.id)] as const)
    )
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
