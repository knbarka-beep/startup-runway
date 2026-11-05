"use client";
// A small (i) button that opens a popover with the explanation for a title, label or slider.
// Click or Enter/Space opens and closes it; Esc or a click elsewhere closes it, and Esc puts focus back
// on the button. On a phone the popover sits at the bottom of the screen, so it never runs off the side.
import { useEffect, useId, useRef, useState } from "react";

export function InfoTip({ label, children, align = "left" }: { label: string; children: React.ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); ref.current?.querySelector("button")?.focus(); }
    };
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", away);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", away); };
  }, [open]);
  return (
    <div ref={ref} className="info">
      <button type="button" className="info-btn" aria-expanded={open} aria-controls={id}
              aria-label={`About ${label}`} onClick={() => setOpen(!open)}>i</button>
      {open && <div id={id} role="note" className={`info-pop ${align}`}>{children}</div>}
    </div>
  );
}
