# Grocery Market Budget & Forecast Tool

A self-contained, browser-based budgeting tool for a grocery chain. It plans
**Sales, Gross profit, and Labor** for **6 markets**, broken down by
**department**, produces **weekly totals**, lets you make **weekly forecast
adjustments**, and **distributes each weekly total across the days of the
week** using day-of-week trends imported from prior-year actuals.

No install, no server, no build step — open `index.html` in any modern browser.
All data is saved locally in the browser (`localStorage`).

## Quick start

1. Open `index.html` in a browser.
2. **Import Prior-Year Data** tab → upload `sample-data/prior-year-actuals.csv`
   (or your own) to build day-of-week distribution profiles.
3. **Budget** tab → pick a week (top-right) and a market, enter weekly **sales**
   targets per department. Gross and labor are derived automatically.
4. **Forecast** tab → apply weekly `% change` or `$ override` adjustments.
5. **Daily Distribution** tab → see weekly totals spread across Mon–Sun.

## Tabs

| Tab | Purpose |
| --- | --- |
| **Budget** | Enter weekly sales per market/department; gross & labor derived from margin assumptions; rolls up to market and company totals. "Copy previous week" speeds up entry. |
| **Forecast** | Layer weekly adjustments on the budget (% lift/cut or absolute $ override). Gross/labor re-forecast and totals re-distribute. Base-vs-forecast deltas shown. |
| **Daily Distribution** | Spreads weekly Sales/Gross/Labor across each day using imported day-of-week profiles (or a default grocery pattern). Switch between Budget and Forecast basis. |
| **Import Prior-Year Data** | Upload daily actuals CSV → builds per-department, per-metric weekday profiles. Shows the resulting profiles. |
| **Setup** | Rename markets, rename/add/remove departments, and edit each department's Gross % and Labor % of sales. |

## How the numbers work

- **Sales** is the input you budget per market/department/week.
- **Gross $** = Sales × *Gross %* (per-department assumption, editable in Setup).
- **Labor $** = Sales × *Labor %* (per-department assumption, editable in Setup).
- **Contribution** = Gross − Labor.
- **Forecast** applies a weekly adjustment to budgeted sales; gross and labor
  flow from the forecast sales.
- **Daily distribution**: each weekly figure is multiplied by a 7-value
  weekday profile (summing to 100%). Profiles are computed per metric
  (sales/gross/labor) so labor can peak on different days than sales.

### How prior-year trends become daily distribution

For every department, the importer sums the prior-year actuals **by weekday**
across all weeks in the file, then normalizes the seven weekday sums to 100%.
That weekday share is applied to future weekly totals. Summing by weekday and
normalizing makes the profile robust to partial weeks and to however many
weeks of history you provide.

## Prior-year CSV format

Header row required (columns may be in any order):

```
date,market,department,sales,gross,labor
```

| Column | Notes |
| --- | --- |
| `date` | `YYYY-MM-DD` |
| `market` | market id (`m1`…`m6`) or the exact market name |
| `department` | department id (e.g. `produce`) or exact name |
| `sales`, `gross`, `labor` | daily dollar actuals (numbers) |

Rows whose market/department can't be matched are reported and skipped. See
`sample-data/prior-year-actuals.csv` for a working 12-week example covering all
6 markets and 10 departments.

## Default IDs

- **Markets:** `m1` Downtown · `m2` Westside · `m3` Northgate · `m4` Lakeside ·
  `m5` Southpark · `m6` Hillcrest (all renamable in Setup).
- **Departments:** `produce`, `meat`, `seafood`, `deli`, `bakery`, `grocery`,
  `dairy`, `frozen`, `floral`, `hba`.

## Data & privacy

Everything lives in your browser's `localStorage`. Use **Export data (JSON)**
in the footer to back up or move data; **Reset all data** restores defaults.

## Project layout

```
index.html                     # app shell + tab nav
styles.css                     # styling
js/state.js                    # data model, defaults, persistence, week helpers
js/distribution.js             # CSV parsing + day-of-week profile computation
js/calc.js                     # budget & forecast math, daily breakdown
js/ui.js                       # rendering and interaction for all tabs
sample-data/prior-year-actuals.csv   # example import file (12 weeks)
```
