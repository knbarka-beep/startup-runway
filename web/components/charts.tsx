"use client";
// The three charts of the dashboard: cash curve, MRR bridge (waterfall) and burn driver bars.
// The KPI sparkline lives in components/kit/Sparkline.tsx.
import { useMemo, useState } from "react";
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, ReferenceDot, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Annotation, Month, BurnDriver } from "@/lib/data";
import type { ProjectedMonth } from "@/lib/scenario";
import { eur, eurShort, monthLabel, monthShort, pct } from "@/lib/format";
import { ChartTooltip } from "./kit/ChartTooltip";
import { ANIMATION_MS, TWEEN_MS, useAnimateOnce, useMotionOk } from "./kit/useAnimateOnce";

const axis = { tick: { fill: "var(--muted)", fontSize: 11 }, axisLine: false, tickLine: false } as const;
// Recharts passes a label the box of the element it belongs to.
type Box = { viewBox?: { x?: number; y?: number; width?: number; height?: number } };
// Text with a halo in the card colour, so a label stays readable where it crosses a line.
const halo = { paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 4, strokeLinejoin: "round" } as const;

// A flag on the cash line: a thin stem up from the point and a short label at the top of it.
// `level` sets the stem length, so labels of neighbouring months sit at different heights and never overlap.
// On a short chart (laptop screens) the stems are shorter, so the top label stays inside the chart.
function Flag({ viewBox, note, level, chartWidth, compact }: Box & { note: Annotation; level: number; chartWidth: number; compact: boolean }) {
  const cx = (viewBox?.x ?? 0) + (viewBox?.width ?? 0) / 2;
  const cy = (viewBox?.y ?? 0) + (viewBox?.height ?? 0) / 2;
  // Near the right edge (on a phone) the flag hangs below the line instead, ending at the stem: the area
  // under the line is empty there, and the labels of the other flags are all above the line.
  const below = cx + note.short.length * 6.3 + 8 > chartWidth;
  const top = below ? cy + 30 : compact ? cy - 18 - level * 15 : cy - 26 - level * 19;
  return (
    <g>
      <title>{`${monthLabel(note.month)}: ${note.text}`}</title>
      <line x1={cx} y1={below ? cy + 5 : cy - 5} x2={cx} y2={below ? top + 3 : top - 4} stroke="var(--muted)" strokeWidth={1} />
      <text x={below ? cx - 5 : cx + 5} y={top + (below ? 9 : 0)} textAnchor={below ? "end" : "start"} fontSize={11.5} fontWeight={500}
            fill="var(--text)" style={halo}>{note.short}</text>
    </g>
  );
}

// The zero-cash month: a small red pill sitting on the x axis.
function ZeroPill({ viewBox, text }: Box & { text: string }) {
  const x = viewBox?.x ?? 0;
  const y = (viewBox?.y ?? 0) + (viewBox?.height ?? 0);
  const w = text.length * 6.2 + 14;
  return (
    <g>
      <rect x={x - w / 2} y={y - 9} width={w} height={18} rx={9} fill="var(--negative-soft)" stroke="var(--negative)" strokeWidth={1} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--negative)">{text}</text>
    </g>
  );
}

