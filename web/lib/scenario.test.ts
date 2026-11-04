// Checks that the TypeScript scenario engine gives the same cash every month as
// the Python copy (scripts/check_scenario.py), within EUR 1.
// Run: npm test   (run python scripts/check_scenario.py first)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { activePreset, presetSettings, project, PRESETS, type Settings, type ScenarioBase } from "./scenario.ts";

const root = new URL("../../", import.meta.url);
const base: ScenarioBase = JSON.parse(
  readFileSync(new URL("data/export/dashboard.json", root), "utf-8"),
).scenario_base;
const python = JSON.parse(readFileSync(new URL("data/check/scenario_python.json", root), "utf-8"));

// One case per preset plus a stress case (hires, students, higher churn and costs, funding).
for (const name of Object.keys(python)) {
  test(`${name}: TypeScript cash equals Python cash within EUR 1`, () => {
    const settings: Settings = python[name].settings;
    const ts = project(base, settings);
    const py: { month: string; cash: number }[] = python[name].rows;
    assert.equal(ts.length, py.length);
    ts.forEach((row, i) => {
      assert.equal(row.month, py[i].month);
      const diff = Math.abs(row.cash - py[i].cash);
      assert.ok(diff <= 1, `${row.month}: TS ${row.cash} vs Python ${py[i].cash}`);
    });
  });
}

test("Each preset button sets the same sliders as the Python copy, and is recognised as active", () => {
  for (const name of PRESETS) {
    assert.deepEqual(presetSettings(base, name), python[name].settings);
    assert.equal(activePreset(base, presetSettings(base, name)), name);
  }
  // Moving one slider away from a preset means no preset is highlighted.
  assert.equal(activePreset(base, { ...presetSettings(base, "Current plan"), students: 3 }), null);
});
