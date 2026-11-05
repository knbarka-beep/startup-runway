// Calm page header: serif title (with an optional muted suffix such as "(fictional)"),
// one line of subtitle, and controls on the right (they wrap below on a phone).
export function PageHeader({ title, suffix, subtitle, children }: {
  title: string; suffix?: string; subtitle?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border pb-4">
      <div>
        <h1 className="t-page">{title}{suffix && <span className="font-normal text-muted"> {suffix}</span>}</h1>
        {subtitle && <p className="t-small mt-1 text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}
