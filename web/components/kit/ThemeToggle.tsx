"use client";
// Light/dark switch. The choice is kept in localStorage("theme") and set on <html data-theme>.
// The inline script in app/layout.tsx applies it before the first paint, so there is no flash.
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState("light");
  useEffect(() => setTheme(document.documentElement.dataset.theme || "light"), []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
    setTheme(next);
  }
  return (
    <button type="button" className="btn" onClick={toggle} aria-label="Toggle light and dark theme">
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