// Cash curve: actual months as a solid accent line over a soft fill, the scenario projection dashed over a
// light hatch. Flags on the actual line mark three events. A slider move tweens the projection in 200 ms.
export function CashChart({ actuals, projection, selected, zeroMonth, notes }: {
  actuals: Month[]; projection: ProjectedMonth[]; selected: string; zeroMonth: string | null; notes: Annotation[];
}) {
  const animate = useAnimateOnce();
  const motion = useMotionOk();
  const [width, setWidth] = useState(1000);
  const [height, setHeight] = useState(400);
  const last = actuals[actuals.length - 1];
  // Memoised, so changing the month does not restart the projection tween.
  const rows = useMemo(() => {
    const r = [
      ...actuals.map((m) => ({ month: m.month, actual: m.closing_cash as number | null, projection: null as number | null })),
      ...projection.map((p) => ({ month: p.month, actual: null as number | null, projection: p.cash })),
    ];
    // Start the projection at the last actual point so the two lines join.
    r[actuals.length - 1].projection = last.closing_cash;
    return r;
  }, [actuals, projection, last]);
  const min = Math.min(0, ...projection.map((p) => p.cash));

  return (
    <div className="h-[300px] lg:h-[clamp(260px,42vh,400px)]">
      <ResponsiveContainer width="100%" height="100%" onResize={(w, h) => { setWidth(w); setHeight(h); }}>
        <ComposedChart data={rows} margin={{ top: 16, right: 12, bottom: 4, left: 0 }}>
          <defs>
            <pattern id="projection-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--accent)" strokeOpacity="0.16" strokeWidth="2" />
            </pattern>
          </defs>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthShort} interval="preserveStartEnd" minTickGap={28} tickMargin={8} {...axis} />
          <YAxis tickFormatter={eurShort} width={56} domain={[min, "auto"]} {...axis} />
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeWidth: 1, strokeDasharray: "3 3" }}
            isAnimationActive={false}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof rows)[number];
              const isActual = row.actual !== null;
              return (
                <div className="min-w-[150px] rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-card">
                  <div className="mb-0.5 flex items-center justify-between gap-3">
                    <span className="font-semibold">{monthLabel(String(label))}</span>
                    {!isActual && <span className="delta">projected</span>}
                  </div>
                  <div className="text-[0.95rem] font-semibold tabular-nums">{eur(isActual ? row.actual! : row.projection!)}</div>
                  <div className="text-muted">cash in bank</div>
                </div>
              );
            }}
          />
          <ReferenceLine y={0} stroke="var(--border-strong)" />
          <ReferenceLine x={last.month} stroke="var(--border)"
                         // On a phone the legend above the chart names it; the text would collide with the flags.
                         label={width < 640 ? undefined : { value: "Projection", position: "insideTopLeft", fill: "var(--muted)", fontSize: 11, dx: 4 }} />
          {selected !== last.month && <ReferenceLine x={selected} stroke="var(--neutral)" strokeDasharray="3 3" />}
          {zeroMonth && (
            <ReferenceLine x={zeroMonth} stroke="var(--negative)" strokeOpacity={0.45} strokeDasharray="2 3"
                           label={(p: Box) => <ZeroPill {...p} text={monthLabel(zeroMonth)} />} />
          )}
          <Area type="linear" dataKey="actual" stroke="var(--accent)" strokeWidth={2} fill="var(--accent)" fillOpacity={0.09}
                baseValue={0} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
                isAnimationActive={animate} animationDuration={ANIMATION_MS} />
          <Area type="linear" dataKey="projection" stroke="var(--accent)" strokeWidth={1.75} strokeDasharray="5 4"
                fill="url(#projection-hatch)" fillOpacity={1} baseValue={0} dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)", fill: "var(--accent)" }}
                isAnimationActive={motion} animationDuration={TWEEN_MS} animationEasing="ease-out" />
          {notes.map((n, i) => (
            <ReferenceDot key={n.month} x={n.month} y={n.cash} r={3.5} fill="var(--surface)" stroke="var(--text)" strokeWidth={1.25}
                          // The earliest event gets the longest stem, so the labels step down from left to right.
                          label={(p: Box) => <Flag {...p} note={n} level={notes.length - 1 - i} chartWidth={width} compact={height < 340} />} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// MRR bridge as a waterfall. Each bar is a range [from, to]. The axis does not start at zero,
// otherwise the monthly movements (a few thousand euros) would be invisible next to ~€100k MRR.
// Not animated: Recharts hides the value labels while bars animate, and they must always show.
export function MrrBridge({ m }: { m: Month }) {
  const steps = [
    // Short names so the axis fits on a phone; the tooltip shows the full name.
    { name: "Open", full: "Opening MRR", value: m.opening_mrr, total: true },
    { name: "New", full: "New", value: m.new_mrr },
    { name: "Exp.", full: "Expansion", value: m.expansion_mrr },
    { name: "Contr.", full: "Contraction", value: m.contraction_mrr },
    { name: "Churn", full: "Churn", value: m.churn_mrr },
    { name: "Close", full: "Closing MRR", value: m.closing_mrr, total: true },
  ];
  let running = 0;
  const points: number[] = [];
  const rows = steps.map((s) => {
    const from = s.total ? 0 : running;
    const to = s.total ? s.value : running + s.value;
    running = to;
    points.push(to);
    return { ...s, range: [from, to] as [number, number] };
  });
  const lo = Math.max(0, Math.floor((Math.min(...points) - Math.max(Math.max(...points) - Math.min(...points), 2000)) / 1000) * 1000);
  const hi = Math.ceil((Math.max(...points) + 1000) / 1000) * 1000;
  for (const r of rows) if (r.total) r.range = [lo, r.value];
  const colour = (r: (typeof rows)[number]) => (r.total ? "var(--neutral)" : r.value >= 0 ? "var(--positive)" : "var(--negative)");

  return (
    <div className="min-h-[250px] flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="name" interval={0} {...axis} />
          <YAxis domain={[lo, hi]} allowDataOverflow tickFormatter={eurShort} width={56} {...axis} />
          <Tooltip
            cursor={{ fill: "var(--grid)" }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const r = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !r) return null;
              return <ChartTooltip title={`MRR bridge, ${monthLabel(m.month)}`} rows={[{ name: r.full, value: eur(r.value), color: colour(r) }]} />;
            }}
          />
          <Bar dataKey="range" radius={[2, 2, 0, 0]} maxBarSize={44} isAnimationActive={false}>
            {rows.map((r) => <Cell key={r.name} fill={colour(r)} fillOpacity={r.total ? 0.6 : 0.85} />)}
            {/* Value above each bar; the two totals in bold. */}
            <LabelList dataKey="value" content={(p) => {
              const r = rows[Number(p.index)];
              const top = Math.min(Number(p.y), Number(p.y) + Number(p.height));
              return (
                <text x={Number(p.x) + Number(p.width) / 2} y={top - 6} textAnchor="middle" fontSize={10.5}
                      fontWeight={r.total ? 700 : 500} fill="var(--text)">{r.value === 0 ? "€0" : eurShort(r.value)}</text>
              );
            }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Where the money goes: payroll by team and other costs by category, as simple bars.
export function BurnDrivers({ rows, type }: { rows: BurnDriver[]; type: "team" | "category" }) {
  const list = rows.filter((r) => r.driver_type === type).sort((a, b) => b.amount - a.amount);
  const total = list.reduce((s, r) => s + r.amount, 0);
  const max = Math.max(...list.map((r) => r.amount));
  const row = "grid grid-cols-[120px_1fr_64px] items-center gap-3 text-[0.85rem] max-[480px]:grid-cols-[100px_1fr_56px]";
  return (
    <div className="grid gap-1.5">
      {list.map((r) => (
        <div className={row} key={r.driver} title={`${eur(r.amount)} (${pct(r.amount / total, 0)})`}>
          <span>{r.driver.charAt(0).toUpperCase() + r.driver.slice(1)}</span>
          <div className="h-2 rounded-sm bg-surface-2">
            <div className="h-2 rounded-sm bg-accent transition-[width] duration-200 motion-reduce:transition-none"
                 style={{ width: `${(r.amount / max) * 100}%` }} />
          </div>
          <span className="text-right tabular-nums">{eurShort(r.amount)}</span>
        </div>
      ))}
      <div className={`${row} border-t border-border pt-1.5 font-semibold`}><span>Total</span><span /><span className="text-right tabular-nums">{eurShort(total)}</span></div>
    </div>
  );
}
