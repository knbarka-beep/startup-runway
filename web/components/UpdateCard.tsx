// Draft investor update for the selected month, in two columns (stacked below 1024 px):
//   Left, styled as an email: subject (not AI), TL;DR (AI), key metrics table (not AI, from
//   sql/09_update_metrics.sql), highlights, lowlights and ask (AI).
//   Right, "Behind the draft": each number in the draft with the fact it matched
//   (scripts/check_updates.py), and every attempt with its check result (data/ai/update_attempts.csv).
// Text in [square brackets] is a placeholder the AI left for the founder, shown highlighted.
import { attemptSummary, data, RETRY_SENTENCE, type NumberMatch, type UpdateMetrics } from "@/lib/data";
import { dec, eur, eurShort, monthLabel, pct } from "@/lib/format";

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
    <table className="metrics">
      <thead><tr><th>Metric</th><th>{monthLabel(r.month)}</th><th>vs last month</th></tr></thead>
      <tbody>
        {rows.map(([label, value, change]) => (
          <tr key={label}><td>{label}</td><td>{value}</td><td className="muted">{change}</td></tr>
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
    <section className="card update">
      <div className="card-head">
        <h2>Draft investor update, {monthLabel(month)}</h2>
        {check && <span className={`pill ${check.passed ? "pass" : "fail"}`}>{check.passed ? "Check passed" : "Check flagged"}</span>}
      </div>

      {data.updates.length === 0 ? (
        <p className="muted">AI drafts were not generated in this build (no API key was set). The prompts are saved in data/ai/prompts/ and can be run later.</p>
      ) : !update || !metrics ? (
        <p className="muted">AI drafts cover Oct 2025 to Sep 2026. Pick one of those months to read one.</p>
      ) : (
        <div className="update-cols">
          <article className="email" aria-label="Draft email">
            <p className="subject"><span className="muted">Subject:</span> Nordlys Analytics: {monthLabel(month)} update</p>
            <div className="email-body">
              <p><strong>TL;DR:</strong> <WithPlaceholders text={update.tldr} /></p>
              <h3>Key metrics <span className="tag">From the data, not AI</span></h3>
              <MetricsTable r={metrics} />
              <h3>Highlights</h3>
              <ul>{lines(update.highlights).map((t, i) => <li key={i}><WithPlaceholders text={t} /></li>)}</ul>
              <h3>Lowlights</h3>
              {lines(update.lowlights).length ? (
                <ul>{lines(update.lowlights).map((t, i) => <li key={i}><WithPlaceholders text={t} /></li>)}</ul>
              ) : <p className="muted">none</p>}
              <h3>Ask</h3>
              <p><WithPlaceholders text={update.ask} /></p>
            </div>
          </article>

          <aside className="behind" aria-label="Behind the draft">
            <h3 className="behind-title">Behind the draft</h3>

            <h4>Numbers in the draft</h4>
            {check && (
              <p className="small muted">
                {check.numbers_matched} of {check.numbers_found} match a value in this month&apos;s fact sheet,
                within the rounding the text uses. If a number fits more than one value, the closest is shown.
              </p>
            )}
            <div className="table-scroll">
              <table className="numbers">
                <thead><tr><th>In the draft</th><th>Matched value in the data</th><th><span className="sr-only">Result</span></th></tr></thead>
                <tbody>
                  {numbers.map((n, i) => (
                    <tr key={i}>
                      <td className="num">{n.number}</td>
                      <td>{source(n)}: {factValue(n)}</td>
                      <td className="tick" aria-label="matched">✓</td>
                    </tr>
                  ))}
                  {unmatched.map((u) => (
                    <tr key={u}>
                      <td className="num">{u}</td>
                      <td>no value in the data</td>
                      <td className="cross" aria-label="not matched">✗</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="check">
              <h4>Attempts</h4>
              <ol className="attempts">
                {attempts.map((a) => (
                  <li key={a.attempt}>
                    Attempt {a.attempt}: <span className={a.passed ? "ok" : "risk"}>{a.passed ? "passed" : "failed"}</span>
                    {a.checks_failed ? ` (${a.checks_failed})` : ""}
                    {a.attempt === update.attempt && <span className="tag">kept</span>}
                  </li>
                ))}
              </ol>
              {check && (
                <p className="small">
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
        <p className="muted small footnote">
          A draft for the founder to finish, not a finished email. TL;DR, highlights, lowlights and ask were drafted by{" "}
          {data.updates[0]?.model} (prompt {data.updates[0]?.prompt_version}) from that month&apos;s numbers only; the
          subject and the table come straight from the data. Highlighted text in [brackets] marks a reason only the
          founder knows. {RETRY_SENTENCE} A script without AI checks numbers, causes, structure and a few style rules,
          not writing quality: {sum.firstPass} of {sum.months} drafts passed on the first attempt,{" "}
          {sum.finalPass} of {checks.length} after retries; {sum.retried.length} months needed a retry. In the kept
          drafts {sum.numbersMatched} of {sum.numbersFound} numbers match the data. <a href="method/">How this works</a>
        </p>
      )}
    </section>
  );
}
