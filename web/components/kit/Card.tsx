// Card: white panel with a hairline border, 8 px radius (12 px with `large`) and a very soft shadow (none in dark mode).
// CardHeader: optional small uppercase eyebrow above a serif title, an optional (i) next to the title,
// and optional small text or a control on the right.
import { InfoTip } from "./InfoTip";

export function Card({ className = "", large = false, children, ...rest }: React.HTMLAttributes<HTMLElement> & { large?: boolean }) {
  return (
    <section className={`min-w-0 border border-border bg-surface p-5 shadow-card ${large ? "rounded-card-lg lg:p-6" : "rounded-card"} ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ eyebrow, title, info, infoLabel, aside }: {
  eyebrow?: string; title: React.ReactNode; info?: React.ReactNode; infoLabel?: string; aside?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div>
        {eyebrow && <div className="t-label mb-0.5">{eyebrow}</div>}
        <div className="flex items-center gap-2">
          <h2 className="t-section">{title}</h2>
          {info && <InfoTip label={infoLabel ?? (typeof title === "string" ? title : "this card")}>{info}</InfoTip>}
        </div>
      </div>
      {aside && <div className="t-small text-muted">{aside}</div>}
    </div>
  );
}
