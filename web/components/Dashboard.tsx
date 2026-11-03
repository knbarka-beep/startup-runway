"use client";
// The main (and only) dashboard view. Holds two pieces of state:
//   1. the selected month (KPIs, MRR bridge, burn drivers and update follow it)
//   2. the slider settings (only the dashed projection line follows them)
import { useEffect, useMemo, useState } from "react";
import { data } from "@/lib/data";
import { defaultSettings, project, zeroCashMonth, MONTHS_AHEAD, type Settings } from "@/lib/scenario";
import { dec, eur, eurShort, monthLabel, pct } from "@/lib/format";
import { BurnDrivers, CashChart, MrrBridge, Sparkline } from "./charts";

const months = data.monthly;
const base = data.scenario_base;

export default function Dashboard() {
  const [idx, setIdx] = useState(months.length - 1);
  const [s, setS] = useState<Settings>(defaultSettings(base));
  const [theme, setTheme] = useState("light");
  useEffect(() => setTheme(document.documentElement.dataset.theme || "light"), []);

  const m = months[idx];
  const upTo = months.slice(0, idx + 1);
  const projection = useMemo(() => project(base, s), [s]);
  const zero = zeroCashMonth(projection);
  const lowest = projection.reduce((a, b) => (b.cash < a.cash ? b : a));

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
    setTheme(next);
  }

  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setS({ ...s, [k]: Number(e.target.value) });

  const update = data.updates.find((u) => u.month === m.month);
  const check = data.update_checks.find((c) => c.month === m.month);
  const nPass = data.update_checks.filter((c) => c.passed).length;
  const numFound = data.update_checks.reduce((a, c) => a + c.numbers_found, 0);
  const numOk = data.update_checks.reduce((a, c) => a + c.numbers_matched, 0);
  const runwayRisk = m.runway_months !== null && m.runway_months < 12;
  const drivers = data.burn_drivers.filter((d) => d.month === m.month);

  return (
    <main className="wrap">
      <header className="header">
        <div>
          <h1>Nordlys Analytics ApS <span className="muted">(fictional)</span></h1>
          <div className="muted small">Cash, burn and runway. All company data on this page is synthetic.</div>
        </div>
        <div className="controls">
          <label className="small muted" htmlFor="month">Month</label>
          <select id="month" value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
            {months.map((x, i) => <option key={x.month} value={i}>{monthLabel(x.month)}</option>)}
          </select>
          <button onClick={toggleTheme} aria-label="Toggle light and dark theme">
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </header>

      <p className="banner">
        {m.runway_months !== null && m.avg_net_burn_3m !== null ? (
          <>
            <strong>{monthLabel(m.month)}:</strong> {eurShort(m.closing_cash)} in the bank. Net burn averaged{" "}
            {eurShort(m.avg_net_burn_3m)} a month over the last 3 months, so cash lasts{" "}
            <strong>{dec(m.runway_months)} months</strong> at that pace (until {monthLabel(m.zero_cash_month!)}).
          </>
        ) : (
          <><strong>{monthLabel(m.month)}:</strong> {eurShort(m.closing_cash)} in the bank. Runway needs 3 months of history, so it starts in Dec 2024.</>
        )}
      </p>

      <section className="kpis">
        <div className="card kpi">
          <div className="label">Cash in bank</div>
          <div className="value">{eurShort(m.closing_cash)}</div>
          <div className="sub">End of {monthLabel(m.month)}{m.funding > 0 ? `, incl. ${eurShort(m.funding)} seed round` : ""}</div>
          <Sparkline values={upTo.map((x) => x.closing_cash)} />
        </div>
        <div className="card kpi">
          <div className="label">Net burn (monthly)</div>
          <div className="value">{eurShort(m.net_burn)}</div>
          <div className="sub">
            {m.avg_net_burn_3m !== null ? `3-month average ${eurShort(m.avg_net_burn_3m)}. ` : ""}Payments minus collections
          </div>
          <Sparkline values={upTo.map((x) => x.net_burn)} />
        </div>
        <div className="card kpi">
          <div className="label">Runway</div>
          <div className={`value ${runwayRisk ? "risk" : ""}`}>
            {m.runway_months !== null ? `${dec(m.runway_months)} months` : "n/a"}
          </div>
          <div className="sub">
            {m.zero_cash_month ? `Cash runs out ${monthLabel(m.zero_cash_month)} at the trailing 3-month average net burn` : "Needs 3 months of history"}
          </div>
          <Sparkline values={upTo.map((x) => x.runway_months)} color={runwayRisk ? "var(--risk)" : "var(--accent)"} />
        </div>
        <div className="card kpi">
          <div className="label">ARR</div>
          <div className="value">{eurShort(m.arr)}</div>
          <div className="sub">
            {m.arr_growth_12m !== null ? `${m.arr_growth_12m >= 0 ? "+" : ""}${pct(m.arr_growth_12m)} vs 12 months ago` : "Growth shown from Oct 2025 (needs 12 months)"}
          </div>
          <Sparkline values={upTo.map((x) => x.arr)} />
        </div>
      </section>

      <section className="main">
        <div className="card">
          <div className="card-head">
            <h2>Cash in bank: actual and scenario</h2>
            <span className="muted small">Solid: actual. Dashed: projection from the sliders.</span>
          </div>
          <CashChart actuals={months} projection={projection} selected={m.month} zeroMonth={zero} />
          <p className="muted small" style={{ margin: "8px 0 0" }}>
            The projection is a set of assumptions you can change, not a forecast. It assumes customers pay in the
            month revenue is earned and costs stay flat apart from the sliders. The runway KPI above uses a different,
            simpler method (cash divided by the trailing 3-month average net burn), so the two dates can differ.
          </p>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Scenario from {monthLabel(base.start_month)}</h2>
            <button onClick={() => setS(defaultSettings(base))}>Reset</button>
          </div>

          <div className="slider">
            <label htmlFor="hires"><span>Planned hires, next 12 months</span><strong>{s.hires}</strong></label>
            <input id="hires" type="range" min={0} max={15} step={1} value={s.hires} onChange={set("hires")} />
            <div className="hint">{eur(base.cost_per_hire)} loaded cost per hire per month, spread evenly over 12 months</div>
          </div>

          <div className="slider">
            <label htmlFor="growth"><span>New and expansion MRR, % of MRR per month</span><strong>{pct(s.growthRate, 2)}</strong></label>
            <input id="growth" type="range" min={base.default_growth_rate * 0.5} max={base.default_growth_rate * 1.5}
                   step={0.0005} value={s.growthRate} onChange={set("growthRate")} />
            <div className="hint">12-month trend: {pct(base.default_growth_rate, 2)}</div>
          </div>

          <div className="slider">
            <label htmlFor="churn"><span>Churn and contraction, % of MRR per month</span><strong>{pct(s.churnRate, 2)}</strong></label>
            <input id="churn" type="range" min={0} max={0.04} step={0.0005} value={s.churnRate} onChange={set("churnRate")} />
            <div className="hint">12-month trend: {pct(base.default_churn_rate, 2)}</div>
          </div>

          <div className="slider">
            <label htmlFor="opex"><span>Other costs (non-payroll)</span><strong>{s.opexChange > 0 ? "+" : ""}{pct(s.opexChange, 0)}</strong></label>
            <input id="opex" type="range" min={-0.3} max={0.3} step={0.01} value={s.opexChange} onChange={set("opexChange")} />
            <div className="hint">Base: {eur(base.monthly_opex)} a month (last 3 months average)</div>
          </div>

          <div className="slider">
            <label htmlFor="funding"><span>New funding (optional)</span><strong>{s.fundingAmount ? eurShort(s.fundingAmount) : "none"}</strong></label>
            <input id="funding" type="range" min={0} max={3_000_000} step={250_000} value={s.fundingAmount} onChange={set("fundingAmount")} />
            {s.fundingAmount > 0 && (
              <label className="hint" htmlFor="fmonth" style={{ marginTop: 4 }}>
                <span>Arrives in</span>
                <select id="fmonth" value={s.fundingMonth} onChange={set("fundingMonth")}>
                  {projection.map((p, i) => <option key={p.month} value={i + 1}>{monthLabel(p.month)}</option>)}
                </select>
              </label>
            )}
          </div>

          <div className="result">
            {zero ? (
              <span className="risk"><strong>Cash runs out in {monthLabel(zero)}</strong> in this scenario.</span>
            ) : (
              <span>Cash stays above zero for all {MONTHS_AHEAD} projected months. Lowest point:{" "}
                <strong>{eurShort(lowest.cash)}</strong> in {monthLabel(lowest.month)}.</span>
            )}
          </div>
        </div>
      </section>

      <section className="row2">
        <div className="card">
          <div className="card-head">
            <h2>MRR bridge, {monthLabel(m.month)}</h2>
            <span className="muted small">Axis does not start at zero</span>
          </div>
          <MrrBridge m={m} />
          <p className="muted small" style={{ margin: "6px 0 0" }}>
            {m.new_customers} new and {m.churned_customers} churned customers, {m.active_customers} active.
            {m.nrr_12m !== null ? ` Net revenue retention (12 months): ${pct(m.nrr_12m)}.` : ""}
            {m.burn_multiple !== null ? ` Burn multiple (3 months): ${dec(m.burn_multiple)}.` : m.burn_multiple_note ? ` Burn multiple: ${m.burn_multiple_note.toLowerCase()}.` : ""}
          </p>
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Where the money goes, {monthLabel(m.month)}</h2>
          </div>
          <h3 className="small muted" style={{ margin: "0 0 6px" }}>Payroll by team (loaded cost)</h3>
          <BurnDrivers rows={drivers} type="team" />
          <h3 className="small muted" style={{ margin: "14px 0 6px" }}>Other costs by category</h3>
          <BurnDrivers rows={drivers} type="category" />
          <p className="muted small" style={{ margin: "10px 0 0" }}>
            Payments {eur(m.payments)} minus collections {eur(m.collections)} = net burn {eur(m.net_burn)}.
          </p>
        </div>
      </section>

      <section className="card update">
        <div className="card-head">
          <h2>Draft investor update, {monthLabel(m.month)}</h2>
          {check && <span className={`pill ${check.passed ? "pass" : "fail"}`}>{check.passed ? "Number check passed" : "Number check flagged"}</span>}
        </div>
        {data.updates.length === 0 ? (
          <p className="muted">AI drafts were not generated in this build (no API key was set). The prompts are saved in data/ai/prompts/ and can be run later.</p>
        ) : update ? (
          <>
            {update.text.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}
            {check && (
              <p className="muted small">
                {check.numbers_matched} of {check.numbers_found} numbers match the data for this month
                {check.unmatched_numbers ? ` (not matched: ${check.unmatched_numbers})` : ""}.
                {check.unsupported_causes ? ` Cause without support in the data: ${check.unsupported_causes}.` : ""}
                {" "}{check.words} words.
              </p>
            )}
          </>
        ) : (
          <p className="muted">AI drafts cover Oct 2025 to Sep 2026. Pick one of those months to read one.</p>
        )}
        {data.update_checks.length > 0 && (
          <p className="muted small" style={{ marginBottom: 0 }}>
            Drafted by {data.updates[0]?.model} from that month&apos;s numbers only, then checked by a script without AI:{" "}
            {nPass} of {data.update_checks.length} drafts pass, {numOk} of {numFound} numbers match the data. The check
            covers numbers and named causes, not writing quality. <a href="method/">How this works</a>
          </p>
        )}
      </section>
    </main>
  );
}
