import Link from "next/link";
import { notFound } from "next/navigation";
import { briefings, db } from "@creatorhq/db";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import { BriefingView } from "../briefing-view";

export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default async function BriefingArchivePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!DATE_PATTERN.test(date)) notFound();

  const [briefing] = await db.select().from(briefings).where(eq(briefings.briefingDate, date));
  if (!briefing) notFound();

  const [year, month, day] = date.split("-");

  return (
    <>
      <PageHeader
        kicker="Archiv"
        title={`Briefing vom ${day}.${month}.${year}`}
        action={
          <Link
            href="/briefing"
            className="text-[13px] font-medium tracking-wide text-ink-soft underline-offset-4 hover:text-ink hover:underline"
          >
            Zum aktuellen Briefing
          </Link>
        }
      />
      <BriefingView briefing={briefing} />
    </>
  );
}
