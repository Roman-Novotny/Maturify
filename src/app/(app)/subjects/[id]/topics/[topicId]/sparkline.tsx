import { formatDate } from "@/lib/utils";

/** Jednoduchý SVG graf skóre (0–100 %) – bez knihovny, ať je bundle malý. */
export function ScoreSparkline({ points }: { points: { score: number; at: string }[] }) {
  const w = 600;
  const h = 160;
  const pad = 8;
  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const xy = points.map((p, i) => [pad + i * step, pad + (1 - p.score) * (h - pad * 2)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${xy.at(-1)![0].toFixed(1)},${h - pad} L${pad},${h - pad} Z`;

  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full" preserveAspectRatio="none" role="img" aria-label="Vývoj skóre">
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={pad} x2={w - pad} y1={pad + (1 - g) * (h - pad * 2)} y2={pad + (1 - g) * (h - pad * 2)} stroke="var(--border)" strokeDasharray="4 4" />
        ))}
        <path d={area} fill="var(--primary)" opacity={0.12} />
        <path d={line} fill="none" stroke="var(--primary)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs text-muted">
        <span>{formatDate(points[0].at)}</span>
        <span>{formatDate(points.at(-1)!.at)}</span>
      </figcaption>
    </figure>
  );
}
