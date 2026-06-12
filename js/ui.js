/* ==========================================================================
 * ui.js — Rendering and interaction for all tabs.
 *
 * Strategy: each tab has a render function that returns/writes HTML into the
 * main view, then wires up its inputs. Numeric edits commit on `change`
 * (blur/Enter) and re-render, which keeps the math and totals always in sync.
 * ========================================================================== */

let activeTab = 'budget';

const el = (id) => document.getElementById(id);
const view = () => el('view');

/* -------------------------------------------------------------------------- */
/* Bootstrap                                                                  */
/* -------------------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initChrome();
  render();
});

function initChrome() {
  // Week picker
  const wi = el('weekInput');
  wi.value = state.activeWeek;
  el('weekLabel').textContent = formatWeekLabel(state.activeWeek);
  wi.addEventListener('change', () => {
    state.activeWeek = weekStart(wi.value || new Date());
    wi.value = state.activeWeek;
    el('weekLabel').textContent = formatWeekLabel(state.activeWeek);
    saveState();
    render();
  });

  // Tabs
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      render();
    });
  });

  el('exportBtn').addEventListener('click', exportData);
  el('resetBtn').addEventListener('click', () => {
    if (confirm('Reset ALL markets, budgets, forecasts and imported data to defaults? This cannot be undone.')) {
      resetState();
      el('weekInput').value = state.activeWeek;
      el('weekLabel').textContent = formatWeekLabel(state.activeWeek);
      render();
      toast('All data reset to defaults.');
    }
  });
}

function render() {
  const views = {
    budget: renderBudget,
    forecast: renderForecast,
    daily: renderDaily,
    import: renderImport,
    setup: renderSetup,
  };
  (views[activeTab] || renderBudget)();
}

/* -------------------------------------------------------------------------- */
/* Small render helpers                                                       */
/* -------------------------------------------------------------------------- */

