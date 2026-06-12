/* ==========================================================================
 * calc.js — Budget & forecast math.
 *
 * The base budget is driven by a weekly SALES target per market/department.
 * Gross and labor are derived from the editable per-department assumptions
 * (gross % and labor % of sales). The forecast layer applies a weekly
 * adjustment on top of the base sales, and gross/labor flow from there.
 * Weekly figures are spread to days using the imported day-of-week profiles.
 * ========================================================================== */

/* Base weekly sales target for a market/department in a week. */
function baseSales(weekKey, marketId, deptId) {
  const w = state.budget[weekKey];
  if (w && w[marketId] && w[marketId][deptId]) return num(w[marketId][deptId].sales);
  return 0;
}

function setBaseSales(weekKey, marketId, deptId, value) {
  state.budget[weekKey] = state.budget[weekKey] || {};
  state.budget[weekKey][marketId] = state.budget[weekKey][marketId] || {};
  state.budget[weekKey][marketId][deptId] = { sales: num(value) };
}

/* Forecast adjustment record for a market/department in a week.
 * mode: 'pct'      -> value is a +/- percent applied to base sales
 *       'override' -> value is an absolute sales figure replacing the base */
function getForecast(weekKey, marketId, deptId) {
  const w = state.forecast[weekKey];
  if (w && w[marketId] && w[marketId][deptId]) return w[marketId][deptId];
  return null;
}

function setForecast(weekKey, marketId, deptId, record) {
  state.forecast[weekKey] = state.forecast[weekKey] || {};
  state.forecast[weekKey][marketId] = state.forecast[weekKey][marketId] || {};
  if (record == null) {
    delete state.forecast[weekKey][marketId][deptId];
  } else {
    state.forecast[weekKey][marketId][deptId] = record;
  }
}

/* Forecast sales after applying any adjustment to the base sales. */
function forecastSales(weekKey, marketId, deptId) {
  const base = baseSales(weekKey, marketId, deptId);
  const f = getForecast(weekKey, marketId, deptId);
  if (!f) return base;
  if (f.mode === 'override') return num(f.value);
  return base * (1 + num(f.value) / 100);
}

/* Turn a sales figure into a full {sales, gross, labor} line for a department
 * using its margin assumptions. */
function lineFromSales(deptId, sales) {
  const a = state.assumptions[deptId] || { grossPct: 0, laborPct: 0 };
  return {
    sales,
    gross: sales * a.grossPct / 100,
    labor: sales * a.laborPct / 100,
  };
}

/* Weekly base line for a market/department. */
function baseLine(weekKey, marketId, deptId) {
  return lineFromSales(deptId, baseSales(weekKey, marketId, deptId));
}

/* Weekly forecast line for a market/department. */
function forecastLine(weekKey, marketId, deptId) {
  return lineFromSales(deptId, forecastSales(weekKey, marketId, deptId));
}

/* Sum a per-department line generator across all departments for a market. */
function marketTotal(weekKey, marketId, lineFn) {
  return state.departments.reduce((acc, d) => {
    const l = lineFn(weekKey, marketId, d.id);
    acc.sales += l.sales; acc.gross += l.gross; acc.labor += l.labor;
    return acc;
  }, { sales: 0, gross: 0, labor: 0 });
}

/* Company-wide total across all markets. */
function companyTotal(weekKey, lineFn) {
  return state.markets.reduce((acc, m) => {
    const t = marketTotal(weekKey, m.id, lineFn);
    acc.sales += t.sales; acc.gross += t.gross; acc.labor += t.labor;
    return acc;
  }, { sales: 0, gross: 0, labor: 0 });
}

/* Spread a weekly line into 7 daily lines using each metric's day profile. */
function dailyBreakdown(weekKey, marketId, deptId, lineFn) {
  const line = lineFn(weekKey, marketId, deptId);
  const ps = dayProfile(marketId, deptId, 'sales');
  const pg = dayProfile(marketId, deptId, 'gross');
  const pl = dayProfile(marketId, deptId, 'labor');
  return DAYS.map((_, i) => ({
    sales: line.sales * ps[i],
    gross: line.gross * pg[i],
    labor: line.labor * pl[i],
  }));
}

/* Daily totals for a whole market (summed across departments). */
function marketDailyTotals(weekKey, marketId, lineFn) {
  const totals = DAYS.map(() => ({ sales: 0, gross: 0, labor: 0 }));
  for (const d of state.departments) {
    const daily = dailyBreakdown(weekKey, marketId, d.id, lineFn);
    daily.forEach((day, i) => {
      totals[i].sales += day.sales;
      totals[i].gross += day.gross;
      totals[i].labor += day.labor;
    });
  }
  return totals;
}
