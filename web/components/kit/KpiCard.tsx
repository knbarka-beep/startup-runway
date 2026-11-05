// One KPI: small uppercase label, big tabular number, change vs last month and a sparkline.
// `good` colours the change: true green, false red, null grey (no previous month or no change).
import { Card } from "./Card";

export type Change = { text: string; up: boolean; good: boolean | null };

export function KpiCard({ label, value, valueClass = "", change, sub, children }: {
  label: string; value: string; valueClass?: string; change?: Change | null; sub?: React.ReactNode; children?: React.ReactNode;
}) {
  const colour = change?.good === true ? "text-positive" : change?.good === false ? "text-negative" : "text-muted";
  return (
    <Card className="kpi flex flex-col gap-1 !p-4">
      <div className="t-label">{label}</div>
      <div className={`t-kpi ${valueClass}`}>{value}</div>
      <div className="t-small min-h-[1.4em]">
        {change && (
          <span className={`font-medium ${colour}`}>
            <span aria-hidden="true">{change.up ? "↑" : "↓"}</span> {change.text}
          </span>
        )}
        {change && <span className="text-muted"> vs last month</span>}
      </div>
      {sub && <div className="t-small min-h-[2.8em] text-muted">{sub}</div>}
      <div className="mt-auto">{children}</div>
    </Card>
  );
}