function kpi(label, value, sub) {
  return `<div class="kpi"><div class="label">${label}</div>
    <div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
}

function marketOptions(selected) {
  return state.markets.map((m) =>
    `<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pctOfSales(part, sales) {
  return sales > 0 ? fmtPct(part / sales * 100) : '—';
}

let toastTimer = null;
function toast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* UI state that should survive re-renders within a tab (e.g. selected market). */
const uiPrefs = { budgetMarket: null, forecastMarket: null, dailyMarket: null, dailyBasis: 'budget', dailyMetric: 'sales' };
function pref(key, fallback) {
  if (uiPrefs[key] == null) uiPrefs[key] = fallback;
  return uiPrefs[key];
}

/* -------------------------------------------------------------------------- */
/* Budget tab                                                                 */
/* -------------------------------------------------------------------------- */

function renderBudget() {
  const wk = state.activeWeek;
  const mId = pref('budgetMarket', state.markets[0].id);
  const co = companyTotal(wk, baseLine);

  let html = `
    <div class="panel">
      <div class="section-title"><h2>Weekly Budget</h2>
        <span class="pill">${formatWeekLabel(wk)}</span></div>
      <p class="hint">Enter each department's weekly <strong>sales</strong> target. Gross and labor are derived from the margin assumptions in Setup. Totals roll up to the market and the whole company.</p>
      <div class="kpis">
        ${kpi('Company Sales', fmtMoney(co.sales))}
        ${kpi('Company Gross', fmtMoney(co.gross), pctOfSales(co.gross, co.sales) + ' of sales')}
        ${kpi('Company Labor', fmtMoney(co.labor), pctOfSales(co.labor, co.sales) + ' of sales')}
        ${kpi('Contribution', fmtMoney(co.gross - co.labor), 'Gross − Labor')}
      </div>
    </div>

    <div class="panel">
      <div class="controls">
        <div class="field">
          <label for="budgetMarket">Edit market</label>
          <select id="budgetMarket">${marketOptions(mId)}</select>
        </div>
        <button class="btn" id="copyPrevWeek" title="Copy this market's sales from the previous week">Copy previous week</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Department</th><th>Weekly Sales ($)</th>
            <th>Gross %</th><th>Gross $</th>
            <th>Labor %</th><th>Labor $</th><th>Contribution $</th>
          </tr></thead>
          <tbody>`;

  let mt = { sales: 0, gross: 0, labor: 0 };
  for (const d of state.departments) {
    const a = state.assumptions[d.id] || { grossPct: 0, laborPct: 0 };
    const line = baseLine(wk, mId, d.id);
    mt.sales += line.sales; mt.gross += line.gross; mt.labor += line.labor;
    html += `<tr>
      <td>${esc(d.name)}</td>
      <td><input class="num-input" type="number" min="0" step="100" data-dept="${d.id}"
            value="${baseSales(wk, mId, d.id) || ''}" placeholder="0" /></td>
      <td class="muted">${fmtPct(a.grossPct)}</td>
      <td>${fmtMoney(line.gross)}</td>
      <td class="muted">${fmtPct(a.laborPct)}</td>
      <td>${fmtMoney(line.labor)}</td>
      <td>${fmtMoney(line.gross - line.labor)}</td>
    </tr>`;
  }

  html += `</tbody><tfoot><tr>
      <td>${esc(marketName(mId))} total</td>
      <td>${fmtMoney(mt.sales)}</td>
      <td class="muted">${pctOfSales(mt.gross, mt.sales)}</td>
      <td>${fmtMoney(mt.gross)}</td>
      <td class="muted">${pctOfSales(mt.labor, mt.sales)}</td>
      <td>${fmtMoney(mt.labor)}</td>
      <td>${fmtMoney(mt.gross - mt.labor)}</td>
    </tr></tfoot></table></div>
    </div>`;

  // Company roll-up by market
  html += `<div class="panel">
      <h2>Company Roll-up by Market</h2>
      <p class="hint">Read-only weekly totals for ${formatWeekLabel(wk)}.</p>
      <div class="table-wrap"><table>
      <thead><tr><th>Market</th><th>Sales</th><th>Gross</th><th>Gross %</th><th>Labor</th><th>Labor %</th><th>Contribution</th></tr></thead><tbody>`;
  for (const m of state.markets) {
    const t = marketTotal(wk, m.id, baseLine);
    html += `<tr><td>${esc(m.name)}</td><td>${fmtMoney(t.sales)}</td><td>${fmtMoney(t.gross)}</td>
      <td class="muted">${pctOfSales(t.gross, t.sales)}</td><td>${fmtMoney(t.labor)}</td>
      <td class="muted">${pctOfSales(t.labor, t.sales)}</td><td>${fmtMoney(t.gross - t.labor)}</td></tr>`;
  }
  html += `</tbody><tfoot><tr><td>Company total</td><td>${fmtMoney(co.sales)}</td><td>${fmtMoney(co.gross)}</td>
    <td class="muted">${pctOfSales(co.gross, co.sales)}</td><td>${fmtMoney(co.labor)}</td>
    <td class="muted">${pctOfSales(co.labor, co.sales)}</td><td>${fmtMoney(co.gross - co.labor)}</td></tr></tfoot>
    </table></div></div>`;

  view().innerHTML = html;

  el('budgetMarket').addEventListener('change', (e) => { uiPrefs.budgetMarket = e.target.value; render(); });
  view().querySelectorAll('input[data-dept]').forEach((inp) => {
    inp.addEventListener('change', () => {
      setBaseSales(wk, mId, inp.dataset.dept, inp.value);
      saveState();
      render();
    });
  });
  el('copyPrevWeek').addEventListener('click', () => copyPreviousWeek(mId));
}

function copyPreviousWeek(mId) {
  const cur = state.activeWeek;
  const prev = weekStart(new Date(new Date(cur).getTime() - 7 * 86400000));
  const src = state.budget[prev] && state.budget[prev][mId];
  if (!src) { toast('No budget found for the previous week.'); return; }
  for (const d of state.departments) {
    if (src[d.id]) setBaseSales(cur, mId, d.id, src[d.id].sales);
  }
  saveState();
  render();
  toast('Copied previous week into ' + marketName(mId) + '.');
}

/* -------------------------------------------------------------------------- */
/* Forecast tab                                                               */
/* -------------------------------------------------------------------------- */

function renderForecast() {
  const wk = state.activeWeek;
  const mId = pref('forecastMarket', state.markets[0].id);
  const base = marketTotal(wk, mId, baseLine);
  const fc = marketTotal(wk, mId, forecastLine);
  const coBase = companyTotal(wk, baseLine);
  const coFc = companyTotal(wk, forecastLine);
  const delta = fc.sales - base.sales;

  let html = `
    <div class="panel">
      <div class="section-title"><h2>Weekly Forecast Adjustments</h2>
        <span class="pill">${formatWeekLabel(wk)}</span></div>
      <p class="hint">Adjust the budget for the week as conditions change — apply a <strong>% lift/cut</strong> to budgeted sales, or enter an <strong>override</strong> dollar figure. Gross and labor re-forecast automatically and the new totals re-distribute across the days.</p>
      <div class="kpis">
        ${kpi('Company Forecast Sales', fmtMoney(coFc.sales), deltaSub(coFc.sales - coBase.sales))}
        ${kpi('Company Forecast Gross', fmtMoney(coFc.gross), pctOfSales(coFc.gross, coFc.sales) + ' of sales')}
        ${kpi('Company Forecast Labor', fmtMoney(coFc.labor), pctOfSales(coFc.labor, coFc.sales) + ' of sales')}
        ${kpi('Company Contribution', fmtMoney(coFc.gross - coFc.labor), deltaSub((coFc.gross - coFc.labor) - (coBase.gross - coBase.labor)))}
      </div>
    </div>

    <div class="panel">
      <div class="controls">
        <div class="field">
          <label for="forecastMarket">Market</label>
          <select id="forecastMarket">${marketOptions(mId)}</select>
        </div>
        <button class="btn" id="clearAdj">Clear this market's adjustments</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Department</th><th>Budget Sales</th><th>Adj. type</th><th>Value</th>
          <th>Forecast Sales</th><th>Δ Sales</th><th>Fcst Gross</th><th>Fcst Labor</th><th>Note</th>
        </tr></thead><tbody>`;

  for (const d of state.departments) {
    const bSales = baseSales(wk, mId, d.id);
    const f = getForecast(wk, mId, d.id) || { mode: 'pct', value: '', note: '' };
    const fLine = forecastLine(wk, mId, d.id);
    const dSales = fLine.sales - bSales;
    html += `<tr>
      <td>${esc(d.name)}</td>
      <td class="muted">${fmtMoney(bSales)}</td>
      <td><select class="adj-mode" data-dept="${d.id}">
        <option value="pct" ${f.mode === 'pct' ? 'selected' : ''}>% change</option>
        <option value="override" ${f.mode === 'override' ? 'selected' : ''}>$ override</option>
      </select></td>
      <td><input class="num-input adj-val" type="number" step="${f.mode === 'pct' ? '0.5' : '100'}"
            data-dept="${d.id}" value="${f.value === '' || f.value == null ? '' : f.value}"
            placeholder="${f.mode === 'pct' ? '+/- %' : '$'}" /></td>
      <td>${fmtMoney(fLine.sales)}</td>
      <td class="${dSales >= 0 ? 'pos' : 'neg'}">${dSales >= 0 ? '+' : ''}${fmtMoney(dSales)}</td>
      <td>${fmtMoney(fLine.gross)}</td>
      <td>${fmtMoney(fLine.labor)}</td>
      <td><input class="adj-note num-input" style="width:150px;text-align:left" type="text"
            data-dept="${d.id}" value="${esc(f.note || '')}" placeholder="reason" /></td>
    </tr>`;
  }

  html += `</tbody><tfoot><tr>
      <td>${esc(marketName(mId))} total</td>
      <td class="muted">${fmtMoney(base.sales)}</td><td></td><td></td>
      <td>${fmtMoney(fc.sales)}</td>
      <td class="${delta >= 0 ? 'pos' : 'neg'}">${delta >= 0 ? '+' : ''}${fmtMoney(delta)}</td>
      <td>${fmtMoney(fc.gross)}</td><td>${fmtMoney(fc.labor)}</td><td></td>
    </tr></tfoot></table></div>
    </div>`;

  view().innerHTML = html;

  el('forecastMarket').addEventListener('change', (e) => { uiPrefs.forecastMarket = e.target.value; render(); });
  el('clearAdj').addEventListener('click', () => {
    if (state.forecast[wk]) delete state.forecast[wk][mId];
    saveState(); render(); toast('Cleared adjustments for ' + marketName(mId) + '.');
  });

  const commit = (deptId) => {
    const modeSel = view().querySelector(`.adj-mode[data-dept="${deptId}"]`);
    const valInp = view().querySelector(`.adj-val[data-dept="${deptId}"]`);
    const noteInp = view().querySelector(`.adj-note[data-dept="${deptId}"]`);
    const mode = modeSel.value;
    const valRaw = valInp.value.trim();
    const note = noteInp.value;
    if (valRaw === '' && note.trim() === '') { setForecast(wk, mId, deptId, null); }
    else { setForecast(wk, mId, deptId, { mode, value: valRaw === '' ? 0 : num(valRaw), note }); }
    saveState(); render();
  };
  view().querySelectorAll('.adj-mode, .adj-val, .adj-note').forEach((c) => {
    c.addEventListener('change', () => commit(c.dataset.dept));
  });
}

function deltaSub(d) {
  if (Math.abs(d) < 0.5) return 'vs budget: flat';
  return `vs budget: <span class="${d >= 0 ? 'pos' : 'neg'}">${d >= 0 ? '+' : ''}${fmtMoney(d)}</span>`;
}

/* -------------------------------------------------------------------------- */
/* Daily distribution tab                                                     */
/* -------------------------------------------------------------------------- */

function renderDaily() {
  const wk = state.activeWeek;
  const mId = pref('dailyMarket', state.markets[0].id);
  const basis = pref('dailyBasis', 'budget');
  const metric = pref('dailyMetric', 'sales');
  const lineFn = basis === 'forecast' ? forecastLine : baseLine;
  const dates = weekDates(wk);

  let html = `
    <div class="panel">
      <div class="section-title"><h2>Daily Distribution</h2>
        <span class="pill">${formatWeekLabel(wk)}</span></div>
      <p class="hint">Weekly totals are spread across the days using each department's day-of-week profile from imported prior-year actuals (or a default grocery pattern until you import).</p>
      <div class="controls">
        <div class="field"><label for="dailyMarket">Market</label>
          <select id="dailyMarket">${marketOptions(mId)}</select></div>
        <div class="field"><label for="dailyBasis">Basis</label>
          <select id="dailyBasis">
            <option value="budget" ${basis === 'budget' ? 'selected' : ''}>Budget</option>
            <option value="forecast" ${basis === 'forecast' ? 'selected' : ''}>Forecast</option>
          </select></div>
        <div class="field"><label for="dailyMetric">Metric</label>
          <select id="dailyMetric">
            <option value="sales" ${metric === 'sales' ? 'selected' : ''}>Sales</option>
            <option value="gross" ${metric === 'gross' ? 'selected' : ''}>Gross</option>
            <option value="labor" ${metric === 'labor' ? 'selected' : ''}>Labor</option>
          </select></div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Department</th>`;
  DAYS.forEach((d, i) => {
    const dt = new Date(dates[i]);
    html += `<th>${d}<br><span class="muted">${dt.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}</span></th>`;
  });
  html += `<th>Weekly Total</th><th>Profile</th></tr></thead><tbody>`;

  const colTotals = DAYS.map(() => 0);
  let weekTotal = 0;
  for (const d of state.departments) {
    const daily = dailyBreakdown(wk, mId, d.id, lineFn);
    const rowTotal = daily.reduce((s, x) => s + x[metric], 0);
    weekTotal += rowTotal;
    const imported = hasImportedDistribution(mId, d.id);
    html += `<tr><td>${esc(d.name)}</td>`;
    daily.forEach((x, i) => { colTotals[i] += x[metric]; html += `<td>${fmtMoney(x[metric])}</td>`; });
    html += `<td><strong>${fmtMoney(rowTotal)}</strong></td>
      <td class="${imported ? 'tag-import' : 'tag-default'}">${imported ? 'imported' : 'default'}</td></tr>`;
  }

  html += `</tbody><tfoot><tr><td>${esc(marketName(mId))} ${metric}</td>`;
  colTotals.forEach((t) => { html += `<td>${fmtMoney(t)}</td>`; });
  html += `<td>${fmtMoney(weekTotal)}</td><td></td></tr></tfoot></table></div>
    <p class="legend"><span class="tag-import">imported</span> = profile derived from your prior-year file ·
       <span class="tag-default">default</span> = generic grocery weekend-weighted pattern (import data to refine).</p>
    </div>`;

  view().innerHTML = html;
  el('dailyMarket').addEventListener('change', (e) => { uiPrefs.dailyMarket = e.target.value; render(); });
  el('dailyBasis').addEventListener('change', (e) => { uiPrefs.dailyBasis = e.target.value; render(); });
  el('dailyMetric').addEventListener('change', (e) => { uiPrefs.dailyMetric = e.target.value; render(); });
}

/* -------------------------------------------------------------------------- */
/* Import tab                                                                 */
/* -------------------------------------------------------------------------- */

function renderImport() {
  let html = `
    <div class="panel">
      <h2>Import Prior-Year Actuals</h2>
      <p class="hint">Upload a CSV of last year's daily actuals. The tool sums each department's actuals by weekday and normalizes them into a day-of-week profile, separately for sales, gross, and labor.</p>
      <div class="callout">
        <strong>Required columns</strong> (header row, any order):
        <div class="code-block mono" style="margin-top:8px">date,market,department,sales,gross,labor</div>
        <ul style="margin:10px 0 0 18px;padding:0">
          <li><code>date</code> — YYYY-MM-DD</li>
          <li><code>market</code> — id (<code>m1</code>…<code>m6</code>) or exact market name</li>
          <li><code>department</code> — id (<code>produce</code>) or exact department name</li>
          <li><code>sales</code>, <code>gross</code>, <code>labor</code> — daily dollars</li>
        </ul>
      </div>
      <p class="hint">Need a template? <a href="sample-data/prior-year-actuals.csv" download>Download the sample CSV</a>.</p>
      <div id="dropzone" class="dropzone">
        <strong>Click to choose a CSV</strong> or drag &amp; drop it here
        <input type="file" id="fileInput" accept=".csv,text/csv" hidden />
      </div>
      <div id="importResult"></div>
    </div>`;

  // Current profiles table
  html += `<div class="panel"><h2>Current Day-of-Week Profiles</h2>`;
  const haveAny = Object.keys(state.distribution).length > 0;
  if (!haveAny) {
    html += `<p class="hint">No profiles imported yet — every department uses the default grocery pattern: ` +
      DAYS.map((d, i) => `${d} ${(DEFAULT_DAY_PROFILE[i] * 100).toFixed(0)}%`).join(' · ') + `.</p>`;
  } else {
    html += `<p class="hint">Sales-share by weekday (each row sums to 100%). Gross and labor profiles are stored separately and used for their respective metrics.</p>
      <div class="table-wrap"><table><thead><tr><th>Market</th><th>Department</th>` +
      DAYS.map((d) => `<th>${d}</th>`).join('') + `<th>Source</th></tr></thead><tbody>`;
    for (const m of state.markets) {
      const md = state.distribution[m.id];
      if (!md) continue;
      for (const d of state.departments) {
        if (!md[d.id]) continue;
        const p = md[d.id].sales;
        html += `<tr><td>${esc(m.name)}</td><td>${esc(d.name)}</td>` +
          p.map((v) => `<td>${(v * 100).toFixed(1)}%</td>`).join('') +
          `<td class="tag-import">${esc(md[d.id].source || 'import')}</td></tr>`;
      }
    }
    html += `</tbody></table></div>`;
  }
  html += `</div>`;

  view().innerHTML = html;

  const dz = el('dropzone'), fi = el('fileInput');
  dz.addEventListener('click', () => fi.click());
  fi.addEventListener('change', () => { if (fi.files[0]) readFile(fi.files[0]); });
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) readFile(f); });
}

function readFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const { distribution, summary } = buildDistributionFromCsv(String(reader.result));
      if (summary.profileCount === 0) {
        showImportResult(`<div class="callout warn">No usable rows found. Check that market/department names match and dates are valid.${unknownNote(summary)}</div>`);
        return;
      }
      applyDistribution(distribution);
      showImportResult(`<div class="callout ok"><strong>Imported.</strong> Built ${summary.profileCount} day-of-week profile(s) from ${summary.rowsUsed} rows${summary.rowsSkipped ? `, skipped ${summary.rowsSkipped}` : ''}.${unknownNote(summary)}</div>`);
      toast('Distribution profiles updated.');
      renderImport(); // refresh the profiles table
    } catch (err) {
      showImportResult(`<div class="callout warn"><strong>Could not import:</strong> ${esc(err.message)}</div>`);
    }
  };
  reader.onerror = () => showImportResult(`<div class="callout warn">Could not read the file.</div>`);
  reader.readAsText(file);
}

function unknownNote(s) {
  let out = '';
  if (s.unknownMarkets && s.unknownMarkets.length)
    out += `<br><span class="muted">Unrecognized markets ignored: ${esc(s.unknownMarkets.join(', '))}.</span>`;
  if (s.unknownDepts && s.unknownDepts.length)
    out += `<br><span class="muted">Unrecognized departments ignored: ${esc(s.unknownDepts.join(', '))}.</span>`;
  return out;
}

