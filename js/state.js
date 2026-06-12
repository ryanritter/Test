/* ==========================================================================
 * state.js — Domain model, defaults, persistence, and shared helpers.
 *
 * Everything lives in a single `state` object that is persisted to
 * localStorage. No build step and no modules so the app runs straight from
 * file:// by loading these scripts in order.
 * ========================================================================== */

/* Days are always handled Monday-first to match retail week conventions. */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DEFAULT_MARKETS = [
  { id: 'm1', name: 'Downtown Market' },
  { id: 'm2', name: 'Westside Market' },
  { id: 'm3', name: 'Northgate Market' },
  { id: 'm4', name: 'Lakeside Market' },
  { id: 'm5', name: 'Southpark Market' },
  { id: 'm6', name: 'Hillcrest Market' },
];

const DEFAULT_DEPARTMENTS = [
  { id: 'produce', name: 'Produce' },
  { id: 'meat',    name: 'Meat' },
  { id: 'seafood', name: 'Seafood' },
  { id: 'deli',    name: 'Deli' },
  { id: 'bakery',  name: 'Bakery' },
  { id: 'grocery', name: 'Grocery' },
  { id: 'dairy',   name: 'Dairy' },
  { id: 'frozen',  name: 'Frozen' },
  { id: 'floral',  name: 'Floral' },
  { id: 'hba',     name: 'Health & Beauty' },
];

/* Default margin assumptions per department: gross profit and labor cost as a
 * percent of sales. These are typical-order-of-magnitude grocery figures and
 * are fully editable in the Setup tab. */
const DEFAULT_ASSUMPTIONS = {
  produce: { grossPct: 35, laborPct: 12 },
  meat:    { grossPct: 28, laborPct: 11 },
  seafood: { grossPct: 30, laborPct: 12 },
  deli:    { grossPct: 45, laborPct: 18 },
  bakery:  { grossPct: 50, laborPct: 16 },
  grocery: { grossPct: 22, laborPct: 6  },
  dairy:   { grossPct: 24, laborPct: 5  },
  frozen:  { grossPct: 27, laborPct: 5  },
  floral:  { grossPct: 48, laborPct: 14 },
  hba:     { grossPct: 38, laborPct: 7  },
};

/* Fallback day-of-week sales pattern used until prior-year actuals are
 * imported. Weekends are heavier, as is typical for grocery. Sums to 1. */
const DEFAULT_DAY_PROFILE = [0.12, 0.11, 0.12, 0.13, 0.16, 0.20, 0.16];

const STORAGE_KEY = 'grocery-budget-tool/v1';

let state = null;

/* -------------------------------------------------------------------------- */
/* Week helpers                                                               */
/* -------------------------------------------------------------------------- */

/* Returns the Monday (local time) of the week containing `d` as YYYY-MM-DD. */
function weekStart(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const dow = (date.getDay() + 6) % 7; // 0 = Monday
  date.setDate(date.getDate() - dow);
  return isoDate(date);
}

function isoDate(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* Day-of-week index with Monday = 0. */
function mondayIndex(d) {
  return (new Date(d).getDay() + 6) % 7;
}

/* The seven YYYY-MM-DD dates of the week starting at `weekKey`. */
function weekDates(weekKey) {
  const start = new Date(weekKey);
  return DAYS.map((_, i) => {
    const dt = new Date(start);
    dt.setDate(dt.getDate() + i);
    return isoDate(dt);
  });
}

function formatWeekLabel(weekKey) {
  const dates = weekDates(weekKey);
  const fmt = (s) => {
    const dt = new Date(s);
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  return `${fmt(dates[0])} – ${fmt(dates[6])}, ${new Date(weekKey).getFullYear()}`;
}

/* -------------------------------------------------------------------------- */
/* State lifecycle                                                            */
/* -------------------------------------------------------------------------- */

function defaultState() {
  return {
    markets: clone(DEFAULT_MARKETS),
    departments: clone(DEFAULT_DEPARTMENTS),
    assumptions: clone(DEFAULT_ASSUMPTIONS),
    budget: {},        // budget[weekKey][marketId][deptId] = { sales }
    forecast: {},      // forecast[weekKey][marketId][deptId] = { mode, value, note }
    distribution: {},  // distribution[marketId][deptId] = { sales:[7], gross:[7], labor:[7], source }
    activeWeek: weekStart(new Date()),
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = Object.assign(defaultState(), JSON.parse(raw));
    } else {
      state = defaultState();
    }
  } catch (e) {
    console.warn('Could not load saved data, starting fresh.', e);
    state = defaultState();
  }
  return state;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save data.', e);
  }
}

function resetState() {
  state = defaultState();
  saveState();
}

/* -------------------------------------------------------------------------- */
/* Lookups & small utilities                                                  */
/* -------------------------------------------------------------------------- */

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function marketName(id) {
  const m = state.markets.find((x) => x.id === id);
  return m ? m.name : id;
}

function deptName(id) {
  const d = state.departments.find((x) => x.id === id);
  return d ? d.name : id;
}

/* Day-of-week profile for a market/department/metric, falling back to the
 * generic grocery pattern when no prior-year data has been imported. */
function dayProfile(marketId, deptId, metric) {
  const md = state.distribution[marketId];
  if (md && md[deptId] && md[deptId][metric]) return md[deptId][metric];
  return DEFAULT_DAY_PROFILE;
}

function hasImportedDistribution(marketId, deptId) {
  return !!(state.distribution[marketId] && state.distribution[marketId][deptId]);
}

function fmtMoney(n) {
  if (n == null || isNaN(n)) n = 0;
  return n.toLocaleString(undefined, {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  });
}

function fmtPct(n) {
  if (n == null || isNaN(n)) n = 0;
  return `${n.toFixed(1)}%`;
}

function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}
