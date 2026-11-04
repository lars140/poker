import type { PointsSeries } from "@/lib/stats";

const COLORS = ["#5fcf80", "#e6b85c", "#6fb3f2", "#f0766b", "#c58af0", "#5fd0c8"];

type Props = { data: PointsSeries; labels: Map<string, string> };

/** Cumulative ranking points per tournament for the top players. Pure SVG, no client JS. */
export function PointsChart({ data, labels }: Props) {
  const { tournaments, series } = data;
  const top = [...series].sort((a, b) => (b[1].at(-1) ?? 0) - (a[1].at(-1) ?? 0)).slice(0, COLORS.length);
  if (tournaments.length === 0 || top.length === 0) return null;

  const width = 640;
  const height = 260;
  const pad = { left: 36, right: 12, top: 12, bottom: 26 };
  const maxY = Math.max(1, ...top.flatMap(([, values]) => values));
  const x = (i: number) => pad.left + (tournaments.length === 1 ? (width - pad.left - pad.right) / 2 : (i / (tournaments.length - 1)) * (width - pad.left - pad.right));
  const y = (v: number) => pad.top + (1 - v / maxY) * (height - pad.top - pad.bottom);
  const ticks = [0, 0.5, 1].map((f) => Math.round(maxY * f));

  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Ranking points over time" className="w-full">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="#243029" strokeWidth="1" />
            <text x={pad.left - 6} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#8b978f">{tick}</text>
          </g>
        ))}
        {tournaments.map((t, i) => (
          <text key={t.id} x={x(i)} y={height - 6} textAnchor="middle" fontSize="11" fill="#8b978f">{i + 1}</text>
        ))}
        {top.map(([userId, values], index) => (
          <g key={userId} stroke={COLORS[index]} fill={COLORS[index]}>
            <polyline fill="none" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
            {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3.5" stroke="none" />)}
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>Tournament number →</span>
        {top.map(([userId], index) => (
          <span key={userId} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: COLORS[index] }} />
            {labels.get(userId) ?? "unknown"}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
