"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Malé SVG grafy bez knihovny. Pravidla: tenké značky (sloupce ≤ 24 px se zaobleným koncem,
// čáry 2 px), nevýrazná mřížka, hover vrstva s tooltipem, legenda pro ≥ 2 série,
// text vždy v textových barvách, hodnoty dostupné i v tabulce.

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Hezké hodnoty os: 0, krok 1/2/5 × 10^n; u celých čísel nikdy menší než 1. */
function niceTicks(max: number, count = 4, integer = false) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const step = integer ? Math.max(1, nice) : nice;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  // Drž tooltip uvnitř grafu.
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-panel px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
      style={{ left, top: y - 8 }}
    >
      {children}
    </div>
  );
}

export function ChartTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs text-muted hover:text-text">Zobrazit jako tabulku</summary>
      <div className="mt-2 max-h-64 overflow-auto">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead className="text-muted">
            <tr>
              {columns.map((c) => (
                <th key={c} className="py-1 pr-3 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                {r.map((cell, j) => (
                  <td key={j} className="py-1 pr-3">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Sloupcový graf – jedna série (např. minuty za den)
// ---------------------------------------------------------------------------
export function ColumnChart({
  data,
  color = "var(--primary)",
  height = 180,
  unit = "",
  ariaLabel,
}: {
  data: { key: string; label: string; tick?: string; value: number }[];
  color?: string;
  height?: number;
  /** Jednotka za hodnotou (např. „min“). Funkce se ze serveru do klienta předat nedá. */
  unit?: string;
  ariaLabel: string;
}) {
  const format = (v: number) => (unit ? `${v} ${unit}` : String(v));
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 44;
  const padB = 22;
  const padT = 8;
  const plotW = Math.max(0, width - padL);
  const plotH = height - padB - padT;
  const ticks = niceTicks(
    Math.max(...data.map((d) => d.value), 1),
    4,
    data.every((d) => Number.isInteger(d.value)),
  );
  const top = ticks.at(-1)!;
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.max(2, Math.min(24, band - 2)); // ≤ 24 px, mezi sousedy aspoň 2 px mezera
  const y = (v: number) => padT + plotH - (v / top) * plotH;

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[10px] tabular-nums">
                {format(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = padL + i * band + (band - barW) / 2;
            const h = Math.max(0, y(0) - y(d.value));
            const r = Math.min(4, barW / 2, h);
            // Zaoblený jen datový konec (nahoře), u základny rovně.
            const path =
              h > 0
                ? `M${x},${y(0)} V${y(d.value) + r} Q${x},${y(d.value)} ${x + r},${y(d.value)} H${x + barW - r} Q${x + barW},${y(d.value)} ${x + barW},${y(d.value) + r} V${y(0)} Z`
                : "";
            return (
              <g key={d.key}>
                {path && <path d={path} fill={color} opacity={hover === null || hover === i ? 1 : 0.55} />}
                {d.tick && (
                  <text x={x + barW / 2} y={height - 6} textAnchor="middle" className="fill-muted text-[10px]">
                    {d.tick}
                  </text>
                )}
                {/* Zásahová plocha celé výšky pásma – větší než sloupec. */}
                <rect
                  x={padL + i * band}
                  y={padT}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${d.label}: ${format(d.value)}`}
                  onPointerEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none"
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip x={padL + hover * band + band / 2} y={y(data[hover].value)} width={width}>
          <strong className="block text-sm text-text">{format(data[hover].value)}</strong>
          <span className="text-muted">{data[hover].label}</span>
        </Tooltip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spojnicový graf – víc sérií v čase (0–100 %)
// ---------------------------------------------------------------------------
export type LineSeries = { key: string; label: string; color: string; values: (number | null)[]; emphasis?: boolean };

export function LineChart({
  xLabels,
  series,
  height = 220,
  ariaLabel,
}: {
  xLabels: { key: string; label: string; tick?: string }[];
  series: LineSeries[];
  height?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 36;
  const padR = 56; // místo na popisek konce zvýrazněné série
  const padB = 22;
  const padT = 10;
  const plotW = Math.max(0, width - padL - padR);
  const plotH = height - padB - padT;
  const n = xLabels.length;
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - v * plotH;

  // Chybějící dny (null) se přeskočí a body se spojí – hodnoty se měří jen ve dnech, kdy existují.
  const pathOf = (vals: (number | null)[]) =>
    vals
      .map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .filter((p): p is string => p !== null)
      .map((p, i) => `${i ? "L" : "M"}${p}`)
      .join(" ");
  const firstIdx = (vals: (number | null)[]) => vals.findIndex((v) => v !== null);

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  }

  const emph = series.find((s) => s.emphasis);
  const lastIdx = emph ? emph.values.findLastIndex((v) => v !== null) : -1;

  return (
    <div>
      {series.length > 1 && (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legenda">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color, height: s.emphasis ? 3 : 2 }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
        {width > 0 && n > 0 && (
          <svg width={width} height={height} role="img" aria-label={ariaLabel}>
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <g key={t}>
                <line x1={padL} x2={padL + plotW} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
                <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[10px] tabular-nums">
                  {Math.round(t * 100)} %
                </text>
              </g>
            ))}
            {xLabels.map((l, i) =>
              l.tick ? (
                <text key={l.key} x={x(i)} y={height - 6} textAnchor="middle" className="fill-muted text-[10px]">
                  {l.tick}
                </text>
              ) : null,
            )}
            {emph && lastIdx >= 0 && (
              <path d={`${pathOf(emph.values)} L${x(lastIdx)},${y(0)} L${x(firstIdx(emph.values))},${y(0)} Z`} fill={emph.color} opacity={0.1} />
            )}
            {series.map((s) => (
              <path
                key={s.key}
                d={pathOf(s.values)}
                fill="none"
                stroke={s.color}
                strokeWidth={s.emphasis ? 2.5 : 2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {/* Jediný přímý popisek: konec zvýrazněné série. */}
            {emph && lastIdx >= 0 && (
              <>
                <circle cx={x(lastIdx)} cy={y(emph.values[lastIdx]!)} r={4} fill={emph.color} stroke="var(--panel)" strokeWidth={2} />
                <text x={x(lastIdx) + 8} y={y(emph.values[lastIdx]!)} dy="0.32em" className="fill-text text-xs font-semibold">
                  {Math.round(emph.values[lastIdx]! * 100)} %
                </text>
              </>
            )}
            {hover !== null && (
              <>
                <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} stroke="var(--muted)" strokeWidth={1} />
                {series.map((s) =>
                  s.values[hover] !== null ? (
                    <circle key={s.key} cx={x(hover)} cy={y(s.values[hover]!)} r={4} fill={s.color} stroke="var(--panel)" strokeWidth={2} />
                  ) : null,
                )}
              </>
            )}
            <rect x={padL} y={padT} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} />
          </svg>
        )}
        {hover !== null && (
          <Tooltip x={x(hover)} y={padT + 4} width={width}>
            <span className="mb-1 block text-muted">{xLabels[hover].label}</span>
            {series.map((s) => (
              <span key={s.key} className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} aria-hidden />
                <strong className="text-text tabular-nums">{s.values[hover] === null ? "–" : `${Math.round(s.values[hover]! * 100)} %`}</strong>
                <span className="text-muted">{s.label}</span>
              </span>
            ))}
          </Tooltip>
        )}
      </div>
    </div>
  );
}
