import {
  briefings,
  clips,
  metricsSnapshots,
  posts,
  settings,
  sourceVideos,
  withTenant,
} from "@creatorhq/db";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { AutoRefresh } from "@/components/auto-refresh";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/ui";
import { checkInfra, queueDepths } from "@/lib/infra";
import { pruefeEinrichtung, verbindenMoeglich } from "@/lib/einrichtung-pruefen";
import { backupInfo, nachziehPlan, speicherPosten, zugangInfo } from "@/lib/system";
import {
  AutomatikSection,
  AutomatischesPostenSection,
  DiensteSection,
  FehlerSection,
  PlattformZugaengeSection,
  SpeicherSection,
  WarteschlangenSection,
  ZugangSection,
  type FehlerZeile,
} from "./sections";

export const dynamic = "force-dynamic";

// Technikseite. Hier — und nur hier — darf Technik-Sprache stehen:
// Container, Queue, Redis, Terminal-Befehle. Die Übersicht bleibt frei davon.

const BACKUP_WARNUNG_STUNDEN = 30; // nächtlich um 03:30 → älter als 30 h ist auffällig

export default async function SystemPage() {
  const session = await requireSession();
  const einrichtung = pruefeEinrichtung();
  const moeglich = verbindenMoeglich(einrichtung);

  // Betriebsdaten (Container, Warteschlangen, Speicher) sind plattformweit und
  // brauchen keine Mandantengrenze; die Datenbankabfragen darunter schon.
  const [infra, queues, backup, zugang, speicher, nachziehen] = await Promise.all([
    checkInfra(),
    queueDepths(),
    backupInfo(),
    zugangInfo(),
    speicherPosten(session.tenantId),
    nachziehPlan(session.tenantId),
  ]);

  const [letzteMessung, briefingZeilen, fehler, konfig, wartend] = await withTenant(
    session.tenantId,
    (db) =>
      Promise.all([
        db
          .select({ capturedAt: metricsSnapshots.capturedAt })
          .from(metricsSnapshots)
          .orderBy(desc(metricsSnapshots.capturedAt))
          .limit(1),
        db.select().from(briefings).orderBy(desc(briefings.briefingDate)).limit(1),
        // Die Mandantenregel greift auch hier: Jede der vier Tabellen filtert
        // sich selbst, ohne dass die Abfrage davon wissen muss.
        db.execute(sql`
        select 'Post' as bereich, ${posts.error} as text, ${posts.updatedAt} as zeitpunkt
          from ${posts} where ${posts.status} = 'failed' and ${posts.error} is not null
        union all
        select 'Clip', ${clips.error}, ${clips.updatedAt}
          from ${clips} where ${clips.status} = 'failed' and ${clips.error} is not null
        union all
        select 'Quelle', ${sourceVideos.error}, ${sourceVideos.updatedAt}
          from ${sourceVideos} where ${sourceVideos.status} = 'failed' and ${sourceVideos.error} is not null
        union all
        select 'Briefing', ${briefings.error}, ${briefings.updatedAt}
          from ${briefings} where ${briefings.status} = 'failed' and ${briefings.error} is not null
        order by zeitpunkt desc
        limit 12
      `),
        db.select({ autoPublish: settings.autoPublish }).from(settings).limit(1),
        // Was beim Anschalten sofort losliefe — die Zahl macht die Tragweite sichtbar.
        db
          .select({ anzahl: sql<number>`count(*)::int` })
          .from(posts)
          .where(
            and(eq(posts.status, "scheduled"), lte(posts.scheduledAt, new Date()))
          ),
      ])
  );

  const automatikAn = konfig[0]?.autoPublish === true;
  const sofortFaellig = wartend[0]?.anzahl ?? 0;
  const ersterTermin = nachziehen.plan.zuweisungen[0]?.zeitpunkt ?? null;
  const briefing = briefingZeilen[0];
  const briefingHaengt =
    briefing?.status === "running" &&
    Date.now() - briefing.updatedAt.getTime() > 30 * 60_000;
  const arbeitLaeuft = queues.some((queue) => queue.active > 0 || queue.waiting > 0);
  const fehlerZeilen = fehler as unknown as FehlerZeile[];

  const messungAlterStunden = letzteMessung[0]
    ? (Date.now() - letzteMessung[0].capturedAt.getTime()) / 3_600_000
    : null;
  const backupZuAlt =
    backup.neuestes === null || backup.neuestes.alterStunden > BACKUP_WARNUNG_STUNDEN;

  return (
    <>
      <AutoRefresh intervalMs={10000} active={arbeitLaeuft} />
      <PageHeader
        kicker="Technik"
        title="System"
        description="Dienste, Warteschlangen, Sicherung, Zugang und Speicher."
        action={
          <Flash
            map={{
              gestartet: { text: "%s angestoßen", tone: "ok" },
              automatik: { text: "Automatisches Posten: %s", tone: "ok" },
              verteilt: { text: "%s Videos neu verteilt", tone: "ok" },
            }}
          />
        }
      />

      <AutomatischesPostenSection
        automatikAn={automatikAn}
        sofortFaellig={sofortFaellig}
        nachziehen={nachziehen}
        ersterTermin={ersterTermin}
      />

      <PlattformZugaengeSection einrichtung={einrichtung} moeglich={moeglich} />

      <DiensteSection infra={infra} />

      <WarteschlangenSection queues={queues} />

      <FehlerSection fehlerZeilen={fehlerZeilen} />

      <AutomatikSection
        backup={backup}
        backupZuAlt={backupZuAlt}
        messungAlterStunden={messungAlterStunden}
        briefing={briefing}
        briefingHaengt={briefingHaengt}
      />

      <ZugangSection zugang={zugang} />

      <SpeicherSection speicher={speicher} />
    </>
  );
}
