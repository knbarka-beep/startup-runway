"use client";
// Small trend line inside a KPI card. No axes. Hovering (or dragging a finger along it) shows
// the month and the exact value just above the line, e.g. "Jul 2026: €1.785.615".
import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";

export function Sparkline({ values, months, format, monthLabel, color = "var(--accent)" }: {
  values: (number | null)[]; months: string[]; format: (v: number) => string;
  monthLabel: (m: string) => string; color?: string;
}) {
  const rows = values.map((v, i) => ({ month: months[i], v }));
  return (
    // touch-action pan-y: a sideways finger drag moves the tooltip, an up/down drag still scrolls the page
    <div style={{ height: 36, touchAction: "pan-y" }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 4, right: 3, bottom: 4, left: 3 }}>
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: "var(--border-strong)" }}
            position={{ y: -26 }}
            allowEscapeViewBox={{ x: false, y: true }}
            wrapperStyle={{ zIndex: 5, pointerEvents: "none" }}
            content={({ active, payload }) => {
              const p = payload?.[0];
              if (!active || !p || p.value == null) return null;
              return (
                <div className="whitespace-nowrap rounded border border-border bg-surface px-1.5 py-px text-xs shadow-card">
                  {monthLabel(p.payload.month)}: {format(Number(p.value))}
                </div>
              );
            }}
          />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false}
                activeDot={{ r: 3, strokeWidth: 0, fill: color }} isAnimationActive={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
