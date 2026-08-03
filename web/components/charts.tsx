// Handgebaute SVG-Charts als Server Components — keine Chart-Library.
// Typografisch: Hairlines, Tabellenziffern, Plattform-Label direkt an der Linie.

export interface SeriesPoint {
  x: string; // yyyy-MM-dd
  y: number;
}

export interface LineSeries {
  label: string;
  points: SeriesPoint[];
}

const WIDTH = 640;
const HEIGHT = 220;
const PAD_LEFT = 46;
const PAD_RIGHT = 64;
const PAD_TOP = 12;
const PAD_BOTTOM = 26;

const DASH_PATTERNS = ["", "6 4", "2 4"];

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M`;
  if (value >= 10_000) return `${Math.round(value / 1000)} k`;
  return new Intl.NumberFormat("de-DE").format(value);
}

function formatDay(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}.${month}.`;
}

/** Linien-Chart für Zeitreihen (z. B. Follower je Plattform). */
export function LineChart({ series }: { series: LineSeries[] }) {
  const drawable = series.filter((s) => s.points.length > 0);
  if (drawable.length === 0) return null;

  const allDates = [...new Set(drawable.flatMap((s) => s.points.map((p) => p.x)))].sort();
  const maxY = Math.max(1, ...drawable.flatMap((s) => s.points.map((p) => p.y)));
  const innerWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const innerHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xFor = (date: string) => {
    const index = allDates.indexOf(date);
    const ratio = allDates.length <= 1 ? 0.5 : index / (allDates.length - 1);
    return PAD_LEFT + ratio * innerWidth;
  };
  const yFor = (value: number) => PAD_TOP + innerHeight * (1 - value / (maxY * 1.08));

  const gridValues = [maxY, Math.round(maxY / 2)];

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Verlaufs-Chart"
      className="w-full max-w-2xl"
    >
      {gridValues.map((value) => (
        <g key={value}>
          <line
            x1={PAD_LEFT}
            x2={WIDTH - PAD_RIGHT}
            y1={yFor(value)}
            y2={yFor(value)}
            stroke="var(--color-hairline)"
            strokeWidth={1}
          />
          <text
            x={PAD_LEFT - 8}
            y={yFor(value) + 3}
            textAnchor="end"
            fontSize={10}
            fill="var(--color-ink-faint)"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {formatNumber(value)}
          </text>
        </g>
      ))}
      <line
        x1={PAD_LEFT}
        x2={WIDTH - PAD_RIGHT}
        y1={yFor(0)}
        y2={yFor(0)}
        stroke="var(--color-ink)"
        strokeWidth={1}
      />

      {allDates.length > 0 && (
        <>
          <text x={PAD_LEFT} y={HEIGHT - 8} fontSize={10} fill="var(--color-ink-faint)">
            {formatDay(allDates[0]!)}
          </text>
          {allDates.length > 1 && (
            <text
              x={WIDTH - PAD_RIGHT}
              y={HEIGHT - 8}
              textAnchor="end"
              fontSize={10}
              fill="var(--color-ink-faint)"
            >
              {formatDay(allDates[allDates.length - 1]!)}
            </text>
          )}
        </>
      )}

      {drawable.map((s, seriesIndex) => {
        const sorted = [...s.points].sort((a, b) => a.x.localeCompare(b.x));
        const path = sorted
          .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(p.x).toFixed(1)} ${yFor(p.y).toFixed(1)}`)
          .join(" ");
        const last = sorted[sorted.length - 1]!;
        return (
          <g key={s.label}>
            {sorted.length > 1 && (
              <path
                d={path}
                fill="none"
                stroke="var(--color-ink)"
                strokeWidth={1.5}
                strokeDasharray={DASH_PATTERNS[seriesIndex % DASH_PATTERNS.length]}
              />
            )}
            {sorted.map((p) => (
              <circle
                key={p.x}
                cx={xFor(p.x)}
                cy={yFor(p.y)}
                r={2.5}
                fill="var(--color-ink)"
              />
            ))}
            <text
              x={xFor(last.x) + 8}
              y={yFor(last.y) + 3 + seriesIndex * 12}
              fontSize={10}
              fontWeight={600}
              fill="var(--color-ink)"
            >
              {s.label} · {formatNumber(last.y)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export interface BarItem {
  label: string;
  sublabel?: string;
  value: number;
  hint?: string;
}

/** Horizontale Balkenliste (z. B. Views je Post) — div-basiert, responsiv. */
export function BarList({ items, unit }: { items: BarItem[]; unit: string }) {
  if (items.length === 0) return null;
  const max = Math.max(1, ...items.map((item) => item.value));

  return (
    <div className="max-w-2xl space-y-4">
      {items.map((item) => (
        <div key={`${item.label}-${item.sublabel ?? ""}`}>
          <div className="mb-1 flex items-baseline justify-between gap-4">
            <p className="min-w-0 truncate text-sm">
              {item.label}
              {item.sublabel && (
                <span className="ml-2 text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                  {item.sublabel}
                </span>
              )}
            </p>
            <p className="tnum shrink-0 text-sm font-semibold">
              {new Intl.NumberFormat("de-DE").format(item.value)}
              <span className="ml-1 text-xs font-normal text-ink-soft">{unit}</span>
              {item.hint && (
                <span className="ml-2 text-xs font-normal text-ink-faint">{item.hint}</span>
              )}
            </p>
          </div>
          <div className="h-[6px] w-full border border-hairline">
            <div
              className="h-full bg-ink"
              style={{ width: `${Math.max(1.5, (item.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
