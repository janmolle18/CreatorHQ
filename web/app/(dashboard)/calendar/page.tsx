import Link from "next/link";
import {
  calendarItems,
  posts,
  settings,
  type CalendarItem,
  withTenant,
  type TenantDB,
} from "@creatorhq/db";
import { requireSession } from "@/lib/auth";
import {
  DEFAULT_TIMEZONE,
  formatInTz,
  PLATFORM_SHORT,
  slotToUtc,
  todayInTz,
  type PublishPlatform,
} from "@creatorhq/shared";
import { and, gte, isNotNull, lt, ne } from "drizzle-orm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

// Selbstgebautes Monatsraster als Server Component — kein Kalender-Framework.
// Zeigt calendar_items (Drehs/Streams) und posts.scheduledAt (YT/IG/TT).

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const KIND_PREFIX: Record<CalendarItem["kind"], string> = {
  shoot: "Dreh",
  stream: "Stream",
  post: "Post",
  other: "Termin",
};

function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, monthIndex! - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(month: string): number {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, monthIndex!, 0)).getUTCDate();
}

interface DayEntry {
  time: string;
  label: string;
  tone: "post" | "item";
}

export default async function CalendarPage(props: Parameters<typeof CalendarPageInhalt>[0]) {
  const session = await requireSession();
  // Der gesamte Seitenkoerper laeuft in der Mandantengrenze. Ohne sie
  // liefert die Datenbank null Zeilen — die Seite waere leer statt falsch.
  return withTenant(session.tenantId, (db) => CalendarPageInhalt(props, db));
}

async function CalendarPageInhalt({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
},
  db: TenantDB,
) {
  const params = await searchParams;
  const [config] = await db.select().from(settings).limit(1);
  const timeZone = config?.timezone ?? DEFAULT_TIMEZONE;
  const today = todayInTz(timeZone);

  const month = MONTH_PATTERN.test(params.month ?? "") ? params.month! : today.slice(0, 7);
  const [year, monthIndex] = month.split("-").map(Number);
  const totalDays = daysInMonth(month);

  // Monatsfenster als UTC-Instants (lokale Mitternacht in der Projekt-Zeitzone).
  const windowStart = slotToUtc(`${month}-01`, "00:00", timeZone);
  const windowEnd = slotToUtc(`${shiftMonth(month, 1)}-01`, "00:00", timeZone);

  const postRows = await db
    .select({
      clipId: posts.clipId,
      platform: posts.platform,
      scheduledAt: posts.scheduledAt,
      status: posts.status,
    })
    .from(posts)
    .where(
      and(
        isNotNull(posts.scheduledAt),
        gte(posts.scheduledAt, windowStart),
        lt(posts.scheduledAt, windowEnd),
        ne(posts.status, "failed")
      )
    );
  const itemRows = await db
    .select()
    .from(calendarItems)
    .where(and(gte(calendarItems.startsAt, windowStart), lt(calendarItems.startsAt, windowEnd)));

  const entriesByDay = new Map<string, DayEntry[]>();
  const push = (day: string, entry: DayEntry) => {
    entriesByDay.set(day, [...(entriesByDay.get(day) ?? []), entry]);
  };
  // Ein Video = ein Kalendereintrag: Posts desselben Clips zum selben
  // Zeitpunkt werden zu "YT+IG+TT" zusammengefasst statt dreifach zu erscheinen.
  const postGroups = new Map<string, { day: string; time: string; shorts: string[] }>();
  for (const post of postRows) {
    const day = formatInTz(post.scheduledAt!, timeZone, "yyyy-MM-dd");
    const time = formatInTz(post.scheduledAt!, timeZone, "HH:mm");
    const key = `${post.clipId}|${day}|${time}`;
    const group = postGroups.get(key) ?? { day, time, shorts: [] };
    postGroups.set(key, {
      ...group,
      shorts: [...group.shorts, PLATFORM_SHORT[post.platform as PublishPlatform]],
    });
  }
  for (const group of postGroups.values()) {
    push(group.day, { time: group.time, label: group.shorts.join("+"), tone: "post" });
  }
  for (const item of itemRows) {
    const day = formatInTz(item.startsAt, timeZone, "yyyy-MM-dd");
    push(day, {
      time: item.allDay ? "" : formatInTz(item.startsAt, timeZone, "HH:mm"),
      label: item.title.startsWith(KIND_PREFIX[item.kind])
        ? item.title
        : `${KIND_PREFIX[item.kind]}: ${item.title}`,
      tone: "item",
    });
  }
  for (const list of entriesByDay.values()) list.sort((a, b) => a.time.localeCompare(b.time));

  // Raster: Montag-basiert; führende Lücken aus dem ISO-Wochentag des 1.
  const firstWeekday = Number(formatInTz(slotToUtc(`${month}-01`, "12:00", timeZone), timeZone, "i"));
  const cells: Array<string | null> = [
    ...Array.from({ length: firstWeekday - 1 }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <>
      <PageHeader
        kicker="Termine"
        title={`${MONTH_NAMES[monthIndex! - 1]} ${year}`}
        description="Drehs und Streams aus der Planung neben allen geplanten Posts (Kürzel je Plattform, Zeiten lokal)."
        action={
          <nav className="flex items-baseline gap-5" aria-label="Monat wechseln">
            <Link
              href={`/calendar?month=${shiftMonth(month, -1)}`}
              className="text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline"
            >
              ← Vormonat
            </Link>
            <Link
              href="/calendar"
              className="text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline"
            >
              Heute
            </Link>
            <Link
              href={`/calendar?month=${shiftMonth(month, 1)}`}
              className="text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline"
            >
              Folgemonat →
            </Link>
          </nav>
        }
      />

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-7 border-b border-hairline">
            {WEEKDAYS.map((weekday) => (
              <p
                key={weekday}
                className="pb-2 pr-3 text-right text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint"
              >
                {weekday}
              </p>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, index) => (
              <div
                key={index}
                className={`min-h-24 border-b border-r border-hairline p-2 first:border-l md:min-h-28 ${
                  index % 7 === 0 ? "border-l" : ""
                } ${day === null ? "bg-ink/[0.02]" : ""}`}
              >
                {day && (
                  <>
                    <p
                      className={`tnum text-right text-xs ${
                        day === today
                          ? "-m-1 mb-1 border border-accent p-1 font-semibold"
                          : "text-ink-faint"
                      }`}
                    >
                      {Number(day.slice(-2))}
                    </p>
                    <div className="space-y-1">
                      {(entriesByDay.get(day) ?? []).map((entry, entryIndex) => (
                        <p key={entryIndex} className="truncate text-[11px] leading-tight">
                          {entry.time && <span className="tnum text-ink-faint">{entry.time} </span>}
                          <span className={entry.tone === "post" ? "font-semibold" : ""}>
                            {entry.label}
                          </span>
                        </p>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-6 text-xs text-ink-faint">
        Fett = geplante Posts (YT/IG/TT) · Normal = Drehs, Streams und Termine aus der{" "}
        <Link href="/planning" className="underline-offset-4 hover:text-ink hover:underline">
          Planung
        </Link>
      </p>
    </>
  );
}
