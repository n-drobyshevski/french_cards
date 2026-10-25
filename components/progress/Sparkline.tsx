import { cx } from "@/components/ui/cx";
import { sparkGeometry, type SparkOptions, type SparkPoint } from "./format";

export interface SparklineProps extends SparkOptions {
  /** One value per day; days without a value break the line. */
  points: readonly SparkPoint[];
  /** First and last day of the x axis ("YYYY-MM-DD"); the point on `to` (today) is red. */
  from: string;
  to: string;
  /** Accessible name with the exact values (Russian). */
  label: string;
  /** Today's point: brand red (phones) or ink (desktop, where red marks are counted). */
  todayTone?: "red" | "ink";
  /** The dashed reference: muted (an average, a target) or ink (the plan's ceiling, rule 11). */
  referenceTone?: "muted" | "ink";
  className?: string;
}

/**
 * The ledger's sparkline (Progress-Screen-A): inline SVG 120×24, a 1px rule baseline, the values as
 * a 1px ink line (vector-effect non-scaling-stroke), an optional dashed reference (average or
 * target muted; the plan's ceiling ink, `referenceTone`) and today's point in brand red (ink on desktop, `todayTone`). Desktop also marks the day
 * open in its pane (`marker`): a rule hairline and a hollow point. role=img; the numbers are in its name.
 */
export function Sparkline({
  points,
  from,
  to,
  label,
  todayTone = "red",
  referenceTone = "muted",
  className,
  width = 120,
  height = 24,
  ...opts
}: SparklineProps) {
  const g = sparkGeometry(points, from, to, { width, height, ...opts });
  return (
    <svg
      role="img"
      aria-label={label}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cx("block flex-none overflow-visible", className)}
    >
      <line x1={0} y1={height - 0.5} x2={width} y2={height - 0.5} className="stroke-rule" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {g.marker && (
        <line x1={g.marker.x} y1={0} x2={g.marker.x} y2={height} className="stroke-rule" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}
      {g.refY !== null && (
        <line
          x1={0}
          y1={g.refY}
          x2={width}
          y2={g.refY}
          className={referenceTone === "ink" ? "stroke-ink" : "stroke-muted"}
          strokeWidth={1}
          strokeDasharray="2 2"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {g.lines.map((pts, i) => (
        <polyline
          key={i}
          points={pts}
          fill="none"
          className="stroke-ink"
          strokeWidth={1}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {g.dots.map((d, i) => (
        <circle key={`d${i}`} cx={d.x} cy={d.y} r={1} className="fill-ink" />
      ))}
      {g.marker && g.marker.y !== null && !(g.today && g.today.x === g.marker.x) && (
        <circle cx={g.marker.x} cy={g.marker.y} r={2} className="fill-surface stroke-ink" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}
      {g.today && <circle cx={g.today.x} cy={g.today.y} r={2.25} className={todayTone === "ink" ? "fill-ink" : "fill-red"} />}
    </svg>
  );
}
