import {
  briefings,
  clips,
  db,
  metricsSnapshots,
  posts,
  settings,
  sourceVideos,
} from "@creatorhq/db";
import { and, desc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { AutoRefresh } from "@/components/auto-refresh";
import { ConfirmButton } from "@/components/confirm-button";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import {
  Card,
  EmptyState,
  PageHeader,
  SectionTitle,
  StatusText,
  Table,
  Td,
} from "@/components/ui";
import { DEFAULT_TIMEZONE, formatInTz, YOUTUBE_UPLOADS_PRO_TAG } from "@creatorhq/shared";
import { checkInfra, queueDepths } from "@/lib/infra";
import {
  backupInfo,
  formatAlter,
  formatBytes,
  nachziehPlan,
  speicherPosten,
  zugangInfo,
} from "@/lib/system";
import {
  nachziehenAction,
  runAnalyticsAction,
  runBackupAction,
  setAutoPublishAction,
  syncCommentsAction,
} from "./actions";

export const dynamic = "force-dynamic";

// Jans Seite. Hier — und nur hier — darf Technik-Sprache stehen:
// Container, Queue, Redis, Terminal-Befehle. Davids Übersicht bleibt frei davon.

const BACKUP_WARNUNG_STUNDEN = 30; // nächtlich um 03:30 → älter als 30 h ist auffällig

function Zeile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-1 border-b border-hairline py-3 last:border-0 md:grid-cols-[200px_1fr]">
      <p className="text-label font-medium uppercase tracking-[0.18em] text-ink-faint">{label}</p>
      <div className="min-w-0 text-meta">{children}</div>
    </div>
  );
}

