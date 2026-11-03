// Number and date formatting for the UI: euros in European format, British month names.
// "de-DE" is used only because it gives the European separators: 1.234.567,89

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmt = (decimals: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

// "2026-09" -> "Sep 2026"
export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

// "2026-09" -> "Sep 26" (for chart axes)
export const monthShort = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;

// 1579630 -> "€1.579.630"
export const eur = (x: number) => `${x < 0 ? "-" : ""}€${fmt(0).format(Math.abs(x))}`;

// 1579630 -> "€1,58m", 110316 -> "€110k", 940 -> "€940"
export const eurShort = (x: number) => {
  const a = Math.abs(x);
  const sign = x < 0 ? "-" : "";
  if (a >= 1e6) return `${sign}€${fmt(2).format(a / 1e6)}m`;
  if (a >= 1e4) return `${sign}€${fmt(0).format(a / 1e3)}k`;
  if (a >= 1e3) return `${sign}€${fmt(1).format(a / 1e3)}k`;
  return `${sign}€${fmt(0).format(a)}`;
};

// 0.0377 -> "3,8 %"
export const pct = (x: number, decimals = 1) => `${fmt(decimals).format(x * 100)} %`;

// 14.32 -> "14,3"
export const dec = (x: number, decimals = 1) => fmt(decimals).format(x);
