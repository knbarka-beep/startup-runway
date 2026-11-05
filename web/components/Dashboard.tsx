"use client";
// The main (and only) dashboard view. Holds two pieces of state:
//   1. the selected month (story line, KPIs, MRR bridge, burn drivers and update follow it)
//   2. the slider settings (only the dashed projection line follows them)
import { useMemo, useState } from "react";
import { cashAnnotations, data, type Month } from "@/lib/data";
import { activePreset, presetSettings, project, zeroCashMonth, PRESETS, type Settings } from "@/lib/scenario";
import { dec, eur, eurShort, monthLabel, pct } from "@/lib/format";
import { BurnDrivers, CashChart, MrrBridge } from "./charts";
import UpdateCard from "./UpdateCard";
import { Card, CardHeader } from "./kit/Card";
import { KpiCard, type Change } from "./kit/KpiCard";
import { PageHeader } from "./kit/PageHeader";
import { SegmentedControl } from "./kit/SegmentedControl";
import { Sparkline } from "./kit/Sparkline";
import { ThemeToggle } from "./kit/ThemeToggle";

const months = data.monthly;
const base = data.scenario_base;
const notes = cashAnnotations();

// Change vs the previous month for a KPI card. higherIsGood decides the colour.
function change(now: number | null, before: number | null | undefined, f: (v: number) => string, higherIsGood: boolean): Change | null {
  if (now === null || before === null || before === undefined) return null;
  const d = now - before;
  return { text: f(Math.abs(d)), up: d >= 0, good: d === 0 ? null : d > 0 === higherIsGood };
}

// One line under the header, filled from the data for the selected month (a template, not AI).
function story(m: Month) {
  if (m.runway_months === null || m.avg_net_burn_3m === null || !m.zero_cash_month)
    return <>Cash <strong>{eurShort(m.closing_cash)}</strong> at the end of {monthLabel(m.month)}. Runway needs 3 months of history, so it starts in Dec 2024.</>;
  return (
    <>
      Cash <strong>{eurShort(m.closing_cash)}</strong>, runway <strong>{dec(m.runway_months)} months</strong> at the
      3-month average net burn of {eurShort(m.avg_net_burn_3m)}. At that pace cash runs out in{" "}
      {monthLabel(m.zero_cash_month)}, so new funding is needed before then.
    </>
  );
}

function Slider({ id, label, value, hint, min, max, step, current, onChange }: {
  id: string; label: string; value: string; hint: React.ReactNode; min: number; max: number; step: number;
  current: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const fill = `${((current - min) / (max - min)) * 100}%`;
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 flex justify-between gap-2 text-sm">
        <span>{label}</span><strong className="font-semibold tabular-nums">{value}</strong>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={current} onChange={onChange}
             style={{ "--fill": fill } as React.CSSProperties} />
      <div className="mt-0.5 text-xs text-muted">{hint}</div>
    </div>
  );
}

