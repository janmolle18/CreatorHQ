import Link from "next/link";
import { db, clips } from "@creatorhq/db";
import { desc, eq } from "drizzle-orm";
import { AutoRefresh } from "@/components/auto-refresh";
import {
  EmptyState,
  PageHeader,
  SectionTitle,
  StatusText,
  Table,
  Td,
} from "@/components/ui";
import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")} min`;
}

export default async function ImportPage() {
  const imported = await db
    .select()
    .from(clips)
    .where(eq(clips.origin, "imported"))
    .orderBy(desc(clips.createdAt));

  return (
    <>
      <AutoRefresh />
      <PageHeader
        kicker="Quellen-Ingest"
        title="Instagram-Import"
        description="Davids fertige Instagram-Clips als mp4 hochladen. Sie landen direkt als publish-fertige Clips im System; der Worker prüft Dauer und 9:16-Format."
        action={
          <Link
            href="/sources"
            className="text-[13px] font-medium tracking-wide text-ink-soft underline-offset-4 hover:text-ink hover:underline"
          >
            Zu den Quellen
          </Link>
        }
      />

      <section className="mb-12">
        <UploadForm />
      </section>

      <SectionTitle>Importierte Clips</SectionTitle>
      {imported.length === 0 ? (
        <EmptyState
          title="Noch keine importierten Clips"
          hint="mp4-Dateien auswählen und importieren — sie erscheinen hier mit Prüfstatus."
        />
      ) : (
        <Table head={["Titel", "Status", "Dauer", "Prüfung"]}>
          {imported.map((clip) => (
            <tr key={clip.id}>
              <Td className="max-w-md font-medium">{clip.title ?? clip.id}</Td>
              <Td>
                <StatusText tone={clip.status === "failed" ? "err" : "ok"}>
                  {clip.status === "failed" ? "Fehlgeschlagen" : "Publish-fertig"}
                </StatusText>
              </Td>
              <Td>
                <span className="tnum text-ink-soft">{formatDuration(clip.endSeconds)}</span>
              </Td>
              <Td className="max-w-xs">
                {clip.endSeconds === null && clip.status !== "failed" ? (
                  <StatusText tone="warn">Prüfung läuft</StatusText>
                ) : clip.error ? (
                  <span className="text-xs text-warn">{clip.error.slice(0, 120)}</span>
                ) : (
                  <StatusText tone="ok">9:16 bestätigt</StatusText>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
