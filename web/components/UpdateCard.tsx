// Draft investor update for the selected month, in two columns (stacked below 1024 px):
//   Left, styled as an email: subject (not AI), TL;DR (AI), key metrics table (not AI, from
//   sql/09_update_metrics.sql), highlights, lowlights and ask (AI).
//   Right, "Behind the draft": each number in the draft with the fact it matched
//   (scripts/check_updates.py), and every attempt with its check result (data/ai/update_attempts.csv).
// Text in [square brackets] is a placeholder the AI left for the founder, shown highlighted.
import { attemptSummary, data, RETRY_SENTENCE, type NumberMatch, type UpdateMetrics } from "@/lib/data";
import { dec, eur, eurShort, monthLabel, pct } from "@/lib/format";
import { Card, CardHeader } from "./kit/Card";
import { InfoTip } from "./kit/InfoTip";

// "+€12k", "-€125k" or "no change"
const signed = (x: number | null, f: (v: number) => string) =>
  x === null ? "n/a" : x > 0 ? `+${f(x)}` : x < 0 ? f(x) : "no change";

function MetricsTable({ r }: { r: UpdateMetrics }) {
  const rows: [string, string, string][] = [
    ["Cash in bank", eurShort(r.cash), signed(r.cash_change, eurShort)],
    ["Net burn (month)", eurShort(r.net_burn), signed(r.net_burn_change, eurShort)],
    ["Runway at current burn", r.runway_months === null ? "n/a" : `${dec(r.runway_months)} months`,
      signed(r.runway_change, (v) => `${dec(v)} months`)],
    ["MRR", eur(r.mrr), signed(r.mrr_change, eur)],
    ["ARR growth vs 12 months ago", r.arr_growth_12m === null ? "n/a" : pct(r.arr_growth_12m),
      signed(r.arr_growth_change, (v) => `${dec(v * 100)} pts`)],
    ["Customers", String(r.customers), signed(r.customers_change, String)],
    ["Headcount", String(r.headcount), signed(r.headcount_change, String)],
  ];
  return (
    <table className="data-table metrics my-2">
      <thead><tr><th>Metric</th><th>{monthLabel(r.month)}</th><th>vs last month</th></tr></thead>
      <tbody>
        {rows.map(([label, value, change]) => (
          <tr key={label}><td>{label}</td><td>{value}</td><td className="text-muted">{change}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

// Show "[Founder: add reason]" placeholders highlighted.
function WithPlaceholders({ text }: { text: string }) {
  return <>{text.split(/(\[[^\]]*\])/).map((part, i) =>
    part.startsWith("[") ? <mark key={i} className="ph">{part}</mark> : part)}</>;
}

const lines = (s: string | null) => (s ?? "").split("\n").filter((x) => x.trim());

// The value of the fact a number matched, in the same style as the rest of the page.
function factValue(n: NumberMatch) {
  if (n.metric.endsWith("(%)")) return `${dec(n.value)} %`;
  if (n.metric.includes("(months)") || n.metric.startsWith("Burn multiple")) return dec(n.value);
  if (/^(Headcount|New customers|Churned customers|Active customers)/.test(n.metric)) return String(n.value);
  return eur(Math.round(n.value));
}

// "Net burn previous month, Aug 2026", or for an average over several months, whose label
// already names the length: "Professional fees, average of previous 12 months (to Aug 2026)".
const source = (n: NumberMatch) =>
  n.period_months === 1 ? `${n.metric}, ${monthLabel(n.period_end)}` : `${n.metric} (to ${monthLabel(n.period_end)})`;

export default function UpdateCard({ month }: { month: string }) {
  const update = data.updates.find((u) => u.month === month);
  const check = data.update_checks.find((c) => c.month === month);
  const metrics = data.update_metrics.find((r) => r.month === month);
  const numbers = data.update_number_matches.filter((n) => n.month === month);
  const unmatched = (check?.unmatched_numbers ?? "").split("; ").filter(Boolean);
  const attempts = data.update_attempts.filter((a) => a.month === month);
  const checks = data.update_checks;
  const sum = attemptSummary();

  return (
    <Card className="update">
      <CardHeader eyebrow="AI draft, checked against the data" title={`Draft investor update, ${monthLabel(month)}`}
                  infoLabel="the investor update"
                  info={checks.length > 0 && (
                    <p>
                      TL;DR, highlights, lowlights and ask were drafted by {data.updates[0]?.model} (prompt{" "}
                      {data.updates[0]?.prompt_version}) from that month&apos;s numbers only; the subject and the table come
                      straight from the data. Highlighted text in [brackets] marks a reason only the founder knows.{" "}
                      {RETRY_SENTENCE} A script without AI checks numbers, causes, structure and a few style rules, not
                      writing quality: {sum.firstPass} of {sum.months} drafts passed on the first attempt, {sum.finalPass} of{" "}
                      {checks.length} after retries; {sum.retried.length} months needed a retry. In the kept drafts{" "}
                      {sum.numbersMatched} of {sum.numbersFound} numbers match the data.
                    </p>
                  )}
                  aside={check && <span className={`badge ${check.passed ? "positive" : "negative"}`}>{check.passed ? "Check passed" : "Check flagged"}</span>} />

      {data.updates.length === 0 ? (
        <p className="text-muted">AI drafts were not generated in this build (no API key was set). The prompts are saved in data/ai/prompts/ and can be run later.</p>
      ) : !update || !metrics ? (
        <p className="text-muted">AI drafts cover Oct 2025 to Sep 2026. Pick one of those months to read one.</p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8">
          <article className="overflow-hidden rounded-card border border-border" aria-label="Draft email">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-b border-border bg-surface-2 px-5 py-3 text-sm">
              <dt className="text-muted">To</dt><dd>Investors</dd>
              <dt className="text-muted">Subject</dt><dd className="font-semibold">Nordlys Analytics: {monthLabel(month)} update</dd>
            </dl>
            <div className="prose max-w-[65ch] px-5 pt-4 pb-2 leading-relaxed">
              <p><strong>TL;DR:</strong> <WithPlaceholders text={update.tldr} /></p>
              <h3 className="mt-4 mb-1 font-semibold">Key metrics <span className="badge ml-1">From the data, not AI</span></h3>
              <MetricsTable r={metrics} />
              <h3 className="mt-4 mb-1 font-semibold">Highlights</h3>
              <ul>{lines(update.highlights).map((t, i) => <li key={i}><WithPlaceholders text={t} /></li>)}</ul>
              <h3 className="mt-4 mb-1 font-semibold">Lowlights</h3>
              {lines(update.lowlights).length ? (
                <ul>{lines(update.lowlights).map((t, i) => <li key={i}><WithPlaceholders text={t} /></li>)}</ul>
              ) : <p className="text-muted">none</p>}
              <h3 className="mt-4 mb-1 font-semibold">Ask</h3>
              <p><WithPlaceholders text={update.ask} /></p>
            </div>
          </article>

          {/* Sticky on desktop, so this column stays in view while the email is read. */}
          <aside aria-label="Behind the draft" className="lg:sticky lg:top-16">
            <h3 className="t-label mb-3">Behind the draft</h3>

            <div className="mb-1 flex items-center gap-1.5">
              <h4 className="text-sm font-semibold">Numbers in the draft</h4>
              <InfoTip label="numbers in the draft" align="right">
                <p>Each number must match a value in this month&apos;s fact sheet, within the rounding the text uses.
                  If a number fits more than one value, the closest is shown.</p>
              </InfoTip>
            </div>
            {check && <p className="mb-2 text-xs text-muted">{check.numbers_matched} of {check.numbers_found} match the data.</p>}
            <div className="table-scroll">
              <table className="data-table text-[0.82rem]">
                <thead><tr><th>In the draft</th><th>Matched value in the data</th><th><span className="sr-only">Result</span></th></tr></thead>
                <tbody>
                  {numbers.map((n, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap font-semibold">{n.number}</td>
                      <td>{source(n)}: {factValue(n)}</td>
                      <td className="font-bold text-positive" aria-label="matched">✓</td>
                    </tr>
                  ))}
                  {unmatched.map((u) => (
                    <tr key={u}>
                      <td className="whitespace-nowrap font-semibold">{u}</td>
                      <td>no value in the data</td>
                      <td className="font-bold text-negative" aria-label="not matched">✗</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="check mt-4 border-t border-border pt-3 text-sm">
              <h4 className="mb-1 font-semibold">Attempts</h4>
              <ol className="mb-2 list-decimal pl-5">
                {attempts.map((a) => (
                  <li key={a.attempt}>
                    Attempt {a.attempt}: <span className={`font-semibold ${a.passed ? "text-positive" : "text-negative"}`}>{a.passed ? "passed" : "failed"}</span>
                    {a.checks_failed ? ` (${a.checks_failed})` : ""}
                    {a.attempt === update.attempt && <span className="badge ml-1.5">kept</span>}
                  </li>
                ))}
              </ol>
              {check && (
                <p className="text-xs">
                  Kept attempt {update.attempt} of at most 3. {check.words} words (max 110).{" "}
                  {check.placeholders} placeholder{check.placeholders === 1 ? "" : "s"} for the founder.
                  {check.unsupported_causes ? ` Cause without support in the data: ${check.unsupported_causes}.` : ""}
                  {check.problems ? ` Other problems: ${check.problems}.` : ""}
                </p>
              )}
            </div>
          </aside>
        </div>
      )}

      {checks.length > 0 && (
        <p className="mt-5 text-xs text-muted">
          A draft for the founder to finish, not a finished email. <a href="method/">How this works</a>
        </p>
      )}
    </Card>
  );
}
