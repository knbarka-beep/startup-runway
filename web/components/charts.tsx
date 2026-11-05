"use client";
// The three charts of the dashboard: cash curve, MRR bridge (waterfall) and burn driver bars.
// The KPI sparkline lives in components/kit/Sparkline.tsx.
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, ReferenceDot, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Annotation, Month, BurnDriver } from "@/lib/data";
import type { ProjectedMonth } from "@/lib/scenario";
import { eur, eurShort, monthLabel, monthShort, pct } from "@/lib/format";
import { ChartTooltip } from "./kit/ChartTooltip";
import { ANIMATION_MS, useAnimateOnce } from "./kit/useAnimateOnce";

const axis = { tick: { fill: "var(--muted)", fontSize: 11 }, axisLine: false, tickLine: false } as const;

// Cash curve: actual months as a solid accent line over a soft fill, the scenario projection dashed.
// Numbered dots on the actual line mark the events listed under the chart.
export function CashChart({ actuals, projection, selected, zeroMonth, notes }: {
  actuals: Month[]; projection: ProjectedMonth[]; selected: string; zeroMonth: string | null; notes: Annotation[];
}) {
  const animate = useAnimateOnce();
  const last = actuals[actuals.length - 1];
  const rows = [
    ...actuals.map((m) => ({ month: m.month, actual: m.closing_cash as number | null, projection: null as number | null })),
    ...projection.map((p) => ({ month: p.month, actual: null as number | null, projection: p.cash })),
  ];
  // Start the dashed line at the last actual point so the two lines join.
  rows[actuals.length - 1].projection = last.closing_cash;
  const min = Math.min(0, ...projection.map((p) => p.cash));

  return (
    <div style={{ height: 340 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 24, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthShort} interval="preserveStartEnd" minTickGap={28} {...axis} />
          <YAxis tickFormatter={eurShort} width={56} domain={[min, "auto"]} {...axis} />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            isAnimationActive={false}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof rows)[number];
              const isActual = row.actual !== null;
              return (
                <ChartTooltip
                  title={monthLabel(String(label))}
                  rows={[isActual
                    ? { name: "Actual cash", value: eur(row.actual!), color: "var(--accent)" }
                    : { name: "Projected cash", value: eur(row.projection!), color: "var(--accent)", dashed: true }]}
                />
              );
            }}
          />
          <ReferenceLine y={0} stroke="var(--border-strong)" />
          <ReferenceLine x={last.month} stroke="var(--border)"
                         label={{ value: "Projection", position: "top", fill: "var(--muted)", fontSize: 11 }} />
          {selected !== last.month && <ReferenceLine x={selected} stroke="var(--neutral)" strokeDasharray="3 3" />}
          {zeroMonth && (
            <ReferenceLine x={zeroMonth} stroke="var(--negative)" strokeOpacity={0.45} strokeDasharray="2 3"
                           label={{ value: `Cash runs out ${monthLabel(zeroMonth)}`, position: "insideTopRight", fill: "var(--negative)", fontSize: 11 }} />
          )}
          <Area type="linear" dataKey="actual" stroke="var(--accent)" strokeWidth={2} fill="var(--accent)" fillOpacity={0.08}
                baseValue={0} dot={false} activeDot={{ r: 3.5, strokeWidth: 0 }}
                isAnimationActive={animate} animationDuration={ANIMATION_MS} />
          <Line type="linear" dataKey="projection" stroke="var(--accent)" strokeWidth={1.75} strokeDasharray="5 4" dot={false}
                activeDot={{ r: 3.5, strokeWidth: 0, fill: "var(--accent)" }} isAnimationActive={false} />
          {zeroMonth && <ReferenceDot x={zeroMonth} y={0} r={3.5} fill="var(--negative)" stroke="var(--surface)" strokeWidth={1.5} />}
          {notes.map((n, i) => (
            <ReferenceDot key={n.month} x={n.month} y={n.cash} r={3.5} fill="var(--surface)" stroke="var(--text)" strokeWidth={1.25}
                          // Neighbouring months: alternate the number above and below the line so they do not overlap.
                          label={{ value: String(i + 1), position: i % 2 ? "bottom" : "top", fill: "var(--text)", fontSize: 10, fontWeight: 600 }} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// MRR bridge as a waterfall. Each bar is a range [from, to]. The axis does not start at zero,
// otherwise the monthly movements (a few thousand euros) would be invisible next to ~€100k MRR.
export function MrrBridge({ m }: { m: Month }) {
  const animate = useAnimateOnce();
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
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
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
          <Bar dataKey="range" radius={2} maxBarSize={44} isAnimationActive={animate} animationDuration={ANIMATION_MS}>
            {rows.map((r) => <Cell key={r.name} fill={colour(r)} fillOpacity={r.total ? 0.6 : 0.85} />)}
            <LabelList dataKey="value" position="top" formatter={(v) => (v === 0 ? "€0" : eurShort(Number(v)))}
                       style={{ fill: "var(--text)", fontSize: 10 }} />
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
          <span className="text-right">{eurShort(r.amount)}</span>
        </div>
      ))}
      <div className={`${row} border-t border-border pt-1.5 text-muted`}><span>Total</span><span /><span className="text-right">{eurShort(total)}</span></div>
    </div>
  );
}
