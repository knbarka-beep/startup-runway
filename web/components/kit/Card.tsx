// Card: white panel with a hairline border, 8 px radius and a very soft shadow (none in dark mode).
// CardHeader: serif section title on the left, optional small text or a control on the right.
export function Card({ className = "", children, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`min-w-0 rounded-card border border-border bg-surface p-5 shadow-card ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, aside }: { title: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="t-section">{title}</h2>
      {aside && <div className="t-small text-muted">{aside}</div>}
    </div>
  );
}
