// Thin sticky bar at the top: the company name small on the left (the hero below carries the message),
// controls on the right. On a phone the name wraps instead of pushing the controls off screen.
export function PageHeader({ title, suffix, children }: { title: string; suffix?: string; children?: React.ReactNode }) {
  return (
    <header className="site-header sticky top-0 z-20 border-b border-border bg-bg">
      <div className="mx-auto flex min-h-12 max-w-[1200px] items-center justify-between gap-3 px-4 py-1.5">
        <h1 className="font-serif text-[0.95rem] leading-tight font-semibold">
          {title}{suffix && <span className="font-normal text-muted"> {suffix}</span>}
        </h1>
        {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
      </div>
    </header>
  );
}
