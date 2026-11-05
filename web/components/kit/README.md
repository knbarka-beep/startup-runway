# Portfolio kit

Shared look for the three portfolio dashboards (P1 variance cockpit, P2 startup runway, P3 AML queue).

## Files

- `web/styles/tokens.css`: colours, fonts, radius and shadow as CSS variables, light and dark, mapped into Tailwind's theme (`bg-surface`, `text-muted`, `text-accent`, `border-border` and so on).
- `web/styles/kit.css`: type scale (`t-hero`, `t-page`, `t-section`, `t-label`, `t-kpi`, `t-small`), buttons (`btn`), select, range slider, segmented control, badge, change pill (`delta`), (i) popover (`info`), result pill, collapsible `details.assumptions`, focus ring, reduced motion.
- `web/components/kit/`: `Card` (`large` for the 12 px hero chart card; `CardHeader` with eyebrow, serif title and optional (i)), `InfoTip` (the (i) popover: keyboard, Esc, bottom sheet on a phone), `KpiCard` (compact stat) and `DeltaPill`, `Sparkline` (line with a faint area), `ChartTooltip`, `SegmentedControl`, `ThemeToggle`, `PageHeader` (thin sticky bar), `useAnimateOnce` (also `useTween` and `useMotionOk`).

## Copy into another repo

1. Install Tailwind 4 in `web/`: `npm install -D --save-exact tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3` (Recharts is needed for `Sparkline`).
2. Copy `web/postcss.config.mjs`, `web/styles/` and `web/components/kit/`.
3. Start `app/globals.css` with:
   ```css
   @import "tailwindcss";
   @import "../styles/tokens.css";
   @import "../styles/kit.css";
   @custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
   ```
4. In `app/layout.tsx`, load the fonts with `next/font/google` as variables `--font-source-serif` (Source Serif 4) and `--font-plex-sans` (IBM Plex Sans), put both on `<html>`, and copy the inline theme script that sets `data-theme` before the first paint.

## Project accent

Only `--accent`, `--accent-soft` and `--on-accent` change per project, in both the light and the dark block of `tokens.css`:

| Project | Light `--accent` | Dark `--accent` |
|---|---|---|
| P1 Variance cockpit (petrol) | around #1F5F6B | lighter, check contrast |
| P2 Startup runway (deep ink blue) | #2A5788 | #7FA6D6 |
| P3 AML queue (deep olive) | around #5E6B2A | lighter, check contrast |

Check the new accent for 4,5:1 against `--bg` and `--surface` (text) and 3:1 for chart lines, in both themes, and that it is clearly different from `--positive` (green) and `--negative` (red).
