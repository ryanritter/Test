/* ==========================================================================
 * distribution.js — Import prior-year actuals and derive the day-of-week
 * distribution profiles used to spread weekly budget totals across days.
 *
 * Expected CSV columns (header row required, order-independent):
 *   date,market,department,sales,gross,labor
 *     date       YYYY-MM-DD
 *     market     market id ("m1") or market name ("Downtown Market")
 *     department department id ("produce") or name ("Produce")
 *     sales/gross/labor  numeric dollars for that day
 *
 * Method: for each market/department/metric we sum actuals by weekday across
 * every week in the file, then normalize the seven weekday sums so they total
 * 1. That weekday share is the profile applied to future weekly totals — it is
 * robust to partial weeks and varying numbers of weeks of history.
 * ========================================================================== */

/* Minimal CSV parser supporting quoted fields and embedded commas. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (field !== '' || row.length) { row.push(field); rows.push(row); }
      row = []; field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* Resolve a market/department cell (id or name) to a known id, or null. */
function resolveId(list, raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return null;
  const hit = list.find(
    (x) => x.id.toLowerCase() === key || x.name.toLowerCase() === key
  );
  return hit ? hit.id : null;
}

/* Parse a CSV string of prior-year actuals into distribution profiles.
 * Returns { distribution, summary } without mutating global state. */
function buildDistributionFromCsv(text) {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length < 2) throw new Error('File has no data rows.');

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const ci = {
    date: col('date'), market: col('market'), dept: col('department'),
    sales: col('sales'), gross: col('gross'), labor: col('labor'),
  };
  for (const [k, v] of Object.entries(ci)) {
    if (v === -1) throw new Error(`Missing required column: "${k === 'dept' ? 'department' : k}".`);
  }

  // accum[marketId][deptId][metric] = number[7] (weekday sums, Mon-first)
  const accum = {};
  let used = 0, skipped = 0;
  const unknownMarkets = new Set(), unknownDepts = new Set();

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const mId = resolveId(state.markets, cells[ci.market]);
    const dId = resolveId(state.departments, cells[ci.dept]);
    if (!mId) { unknownMarkets.add((cells[ci.market] || '').trim()); skipped++; continue; }
    if (!dId) { unknownDepts.add((cells[ci.dept] || '').trim()); skipped++; continue; }

    const dateStr = (cells[ci.date] || '').trim();
    const dt = new Date(dateStr);
    if (isNaN(dt.getTime())) { skipped++; continue; }
    const wd = mondayIndex(dt);

    accum[mId] = accum[mId] || {};
    accum[mId][dId] = accum[mId][dId] || {
      sales: zeros7(), gross: zeros7(), labor: zeros7(),
    };
    accum[mId][dId].sales[wd] += num(cells[ci.sales]);
    accum[mId][dId].gross[wd] += num(cells[ci.gross]);
    accum[mId][dId].labor[wd] += num(cells[ci.labor]);
    used++;
  }

  const distribution = {};
  let profileCount = 0;
  for (const mId of Object.keys(accum)) {
    distribution[mId] = {};
    for (const dId of Object.keys(accum[mId])) {
      const a = accum[mId][dId];
      distribution[mId][dId] = {
        sales: normalize(a.sales),
        gross: normalize(a.gross),
        labor: normalize(a.labor),
        source: 'import',
      };
      profileCount++;
    }
  }

  return {
    distribution,
    summary: {
      rowsUsed: used,
      rowsSkipped: skipped,
      profileCount,
      unknownMarkets: [...unknownMarkets].filter(Boolean),
      unknownDepts: [...unknownDepts].filter(Boolean),
    },
  };
}

function zeros7() { return [0, 0, 0, 0, 0, 0, 0]; }

/* Normalize 7 weekday sums to fractions of 1. Falls back to the default
 * pattern when a metric has no positive data (e.g. labor not supplied). */
function normalize(arr) {
  const total = arr.reduce((s, v) => s + v, 0);
  if (total <= 0) return DEFAULT_DAY_PROFILE.slice();
  return arr.map((v) => v / total);
}

/* Merge freshly computed profiles into state (replacing matching entries). */
function applyDistribution(distribution) {
  for (const mId of Object.keys(distribution)) {
    state.distribution[mId] = state.distribution[mId] || {};
    Object.assign(state.distribution[mId], distribution[mId]);
  }
  saveState();
}
