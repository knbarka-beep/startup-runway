// Tooltip card for Recharts, in the style of the shadcn chart examples: small card, hairline
// border, title on top, one row per series with a colour key and a tabular value.
export type TooltipRow = { name: string; value: string; color: string; dashed?: boolean };

export function ChartTooltip({ title, rows }: { title: string; rows: TooltipRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="min-w-[150px] rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-card">
      <div className="mb-1 font-semibold">{title}</div>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2">
          <span className="inline-block h-0 w-3 border-t-2" style={{ borderColor: r.color, borderTopStyle: r.dashed ? "dashed" : "solid" }} />
          <span className="text-muted">{r.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
