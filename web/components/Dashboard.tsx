"use client";
// The main (and only) dashboard view. Holds two pieces of state:
//   1. the selected month (hero, MRR bridge, burn drivers and update follow it)
//   2. the slider settings (only the projection on the cash chart and the result pill follow them)
// Layout, top to bottom: sticky header, hero (runway + three stats), cash chart with the scenario
// controls under it, MRR bridge and burn drivers side by side, investor update.
import { useEffect, useMemo, useState } from "react";
import { cashAnnotations, data, type Month } from "@/lib/data";
import { activePreset, presetSettings, project, zeroCashMonth, PRESETS, type Settings } from "@/lib/scenario";
import { dec, eur, eurShort, monthLabel, monthShort, pct } from "@/lib/format";
import { BurnDrivers, CashChart, MrrBridge } from "./charts";
import UpdateCard from "./UpdateCard";
import { Card, CardHeader } from "./kit/Card";
import { InfoTip } from "./kit/InfoTip";
import { DeltaPill, KpiCard, type Change } from "./kit/KpiCard";
import { PageHeader } from "./kit/PageHeader";
import { SegmentedControl } from "./kit/SegmentedControl";
import { Sparkline } from "./kit/Sparkline";
import { ThemeToggle } from "./kit/ThemeToggle";
import { useTween } from "./kit/useAnimateOnce";

const months = data.monthly;
const base = data.scenario_base;
const notes = cashAnnotations();

// Change vs the previous month for a stat. higherIsGood decides the colour.
function change(now: number | null, before: Month | undefined, key: keyof Month, f: (v: number) => string, higherIsGood: boolean): Change | null {
  const then = before?.[key] as number | null | undefined;
  if (now === null || then === null || then === undefined || !before) return null;
  const d = now - then;
  return { text: f(Math.abs(d)), up: d >= 0, good: d === 0 ? null : d > 0 === higherIsGood, vs: monthShort(before.month) };
}

function Slider({ id, label, value, info, min, max, step, current, onChange, children }: {
  id: string; label: string; value: string; info: React.ReactNode; min: number; max: number; step: number;
  current: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; children?: React.ReactNode;
}) {
  const fill = `${((current - min) / (max - min)) * 100}%`;
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5 text-sm">
        <label htmlFor={id}>{label}</label>
        <InfoTip label={label}>{info}</InfoTip>
        <strong className="ml-auto whitespace-nowrap font-semibold tabular-nums">{value}</strong>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={current} onChange={onChange}
             style={{ "--fill": fill } as React.CSSProperties} />
      {children}
    </div>
  );
}

// Result of the scenario, always named after the preset ("Custom" once a slider has moved), so it is not
// mistaken for the hero's date at current burn. The euro amount counts to its new value (200 ms) when a slider moves.
function ResultPill({ name, zero, lowest, isLast }: {
  name: string; zero: string | null; lowest: { month: string; cash: number }; isLast: boolean;
}) {
  const cash = useTween(lowest.cash);
  return (
    <p className={`projection-line result-pill ${zero ? "risk" : ""}`} aria-live="polite">
      {name}:&nbsp;{zero ? <>cash runs out in {monthLabel(zero)}</>
        : <>cash bottoms out at {eurShort(cash)} in {monthLabel(lowest.month)}{isLast ? ", the last projected month" : ""}</>}
    </p>
  );
}

