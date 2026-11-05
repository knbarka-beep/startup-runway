"use client";
// Motion helpers. Charts animate once when the page loads (at most 400 ms); after that only the
// scenario projection moves, with a short 200 ms tween when a slider or preset changes it.
// All of it is off when the visitor prefers reduced motion.
import { useEffect, useRef, useState } from "react";

export const ANIMATION_MS = 400;
export const TWEEN_MS = 200;

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useAnimateOnce() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (reduced()) { setOn(false); return; }
    const t = setTimeout(() => setOn(false), ANIMATION_MS + 100);
    return () => clearTimeout(t);
  }, []);
  return on;
}

// true unless the visitor prefers reduced motion (false until the page has loaded).
export function useMotionOk() {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(!reduced()), []);
  return ok;
}

// A number that counts from its previous value to `target` in TWEEN_MS (ease-out). Jumps under reduced motion.
export function useTween(target: number) {
  const [value, setValue] = useState(target);
  const shown = useRef(target);
  useEffect(() => {
    const start = shown.current;
    if (start === target || reduced()) { shown.current = target; setValue(target); return; }
    const t0 = performance.now();
    let frame = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / TWEEN_MS);
      shown.current = k < 1 ? start + (target - start) * (1 - (1 - k) ** 3) : target;
      setValue(shown.current);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}
