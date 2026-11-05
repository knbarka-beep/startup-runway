"use client";
// Small trend line with a faint area fill. No axes. Hovering (or dragging a finger along it) shows
// the month and the exact value just above the line, e.g. "Jul 2026: €1.785.615".
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";

export function Sparkline({ values, months, format, monthLabel, color = "var(--accent)", height = 40 }: {
  values: (number | null)[]; months: string[]; format: (v: number) => string;
  monthLabel: (m: string) => string; color?: string; height?: number;
}) {
  const rows = values.map((v, i) => ({ month: months[i], v }));
  return (
    // touch-action pan-y: a sideways finger drag moves the tooltip, an up/down drag still scrolls the page
    <div style={{ height, touchAction: "pan-y" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 4, right: 3, bottom: 2, left: 3 }} accessibilityLayer={false}>
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
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.08}
                dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: color }} isAnimationActive={false} connectNulls />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