export default function Dashboard() {
  const [idx, setIdx] = useState(months.length - 1);
  const [s, setS] = useState<Settings>(presetSettings(base, "Current plan"));
  // "Adjust assumptions" is open on desktop and closed on a phone.
  const [open, setOpen] = useState(true);
  useEffect(() => { if (matchMedia("(max-width: 767px)").matches) setOpen(false); }, []);

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
  const runwayChange = change(m.runway_months, prev, "runway_months", months1, true);

  return (
    <>
      <PageHeader title="Nordlys Analytics ApS" suffix="(fictional)">
        <label className="t-small text-muted max-sm:sr-only" htmlFor="month">Month</label>
        <select id="month" value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
          {months.map((x, i) => <option key={x.month} value={i}>{monthLabel(x.month)}</option>)}
        </select>
        <ThemeToggle />
      </PageHeader>

      <main className="mx-auto max-w-[1200px] px-4 pb-2">
        {/* Hero: how long the cash lasts, then the three numbers behind it. */}
        <section className="hero grid items-end gap-x-12 gap-y-8 pt-8 pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-x-10 lg:pt-4 lg:pb-5">
          <div>
            <p className="t-small mb-4 text-muted lg:mb-1">Cash, burn and runway. All company data on this page is synthetic.</p>
            <div className="flex items-center gap-1.5">
              <span className="t-label">Runway at current burn</span>
              <InfoTip label="runway">
                {m.runway_months !== null && m.avg_net_burn_3m !== null && m.zero_cash_month ? (
                  <>
                    <p>Cash at the end of {monthLabel(m.month)} divided by the 3-month average net burn of{" "}
                      {eurShort(m.avg_net_burn_3m)}. At current burn, cash lasts until {monthLabel(m.zero_cash_month)}, so new
                      funding is needed before then.</p>
                    <p>This date uses the last three months&apos; burn with no changes. The scenario under the chart
                      uses the preset&apos;s hires, salary rises, growth and churn, so its date can differ.</p>
                    <p>Shown in red below 12 months.</p>
                  </>
                ) : <p>Runway needs 3 months of history, so it starts in Dec 2024.</p>}
              </InfoTip>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 lg:mt-1">
              <div className={`t-hero ${runwayRisk ? "text-negative" : ""}`}>
                {m.runway_months !== null ? <>{dec(m.runway_months)} <span className="text-[0.55em] font-normal">months</span></> : "n/a"}
              </div>
              {runwayChange && <DeltaPill change={runwayChange} />}
            </div>
            <p className="story mt-3 text-[1.05rem] lg:mt-2" aria-live="polite">
              {m.zero_cash_month ? <>At current burn, cash lasts until <strong>{monthLabel(m.zero_cash_month)}</strong>. </> : null}
              <strong>{eurShort(m.closing_cash)}</strong> in the bank.
            </p>
            <div className="mt-3 max-w-[300px] lg:mt-1">
              <Sparkline values={upTo.map((x) => x.runway_months)} months={upMonths} format={months1} monthLabel={monthLabel}
                         color={runwayRisk ? "var(--negative)" : "var(--accent)"} height={26} />
            </div>
          </div>

          <div className="kpis grid gap-x-6 gap-y-6 sm:grid-cols-3">
            <KpiCard label="Cash in bank" value={eurShort(m.closing_cash)}
                     change={change(m.closing_cash, prev, "closing_cash", eurShort, true)}
                     info={<p>End of {monthLabel(m.month)}{m.funding > 0 ? `, including the ${eurShort(m.funding)} seed round received this month` : ""}.</p>}>
              <Sparkline values={upTo.map((x) => x.closing_cash)} months={upMonths} format={eur} monthLabel={monthLabel} />
            </KpiCard>
            <KpiCard label="Net burn" value={eurShort(m.net_burn)}
                     change={change(m.net_burn, prev, "net_burn", eurShort, false)}
                     info={<p>Monthly payments minus collections.{m.avg_net_burn_3m !== null ? ` 3-month average: ${eurShort(m.avg_net_burn_3m)}.` : ""}</p>}>
              <Sparkline values={upTo.map((x) => x.net_burn)} months={upMonths} format={eur} monthLabel={monthLabel} />
            </KpiCard>
            <KpiCard label="ARR" value={eurShort(m.arr)}
                     change={change(m.arr, prev, "arr", eurShort, true)}
                     info={<p>{m.arr_growth_12m !== null ? `${m.arr_growth_12m >= 0 ? "+" : ""}${pct(m.arr_growth_12m)} vs 12 months ago.` : "Growth is shown from Oct 2025 (needs 12 months)."}</p>}>
              <Sparkline values={upTo.map((x) => x.arr)} months={upMonths} format={eur} monthLabel={monthLabel} />
            </KpiCard>
          </div>
        </section>

        {/* Cash chart, full width, with the scenario controls directly under it. */}
        <Card large className="main mb-10 lg:mb-12 lg:!pt-4 lg:!pb-4">
          <CardHeader title="Cash in bank: actual and scenario" infoLabel="the cash chart"
                      info={<>
                        <p>Solid line and soft fill: actual cash. Dashed line over a hatch: the projection from{" "}
                          {monthLabel(base.start_month)}, set by the presets and sliders below.</p>
                        <p>Marked on the actual line:</p>
                        <ul>{notes.map((n) => <li key={n.month}>{monthLabel(n.month)}: {n.text}</li>)}</ul>
                        <p>Simplified: new hires add cost but do not change the growth slider, and customers are assumed to
                          pay in the month revenue is earned (annual upfront billing is ignored in the projection). It is a
                          set of assumptions, not a forecast.</p>
                      </>}
                      aside={
                        <span className="flex items-center gap-4" aria-hidden="true">
                          <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-accent" />Actual</span>
                          <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed border-accent" />Projection</span>
                        </span>
                      } />
          <CashChart actuals={months} projection={projection} selected={m.month} zeroMonth={zero} notes={notes} />

          <div className="mt-5 border-t border-border pt-5 lg:mt-3 lg:pt-3">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="t-label">Scenario from {monthLabel(base.start_month)}</span>
                <SegmentedControl className="presets" label="Scenario presets" options={PRESETS} value={active}
                                  onChange={(p) => setS(presetSettings(base, p as (typeof PRESETS)[number]))} />
                <button type="button" className="btn" onClick={() => setS(presetSettings(base, "Current plan"))}>Reset</button>
              </div>
              <ResultPill name={active ?? "Custom"} zero={zero} lowest={lowest} isLast={lowest.month === lastProjected.month} />
            </div>

            <details className="assumptions mt-5" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
              <summary>Adjust assumptions</summary>
              <div className="mt-4 grid gap-x-8 gap-y-5 md:grid-cols-2 lg:grid-cols-3">
                <Slider id="hires" label="Full-time hires" value={String(s.hires)} current={s.hires}
                        min={0} max={15} step={1} onChange={set("hires")}
                        info={`Over the next 12 months, spread evenly. ${eur(base.cost_per_hire)} loaded cost per hire per month.`} />
                <Slider id="students" label="Student assistants" value={String(s.students)} current={s.students}
                        min={0} max={6} step={1} onChange={set("students")}
                        info={`Part-time. ${eur(base.student_assistant_cost)} a month each, from ${monthLabel(projection[0].month)}. All payroll rises ${pct(base.annual_salary_increase, 0)} every January.`} />
                <Slider id="growth" label="New and expansion MRR" value={pct(s.growthRate, 2)} current={s.growthRate}
                        min={base.default_growth_rate * 0.5} max={base.default_growth_rate * 1.5} step={0.0005} onChange={set("growthRate")}
                        info={`% of MRR per month. 12-month trend: ${pct(base.default_growth_rate, 2)}.`} />
                <Slider id="churn" label="Churn and contraction" value={pct(s.churnRate, 2)} current={s.churnRate}
                        min={0} max={0.04} step={0.0005} onChange={set("churnRate")}
                        info={`% of MRR per month. 12-month trend: ${pct(base.default_churn_rate, 2)}.`} />
                <Slider id="opex" label="Other costs" value={`${s.opexChange > 0 ? "+" : ""}${pct(s.opexChange, 0)}`} current={s.opexChange}
                        min={-0.3} max={0.3} step={0.01} onChange={set("opexChange")}
                        info={`Non-payroll costs. Base: ${eur(base.monthly_opex)} a month (last 3 months average).`} />
                <Slider id="funding" label="New funding" value={s.fundingAmount ? eurShort(s.fundingAmount) : "none"} current={s.fundingAmount}
                        min={0} max={3_000_000} step={250_000} onChange={set("fundingAmount")}
                        info="Optional. A new round arriving in the month you pick.">
                  {s.fundingAmount > 0 && (
                    <label className="mt-2 flex items-center justify-between gap-2 text-sm text-muted" htmlFor="fmonth">
                      <span>Arrives in</span>
                      <select id="fmonth" value={s.fundingMonth} onChange={set("fundingMonth")}>
                        {projection.map((p, i) => <option key={p.month} value={i + 1}>{monthLabel(p.month)}</option>)}
                      </select>
                    </label>
                  )}
                </Slider>
              </div>
            </details>
          </div>
        </Card>

        <section className="mb-10 grid gap-4 lg:mb-12 lg:grid-cols-2 lg:gap-6">
          <Card className="flex flex-col">
            <CardHeader eyebrow="Revenue" title={`MRR bridge, ${monthLabel(m.month)}`} aside="Axis does not start at zero"
                        info={<>
                          <p>Opening MRR, plus new and expansion, minus contraction and churn, gives closing MRR.</p>
                          {m.burn_multiple !== null ? <p>Burn multiple (3 months): {dec(m.burn_multiple)}.
                            {/* The 3-month windows ending Aug and Sep 2026 both contain the Jul 2026 churn of the largest customer. */}
                            {(m.month === "2026-08" || m.month === "2026-09") &&
                              " It is high because the largest customer (€9.400 MRR) churned in Jul 2026 and cancelled out most of the new ARR won in these 3 months."}</p>
                            : m.burn_multiple_note ? <p>Burn multiple: {m.burn_multiple_note.toLowerCase()}.</p> : null}
                        </>} />
            <MrrBridge m={m} />
            <p className="mt-auto pt-3 text-xs text-muted">
              {m.new_customers} new and {m.churned_customers} churned customers, {m.active_customers} active.
              {m.nrr_12m !== null ? ` Net revenue retention (12 months): ${pct(m.nrr_12m)}.` : ""}
            </p>
          </Card>
          <Card className="flex flex-col">
            <CardHeader eyebrow="Costs" title={`Where the money goes, ${monthLabel(m.month)}`} />
            <h3 className="t-label mb-2">Payroll by team (loaded cost)</h3>
            <BurnDrivers rows={drivers} type="team" />
            <h3 className="t-label mt-5 mb-2">Other costs by category</h3>
            <BurnDrivers rows={drivers} type="category" />
            <p className="mt-auto pt-3 text-xs text-muted">
              Payments {eur(m.payments)} minus collections {eur(m.collections)} = net burn {eur(m.net_burn)}.
            </p>
          </Card>
        </section>

        <UpdateCard month={m.month} />
      </main>
    </>
  );
}