export default async function SystemPage() {
  const [
    infra,
    queues,
    backup,
    zugang,
    speicher,
    letzteMessung,
    briefingZeilen,
    fehler,
    konfig,
    wartend,
    nachziehen,
  ] = await Promise.all([
      checkInfra(),
      queueDepths(),
      backupInfo(),
      zugangInfo(),
      speicherPosten(),
      db
        .select({ capturedAt: metricsSnapshots.capturedAt })
        .from(metricsSnapshots)
        .orderBy(desc(metricsSnapshots.capturedAt))
        .limit(1),
      db.select().from(briefings).orderBy(desc(briefings.briefingDate)).limit(1),
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
        .where(and(eq(posts.status, "scheduled"), lte(posts.scheduledAt, new Date()))),
      nachziehPlan(),
    ]);

  const automatikAn = konfig[0]?.autoPublish === true;
  const sofortFaellig = wartend[0]?.anzahl ?? 0;
  const ersterTermin = nachziehen.plan.zuweisungen[0]?.zeitpunkt ?? null;
  const briefing = briefingZeilen[0];
  const briefingHaengt =
    briefing?.status === "running" &&
    Date.now() - briefing.updatedAt.getTime() > 30 * 60_000;
  const arbeitLaeuft = queues.some((queue) => queue.active > 0 || queue.waiting > 0);
  const fehlerZeilen = fehler as unknown as Array<{
    bereich: string;
    text: string | null;
    zeitpunkt: Date | string;
  }>;

  const messungAlterStunden = letzteMessung[0]
    ? (Date.now() - letzteMessung[0].capturedAt.getTime()) / 3_600_000
    : null;
  const backupZuAlt =
    backup.neuestes === null || backup.neuestes.alterStunden > BACKUP_WARNUNG_STUNDEN;

  return (
    <>
      <AutoRefresh intervalMs={10000} active={arbeitLaeuft} />
      <PageHeader
        kicker="Nur für Jan"
        title="System"
        description="Dienste, Warteschlangen, Sicherung, Zugang und Speicher. Was hier steht, sieht David bewusst nicht."
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

      <section className="mb-14">
        <SectionTitle>Automatisches Posten</SectionTitle>
        <Card>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-2xl font-semibold tracking-tight">
              {automatikAn ? "An" : "Aus"}
            </p>
            <StatusText tone={automatikAn ? "ok" : "warn"}>
              {automatikAn
                ? "Die App postet fällige Videos von selbst"
                : "David postet selbst — die App lädt nichts hoch"}
            </StatusText>
          </div>

          <p className="mt-4 max-w-2xl text-meta text-ink-soft">
            {automatikAn ? (
              <>
                Der Minuten-Takt übergibt fällige Posts an die Plattformen. „Jetzt posten" von
                Hand funktioniert unabhängig davon.
              </>
            ) : (
              <>
                Geplante Posts bleiben stehen, statt hochgeladen zu werden — David sieht sie
                weiter als Aufgabe. „Jetzt posten" von Hand bleibt trotzdem möglich, weil das
                ein bewusster Klick ist.
                {sofortFaellig > 0 && (
                  <>
                    {" "}
                    <strong className="font-medium text-ink">
                      Beim Anschalten gingen sofort {sofortFaellig}{" "}
                      {sofortFaellig === 1 ? "Post" : "Posts"} gleichzeitig raus
                    </strong>{" "}
                    — YouTube lässt pro Tag nur etwa sechs Uploads zu. Erst die wartenden Posts
                    über die Zeit verteilen, dann anschalten.
                  </>
                )}
              </>
            )}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <form action={setAutoPublishAction}>
              <input type="hidden" name="an" value={automatikAn ? "0" : "1"} />
              <SubmitButton
                variant={automatikAn ? "ghost" : "primary"}
                pendingLabel="Wird umgestellt …"
              >
                {automatikAn ? "Automatik ausschalten" : "Automatik anschalten"}
              </SubmitButton>
            </form>

            {nachziehen.plan.zuweisungen.length > 0 && (
              <form action={nachziehenAction}>
                <ConfirmButton
                  variant="ghost"
                  message={`${nachziehen.plan.zuweisungen.length} Videos auf ${nachziehen.plan.tage} Tage verteilen? Die bisherigen Termine werden überschrieben.`}
                >
                  Wartende Posts verteilen
                </ConfirmButton>
              </form>
            )}
          </div>

          {nachziehen.plan.zuweisungen.length > 0 && (
            <p className="mt-4 border-t border-hairline pt-4 text-meta text-ink-soft">
              <strong className="font-medium text-ink">
                {nachziehen.offen} wartende {nachziehen.offen === 1 ? "Post" : "Posts"}
              </strong>{" "}
              ({nachziehen.plan.zuweisungen.length}{" "}
              {nachziehen.plan.zuweisungen.length === 1 ? "Video" : "Videos"}) ließen sich auf{" "}
              <strong className="font-medium text-ink">
                {nachziehen.plan.tage} {nachziehen.plan.tage === 1 ? "Tag" : "Tage"}
              </strong>{" "}
              verteilen
              {ersterTermin && (
                <> — der erste am {formatInTz(ersterTermin, nachziehen.timeZone, "dd.MM. 'um' HH:mm")}</>
              )}
              . Höchstens {YOUTUBE_UPLOADS_PRO_TAG} YouTube-Uploads am Tag, sonst reicht das
              Tageskontingent nicht.
              {nachziehen.plan.ohnePlatz.length > 0 && (
                <>
                  {" "}
                  <StatusText tone="warn">
                    {nachziehen.plan.ohnePlatz.length} bekämen keinen Platz
                  </StatusText>
                </>
              )}
            </p>
          )}
        </Card>
      </section>

      <section className="mb-14">
        <SectionTitle>Dienste</SectionTitle>
        <Table head={["Dienst", "Status", "Latenz"]} cards>
          {infra.map((dienst) => (
            <tr key={dienst.name}>
              <Td label="Dienst" className="font-medium">
                {dienst.name}
                <span className="mt-0.5 block text-xs text-ink-faint">{dienst.endpoint}</span>
              </Td>
              <Td label="Status">
                <StatusText tone={dienst.ok ? "ok" : "err"}>{dienst.detail}</StatusText>
              </Td>
              <Td label="Latenz">
                <span className="tnum text-ink-soft">
                  {dienst.latencyMs === null ? "—" : `${dienst.latencyMs} ms`}
                </span>
              </Td>
            </tr>
          ))}
        </Table>
      </section>

      <section className="mb-14">
        <SectionTitle>Warteschlangen</SectionTitle>
        <Table head={["Queue", "Aktiv", "Wartend", "Verzögert", "Fehlgeschlagen"]} cards>
          {queues.map((queue) => (
            <tr key={queue.name}>
              <Td label="Queue" className="font-medium">
                {queue.name}
                {queue.error && (
                  <span className="mt-0.5 block text-xs text-err">
                    nicht abfragbar: {queue.error}
                  </span>
                )}
              </Td>
              <Td label="Aktiv" className="tnum">
                {queue.error ? "—" : queue.active}
              </Td>
              <Td label="Wartend" className="tnum">
                {queue.error ? "—" : queue.waiting}
              </Td>
              <Td label="Verzögert" className="tnum">
                {queue.error ? "—" : queue.delayed}
              </Td>
              <Td label="Fehlgeschlagen" className="tnum">
                {queue.error ? (
                  "—"
                ) : queue.failed > 0 ? (
                  <StatusText tone="err">{String(queue.failed)}</StatusText>
                ) : (
                  0
                )}
              </Td>
            </tr>
          ))}
        </Table>
        <p className="mt-3 text-xs text-ink-faint">
          Worker-Neubau (<code>docker compose up -d --build worker</code>) nur bei leerer
          Fertigstellungs-Queue — sonst beginnt ein laufender Render von vorn.
        </p>
      </section>

      <section className="mb-14">
        <SectionTitle>Was ist schiefgegangen</SectionTitle>
        {fehlerZeilen.length === 0 ? (
          <EmptyState title="Nichts Offenes" hint="Keine fehlgeschlagenen Jobs in der Datenbank." />
        ) : (
          <Table head={["Bereich", "Meldung", "Wann"]} cards>
            {fehlerZeilen.map((zeile, index) => (
              <tr key={`${zeile.bereich}-${index}`}>
                <Td label="Bereich" className="font-medium">
                  {zeile.bereich}
                </Td>
                <Td label="Meldung" className="text-err">
                  {zeile.text?.slice(0, 200) ?? "—"}
                </Td>
                <Td label="Wann" className="tnum whitespace-nowrap text-ink-soft">
                  {new Date(zeile.zeitpunkt).toLocaleString("de-DE")}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section className="mb-14">
        <SectionTitle>Automatik</SectionTitle>
        <Card>
          <Zeile label="Sicherung">
            {backup.neuestes ? (
              <span className="flex flex-wrap items-baseline gap-x-3">
                <StatusText tone={backupZuAlt ? "err" : "ok"}>
                  {formatAlter(backup.neuestes.alterStunden)}
                </StatusText>
                <span className="text-ink-soft">
                  {backup.neuestes.name} · {formatBytes(backup.neuestes.groesseBytes)} ·{" "}
                  {backup.anzahl} aufbewahrt
                </span>
              </span>
            ) : (
              <StatusText tone="err">
                {backup.fehler ?? "Noch keine Sicherung vorhanden"}
              </StatusText>
            )}
          </Zeile>

          <Zeile label="Letzte Messung">
            {messungAlterStunden === null ? (
              <StatusText tone="warn">noch keine</StatusText>
            ) : (
              <StatusText tone={messungAlterStunden > 30 ? "warn" : "ok"}>
                {formatAlter(messungAlterStunden)}
              </StatusText>
            )}
          </Zeile>

          <Zeile label="Letztes Briefing">
            {briefing ? (
              <span className="flex flex-wrap items-baseline gap-x-3">
                <StatusText
                  tone={
                    briefingHaengt
                      ? "err"
                      : briefing.status === "completed"
                        ? "ok"
                        : briefing.status === "failed"
                          ? "err"
                          : "muted"
                  }
                >
                  {briefingHaengt ? "hängt seit über 30 min" : briefing.status}
                </StatusText>
                <span className="text-ink-soft">{briefing.briefingDate}</span>
              </span>
            ) : (
              <span className="text-ink-soft">noch keins</span>
            )}
          </Zeile>

          <div className="mt-5 flex flex-wrap gap-3">
            <form action={runAnalyticsAction}>
              <SubmitButton variant="ghost" pendingLabel="Wird gestartet …">
                Messung jetzt laufen lassen
              </SubmitButton>
            </form>
            <form action={syncCommentsAction}>
              <SubmitButton variant="ghost" pendingLabel="Wird gestartet …">
                Kommentare abgleichen
              </SubmitButton>
            </form>
            <form action={runBackupAction}>
              <SubmitButton variant="ghost" pendingLabel="Wird gestartet …">
                Jetzt sichern
              </SubmitButton>
            </form>
          </div>
        </Card>
      </section>

      <section className="mb-14">
        <SectionTitle>Zugang für David</SectionTitle>
        <Card>
          <Zeile label="Einstiegslink">
            <a
              href="https://creatorhq.vercel.app"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:underline"
            >
              creatorhq.vercel.app ↗
            </a>
          </Zeile>
          <Zeile label="Zeigt aktuell auf">
            {zugang.tunnelUrl ? (
              <span className="break-all text-ink-soft">{zugang.tunnelUrl}</span>
            ) : (
              <StatusText tone="err">{zugang.fehler ?? "unbekannt"}</StatusText>
            )}
          </Zeile>
          <Zeile label="Ziel zuletzt geändert">
            {zugang.syncAlterMinuten === null ? (
              <StatusText tone="warn">unbekannt</StatusText>
            ) : (
              <span className="text-ink-soft">
                {formatAlter(zugang.syncAlterMinuten / 60)} — der Wächter prüft alle 5 Minuten und
                schreibt nur bei Wechsel
              </span>
            )}
          </Zeile>
          <Zeile label="Instagram-Medien">
            {zugang.medienUrl === null ? (
              <span className="text-ink-soft">
                PUBLIC_MEDIA_BASE_URL nicht gesetzt — Instagram-Publishing bleibt manuell
              </span>
            ) : zugang.medienPasstZumTunnel ? (
              <StatusText tone="ok">passt zum aktuellen Tunnel</StatusText>
            ) : (
              <span className="flex flex-wrap items-baseline gap-x-3">
                <StatusText tone="err">zeigt woanders hin</StatusText>
                <span className="break-all text-ink-soft">{zugang.medienUrl}</span>
              </span>
            )}
          </Zeile>
        </Card>
      </section>

      <section>
        <SectionTitle>Speicher</SectionTitle>
        <Table head={["Bereich", "Größe", "Objekte", ""]} cards>
          {speicher.map((posten) => (
            <tr key={posten.name}>
              <Td label="Bereich" className="font-medium">
                {posten.name}
              </Td>
              <Td label="Größe" className="tnum whitespace-nowrap">
                {formatBytes(posten.bytes)}
              </Td>
              <Td label="Objekte" className="tnum text-ink-soft">
                {posten.objekte ?? "—"}
              </Td>
              <Td label="">
                {posten.unersetzlich && (
                  <StatusText tone="warn">nicht wiederherstellbar</StatusText>
                )}
              </Td>
            </tr>
          ))}
        </Table>
        <p className="mt-3 text-xs text-ink-faint">
          Die Datenbank-Sicherung umfasst nur Postgres. Quellvideos und gerenderte Clips lassen
          sich neu erzeugen — Instagram-Importe nicht.
        </p>
      </section>
    </>
  );
}
