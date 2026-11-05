// A row of mutually exclusive options. The active one is filled and has aria-pressed="true".
// `value` may match none of the options (e.g. after a slider move), then nothing is highlighted.
export function SegmentedControl({ options, value, onChange, label, className = "" }: {
  options: readonly string[]; value: string | null; onChange: (v: string) => void; label: string; className?: string;
}) {
  return (
    <div className={`segmented ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" className={value === o ? "active" : ""} aria-pressed={value === o} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}
