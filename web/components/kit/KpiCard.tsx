// One compact stat for the hero row: small uppercase label with an optional (i), big tabular number,
// a change pill vs last month and a sparkline. No card around it: it sits on the page background.
// `good` colours the pill: true green, false red, null grey (no change).
import { InfoTip } from "./InfoTip";

export type Change = { text: string; up: boolean; good: boolean | null; vs: string };

export function DeltaPill({ change }: { change: Change }) {
  const tone = change.good === true ? "good" : change.good === false ? "bad" : "";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`delta ${tone}`}><span aria-hidden="true">{change.up ? "↑" : "↓"}</span> {change.text}</span>
      <span className="text-xs text-muted">vs {change.vs}</span>
    </span>
  );
}

export function KpiCard({ label, info, value, valueClass = "", change, children }: {
  label: string; info?: React.ReactNode; value: string; valueClass?: string; change?: Change | null; children?: React.ReactNode;
}) {
  return (
    // On a phone the sparkline sits to the right of the number, so the three stats stay short.
    <div className="kpi grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,9rem)] items-end gap-x-4 sm:block">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="t-label">{label}</span>
          {info && <InfoTip label={label}>{info}</InfoTip>}
        </div>
        <div className={`t-kpi mt-1 ${valueClass}`}>{value}</div>
        <div className="mt-1 min-h-[1.25rem]">{change && <DeltaPill change={change} />}</div>
      </div>
      <div className="sm:mt-2">{children}</div>
    </div>
  );
}
