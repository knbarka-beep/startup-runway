"use client";
// The four visual pieces: sparkline, cash curve, MRR bridge (waterfall) and burn driver bars.
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Month, BurnDriver } from "@/lib/data";
import type { ProjectedMonth } from "@/lib/scenario";
import { eur, eurShort, monthLabel, monthShort, pct } from "@/lib/format";

const tooltipStyle = {
  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)",
};

// Small trend line inside a KPI card. No axes: it only shows direction.
export function Sparkline({ values, color = "var(--accent)" }: { values: (number | null)[]; color?: string }) {
  const rows = values.map((v, i) => ({ i, v }));
  return (
    <div style={{ height: 36 }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Cash curve: actual months as a solid line, scenario projection as a dashed line.
export function CashChart({ actuals, projection, selected, zeroMonth }: {
  actuals: Month[]; projection: ProjectedMonth[]; selected: string; zeroMonth: string | null;
}) {
  const last = actuals[actuals.length - 1];
  const rows = [
    ...actuals.map((m) => ({ month: m.month, actual: m.closing_cash, projection: null as number | null })),
    ...projection.map((p) => ({ month: p.month, actual: null as number | null, projection: p.cash })),
  ];
  // Start the dashed line at the last actual point so the two lines join.
  rows[actuals.length - 1].projection = last.closing_cash;
  const min = Math.min(0, ...projection.map((p) => p.cash));

  return (
    <div style={{ height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 22, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthShort} tick={{ fill: "var(--muted)", fontSize: 11 }}
                 interval="preserveStartEnd" minTickGap={28} stroke="var(--border)" />
          <YAxis tickFormatter={eurShort} tick={{ fill: "var(--muted)", fontSize: 11 }} width={58}
                 domain={[min, "auto"]} stroke="var(--border)" />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => monthLabel(String(l))}
                   formatter={(v, name) => [eur(Number(v)), name === "actual" ? "Actual cash" : "Projected cash"]} />
          <ReferenceLine y={0} stroke="var(--risk)" strokeDasharray="2 3"
                         label={{ value: "€0", position: "insideBottomLeft", fill: "var(--risk)", fontSize: 11 }} />
          <ReferenceLine x={last.month} stroke="var(--border)"
                         label={{ value: "Projection starts", position: "top", fill: "var(--muted)", fontSize: 11 }} />
          {selected !== last.month && <ReferenceLine x={selected} stroke="var(--neutral)" strokeDasharray="3 3" />}
          {zeroMonth && (
            <ReferenceLine x={zeroMonth} stroke="var(--risk)"
                           label={{ value: `Cash runs out ${monthLabel(zeroMonth)}`, position: "insideTopRight", fill: "var(--risk)", fontSize: 12 }} />
          )}
          <Line type="linear" dataKey="actual" stroke="var(--accent)" strokeWidth={2.2} dot={false} isAnimationActive={false} />
          <Line type="linear" dataKey="projection" stroke="var(--accent)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// MRR bridge as a waterfall. Each bar is a range [from, to]. The axis does not start at zero,
// otherwise the monthly movements (a few thousand euros) would be invisible next to ~€100k MRR.
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

  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 11 }} interval={0} stroke="var(--border)" />
          <YAxis domain={[lo, hi]} allowDataOverflow tickFormatter={eurShort} tick={{ fill: "var(--muted)", fontSize: 11 }} width={58} stroke="var(--border)" />
          <Tooltip contentStyle={tooltipStyle} formatter={(_v, _n, item) => [eur(item.payload.value), item.payload.full]} />
          <Bar dataKey="range" isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.name} fill={r.total ? "var(--neutral)" : r.value >= 0 ? "var(--accent)" : "var(--text)"} fillOpacity={r.total ? 0.55 : 0.9} />
            ))}
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
  return (
    <div className="bars">
      {list.map((r) => (
        <div className="bar-row" key={r.driver} title={`${eur(r.amount)} (${pct(r.amount / total, 0)})`}>
          <span>{r.driver.charAt(0).toUpperCase() + r.driver.slice(1)}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(r.amount / max) * 100}%` }} /></div>
          <span className="amt">{eurShort(r.amount)}</span>
        </div>
      ))}
      <div className="bar-row muted"><span>Total</span><span /><span className="amt">{eurShort(total)}</span></div>
    </div>
  );
}