export default function Dashboard() {
  const [idx, setIdx] = useState(months.length - 1);
  const [s, setS] = useState<Settings>(presetSettings(base, "Current plan"));

  const m = months[idx];
  const prev = idx > 0 ? months[idx - 1] : undefined;
  const upTo = months.slice(0, idx + 1);
  const upMonths = upTo.map((x) => x.month);
  const projection = useMemo(() => project(base, s), [s]);
  const zero = zeroCashMonth(projection);
  const lowest = projection.reduce((a, b) => (b.cash < a.cash ? b : a));
  const lastProjected = projection[projection.length - 1];
  const active = activePreset(base, s);

  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setS({ ...s, [k]: Number(e.target.value) });

  const runwayRisk = m.runway_months !== null && m.runway_months < 12;
  const drivers = data.burn_drivers.filter((d) => d.month === m.month);
  const months1 = (v: number) => `${dec(v)} months`;

  return (
    <main className="mx-auto max-w-[1200px] px-4 pt-6 pb-2">
      <PageHeader title="Nordlys Analytics ApS" suffix="(fictional)"
                  subtitle="Cash, burn and runway. All company data on this page is synthetic.">
        <label className="t-small text-muted" htmlFor="month">Month</label>
        <select id="month" value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
          {months.map((x, i) => <option key={x.month} value={i}>{monthLabel(x.month)}</option>)}
        </select>
        <ThemeToggle />
      </PageHeader>

      <p className="story my-5 text-[0.95rem]" aria-live="polite">{story(m)}</p>

      <section className="kpis mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Cash in bank" value={eurShort(m.closing_cash)}
                 change={change(m.closing_cash, prev?.closing_cash, eurShort, true)}
                 sub={`End of ${monthLabel(m.month)}${m.funding > 0 ? `, incl. ${eurShort(m.funding)} seed round` : ""}`}>
          <Sparkline values={upTo.map((x) => x.closing_cash)} months={upMonths} format={eur} monthLabel={monthLabel} />
        </KpiCard>
        <KpiCard label="Net burn (monthly)" value={eurShort(m.net_burn)}
                 change={change(m.net_burn, prev?.net_burn, eurShort, false)}
                 sub={`${m.avg_net_burn_3m !== null ? `3-month average ${eurShort(m.avg_net_burn_3m)}. ` : ""}Payments minus collections`}>
          <Sparkline values={upTo.map((x) => x.net_burn)} months={upMonths} format={eur} monthLabel={monthLabel} />
        </KpiCard>
        <KpiCard label="Runway at current burn" value={m.runway_months !== null ? months1(m.runway_months) : "n/a"}
                 valueClass={runwayRisk ? "text-negative" : ""}
                 change={change(m.runway_months, prev?.runway_months, months1, true)}
                 sub={m.zero_cash_month ? `Cash runs out ${monthLabel(m.zero_cash_month)} at the 3-month average net burn` : "Needs 3 months of history"}>
          <Sparkline values={upTo.map((x) => x.runway_months)} months={upMonths} format={months1} monthLabel={monthLabel}
                     color={runwayRisk ? "var(--negative)" : "var(--accent)"} />
        </KpiCard>
        <KpiCard label="ARR" value={eurShort(m.arr)}
                 change={change(m.arr, prev?.arr, eurShort, true)}
                 sub={m.arr_growth_12m !== null ? `${m.arr_growth_12m >= 0 ? "+" : ""}${pct(m.arr_growth_12m)} vs 12 months ago` : "Growth shown from Oct 2025 (needs 12 months)"}>
          <Sparkline values={upTo.map((x) => x.arr)} months={upMonths} format={eur} monthLabel={monthLabel} />
        </KpiCard>
      </section>

      <section className="main mb-4 grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <Card>
          <CardHeader title="Cash in bank: actual and scenario" aside="Solid: actual. Dashed: projection from the sliders." />
          <CashChart actuals={months} projection={projection} selected={m.month} zeroMonth={zero} notes={notes} />
          <ol className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted" aria-label="Events marked on the cash line">
            {notes.map((n, i) => (
              <li key={n.month}>
                <span className="mr-1 inline-grid h-4 w-4 place-items-center rounded-full border border-text text-[10px] font-semibold text-text">{i + 1}</span>
                {monthLabel(n.month)}: {n.text}
              </li>
            ))}
          </ol>
          {zero ? (
            <p className="projection-line mt-4 font-semibold text-negative">With these settings cash runs out in {monthLabel(zero)}.</p>
          ) : (
            <p className="projection-line mt-4">
              With these settings cash bottoms out at <strong>{eurShort(lowest.cash)}</strong> in {monthLabel(lowest.month)}
              {lowest.month === lastProjected.month ? ", the last projected month" : ""}.
            </p>
          )}
          <p className="mt-1 text-xs text-muted">
            Simplified: new hires add cost but do not change the growth slider, and customers are assumed to pay in the
            month revenue is earned (annual upfront billing is ignored in the projection). It is a set of assumptions,
            not a forecast.
          </p>
        </Card>

        <Card>
          <CardHeader title={`Scenario from ${monthLabel(base.start_month)}`}
                      aside={<button type="button" className="btn" onClick={() => setS(presetSettings(base, "Current plan"))}>Reset</button>} />

          <SegmentedControl className="presets mb-5" label="Scenario presets" options={PRESETS} value={active}
                            onChange={(p) => setS(presetSettings(base, p as (typeof PRESETS)[number]))} />

          <Slider id="hires" label="Full-time hires, next 12 months" value={String(s.hires)} current={s.hires}
                  min={0} max={15} step={1} onChange={set("hires")}
                  hint={`${eur(base.cost_per_hire)} loaded cost per hire per month, spread evenly over 12 months`} />
          <Slider id="students" label="Student assistants (part-time)" value={String(s.students)} current={s.students}
                  min={0} max={6} step={1} onChange={set("students")}
                  hint={`${eur(base.student_assistant_cost)} a month each, from ${monthLabel(projection[0].month)}. All payroll rises ${pct(base.annual_salary_increase, 0)} every January.`} />
          <Slider id="growth" label="New and expansion MRR, % of MRR per month" value={pct(s.growthRate, 2)} current={s.growthRate}
                  min={base.default_growth_rate * 0.5} max={base.default_growth_rate * 1.5} step={0.0005} onChange={set("growthRate")}
                  hint={`12-month trend: ${pct(base.default_growth_rate, 2)}`} />
          <Slider id="churn" label="Churn and contraction, % of MRR per month" value={pct(s.churnRate, 2)} current={s.churnRate}
                  min={0} max={0.04} step={0.0005} onChange={set("churnRate")}
                  hint={`12-month trend: ${pct(base.default_churn_rate, 2)}`} />
          <Slider id="opex" label="Other costs (non-payroll)" value={`${s.opexChange > 0 ? "+" : ""}${pct(s.opexChange, 0)}`} current={s.opexChange}
                  min={-0.3} max={0.3} step={0.01} onChange={set("opexChange")}
                  hint={`Base: ${eur(base.monthly_opex)} a month (last 3 months average)`} />
          <Slider id="funding" label="New funding (optional)" value={s.fundingAmount ? eurShort(s.fundingAmount) : "none"} current={s.fundingAmount}
                  min={0} max={3_000_000} step={250_000} onChange={set("fundingAmount")}
                  hint={s.fundingAmount > 0 && (
                    <label className="mt-1 flex items-center justify-between gap-2" htmlFor="fmonth">
                      <span>Arrives in</span>
                      <select id="fmonth" value={s.fundingMonth} onChange={set("fundingMonth")}>
                        {projection.map((p, i) => <option key={p.month} value={i + 1}>{monthLabel(p.month)}</option>)}
                      </select>
                    </label>
                  )} />
        </Card>
      </section>

      <section className="mb-4 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title={`MRR bridge, ${monthLabel(m.month)}`} aside="Axis does not start at zero" />
          <MrrBridge m={m} />
          <p className="mt-2 text-xs text-muted">
            {m.new_customers} new and {m.churned_customers} churned customers, {m.active_customers} active.
            {m.nrr_12m !== null ? ` Net revenue retention (12 months): ${pct(m.nrr_12m)}.` : ""}
            {m.burn_multiple !== null ? ` Burn multiple (3 months): ${dec(m.burn_multiple)}.` : m.burn_multiple_note ? ` Burn multiple: ${m.burn_multiple_note.toLowerCase()}.` : ""}
            {/* The 3-month windows ending Aug and Sep 2026 both contain the Jul 2026 churn of the largest customer. */}
            {m.burn_multiple !== null && (m.month === "2026-08" || m.month === "2026-09") &&
              " It is high because the largest customer (€9.400 MRR) churned in Jul 2026 and cancelled out most of the new ARR won in these 3 months."}
          </p>
        </Card>
        <Card>
          <CardHeader title={`Where the money goes, ${monthLabel(m.month)}`} />
          <h3 className="t-label mb-2">Payroll by team (loaded cost)</h3>
          <BurnDrivers rows={drivers} type="team" />
          <h3 className="t-label mt-5 mb-2">Other costs by category</h3>
          <BurnDrivers rows={drivers} type="category" />
          <p className="mt-3 text-xs text-muted">
            Payments {eur(m.payments)} minus collections {eur(m.collections)} = net burn {eur(m.net_burn)}.
          </p>
        </Card>
      </section>

      <UpdateCard month={m.month} />
    </main>
  );
}
