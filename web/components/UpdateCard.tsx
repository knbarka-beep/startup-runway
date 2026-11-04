// Draft investor update for the selected month, in five parts:
//   1. Subject (not AI)   2. TL;DR (AI)   3. Key metrics table (not AI, from sql/09_update_metrics.sql)
//   4. Highlights and lowlights (AI)   5. Ask (AI)
// then the result of the automatic check. Text in [square brackets] is a placeholder
// the AI left for the founder, shown highlighted.
import { data, type UpdateMetrics } from "@/lib/data";
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
      <thead><tr><th>Key metrics</th><th>{monthLabel(r.month)}</th><th>vs last month</th></tr></thead>
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

export default function UpdateCard({ month }: { month: string }) {
  const update = data.updates.find((u) => u.month === month);
  const check = data.update_checks.find((c) => c.month === month);
  const metrics = data.update_metrics.find((r) => r.month === month);
  const checks = data.update_checks;
  const nPass = checks.filter((c) => c.passed).length;
  const numFound = checks.reduce((a, c) => a + c.numbers_found, 0);
  const numOk = checks.reduce((a, c) => a + c.numbers_matched, 0);

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
        <div className="update-body">
          <p className="subject"><span className="muted">Subject:</span> Nordlys Analytics: {monthLabel(month)} update</p>
          <p><strong>TL;DR:</strong> <WithPlaceholders text={update.tldr} /></p>
          <MetricsTable r={metrics} />
          <h3>Highlights</h3>
          <ul>{lines(update.highlights).map((t, i) => <li key={i}><WithPlaceholders text={t} /></li>)}</ul>
          <h3>Lowlights</h3>
          {lines(update.lowlights).length ? (
            <ul>{lines(update.lowlights).map((t, i) => <li key={i}><WithPlaceholders text={t} /></li>)}</ul>
          ) : <p className="muted">none</p>}
          <h3>Ask</h3>
          <p><WithPlaceholders text={update.ask} /></p>

          {check && (
            <div className="check">
              <strong>Check:</strong> {check.numbers_matched} of {check.numbers_found} numbers match this month&apos;s data
              {check.unmatched_numbers ? ` (not matched: ${check.unmatched_numbers})` : ""}. {check.words} words
              (max 110). {check.placeholders} placeholder{check.placeholders === 1 ? "" : "s"} for the founder.
              {check.unsupported_causes ? ` Cause without support in the data: ${check.unsupported_causes}.` : ""}
              {check.problems ? ` Other problems: ${check.problems}.` : ""}
            </div>
          )}
        </div>
      )}

      {checks.length > 0 && (
        <p className="muted small" style={{ marginBottom: 0 }}>
          A draft for the founder to finish, not a finished email. TL;DR, highlights, lowlights and ask were drafted by{" "}
          {data.updates[0]?.model} (prompt {data.updates[0]?.prompt_version}) from that month&apos;s numbers only; the
          subject and the table come straight from the data. Highlighted text in [brackets] marks a reason only the
          founder knows. A script without AI checked every draft: {nPass} of {checks.length} pass all checks,{" "}
          {numOk} of {numFound} numbers match the data. It checks numbers, causes, structure and a few style rules, not
          writing quality. <a href="method/">How this works</a>
        </p>
      )}
    </section>
  );
}
