"use client";
// Charts animate once when the page loads (at most 400 ms) and then never again, so slider
// moves and month changes redraw instantly. Off entirely when the visitor prefers reduced motion.
import { useEffect, useState } from "react";

export const ANIMATION_MS = 400;

export function useAnimateOnce() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setOn(false); return; }
    const t = setTimeout(() => setOn(false), ANIMATION_MS + 100);
    return () => clearTimeout(t);
  }, []);
  return on;
}