function showImportResult(html) {
  const r = el('importResult');
  if (r) r.innerHTML = html;
}

/* -------------------------------------------------------------------------- */
/* Setup tab                                                                  */
/* -------------------------------------------------------------------------- */

function renderSetup() {
  let html = `
    <div class="panel">
      <h2>Markets</h2>
      <p class="hint">Rename your six markets. Names are used in reports and matched against imported files.</p>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Market name</th></tr></thead><tbody>`;
  for (const m of state.markets) {
    html += `<tr><td class="mono muted">${m.id}</td>
      <td><input class="num-input mk-name" style="width:240px;text-align:left" type="text" data-id="${m.id}" value="${esc(m.name)}" /></td></tr>`;
  }
  html += `</tbody></table></div></div>`;

  html += `<div class="panel">
      <h2>Departments &amp; Margin Assumptions</h2>
      <p class="hint">Gross % and Labor % are applied to each department's weekly sales to derive gross profit and labor cost across the Budget, Forecast, and Daily views.</p>
      <div class="table-wrap"><table><thead><tr>
        <th>ID</th><th>Department name</th><th>Gross % of sales</th><th>Labor % of sales</th><th></th></tr></thead><tbody>`;
  for (const d of state.departments) {
    const a = state.assumptions[d.id] || { grossPct: 0, laborPct: 0 };
    html += `<tr>
      <td class="mono muted">${d.id}</td>
      <td><input class="num-input dp-name" style="width:200px;text-align:left" type="text" data-id="${d.id}" value="${esc(d.name)}" /></td>
      <td><input class="num-input dp-gross" type="number" step="0.5" min="0" max="100" data-id="${d.id}" value="${a.grossPct}" /></td>
      <td><input class="num-input dp-labor" type="number" step="0.5" min="0" max="100" data-id="${d.id}" value="${a.laborPct}" /></td>
      <td><button class="btn-ghost danger dp-del" data-id="${d.id}">Remove</button></td>
    </tr>`;
  }
  html += `</tbody></table></div>
    <div class="controls" style="margin-top:14px">
      <div class="field"><label for="newDeptName">New department name</label>
        <input type="text" id="newDeptName" placeholder="e.g. Prepared Foods" /></div>
      <div class="field"><label for="newDeptGross">Gross %</label>
        <input type="number" id="newDeptGross" value="30" step="0.5" /></div>
      <div class="field"><label for="newDeptLabor">Labor %</label>
        <input type="number" id="newDeptLabor" value="10" step="0.5" /></div>
      <button class="btn" id="addDept">Add department</button>
    </div></div>`;

  view().innerHTML = html;

  view().querySelectorAll('.mk-name').forEach((inp) => inp.addEventListener('change', () => {
    const m = state.markets.find((x) => x.id === inp.dataset.id);
    if (m) { m.name = inp.value.trim() || m.id; saveState(); toast('Market renamed.'); }
  }));
  view().querySelectorAll('.dp-name').forEach((inp) => inp.addEventListener('change', () => {
    const d = state.departments.find((x) => x.id === inp.dataset.id);
    if (d) { d.name = inp.value.trim() || d.id; saveState(); render(); }
  }));
  const upd = (cls, key) => view().querySelectorAll(cls).forEach((inp) => inp.addEventListener('change', () => {
    state.assumptions[inp.dataset.id] = state.assumptions[inp.dataset.id] || { grossPct: 0, laborPct: 0 };
    state.assumptions[inp.dataset.id][key] = Math.max(0, num(inp.value));
    saveState(); toast('Assumptions updated.');
  }));
  upd('.dp-gross', 'grossPct');
  upd('.dp-labor', 'laborPct');

  view().querySelectorAll('.dp-del').forEach((btn) => btn.addEventListener('click', () => {
    if (state.departments.length <= 1) { toast('Keep at least one department.'); return; }
    const id = btn.dataset.id;
    if (!confirm(`Remove "${deptName(id)}"? Its budget and forecast entries will be discarded.`)) return;
    state.departments = state.departments.filter((d) => d.id !== id);
    delete state.assumptions[id];
    saveState(); render(); toast('Department removed.');
  }));

  el('addDept').addEventListener('click', () => {
    const name = el('newDeptName').value.trim();
    if (!name) { toast('Enter a department name.'); return; }
    const id = slug(name, state.departments.map((d) => d.id));
    state.departments.push({ id, name });
    state.assumptions[id] = { grossPct: num(el('newDeptGross').value), laborPct: num(el('newDeptLabor').value) };
    saveState(); render(); toast('Department added.');
  });
}

function slug(name, taken) {
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'dept';
  let id = base, n = 2;
  while (taken.includes(id)) id = `${base}-${n++}`;
  return id;
}

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `grocery-budget-${state.activeWeek}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Exported current data as JSON.');
}
