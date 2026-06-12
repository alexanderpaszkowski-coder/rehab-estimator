# Rehab Estimator

A web app modeled from the Rehab Scope of Work spreadsheet — property funnel, fast screening, estimates, scope of work, and budget tracking.

## Features

- **Property funnel** — Kanban board with source labels (Auction.com, MLS, Off Market, etc.)
- **Quick screening** — Available for sale, target area, title, motivation, ARV/ask on intake
- **Home files** — Each address gets its own saved project
- **Property Inputs** — Measurements, counts, finish grade, contingency
- **Quick Estimate** — Rate systems None/Light/Moderate/Heavy during walkthrough
- **Scope of Work** — 139 line items with estimate, bid, and actual tracking
- **Budget Summary** — Trade rollups and cross-checks vs quick estimate
- **PDF export** — Download a full report per property
- **Cloud sync** — Sync across devices with a shared workspace ID
- **JSON export/import** — Portable backup per address

## Run locally

```bash
cd rehab-estimator
npm install
npm run dev:all    # starts app + sync server
```

Open http://localhost:5173

Or run separately:
```bash
npm run server   # sync API on :3847
npm run dev      # app on :5173
```

## Cloud sync

1. Enter a **Workspace ID** in the sidebar (e.g. `my-flip-team`)
2. Click **Sync** — merges local + cloud data
3. Use the same ID on any device/browser
4. Auto-syncs 3 seconds after each save (when workspace ID is set)

Data is stored in `server/data/{workspace-id}.json` locally. Deploy the server to Railway/Render for real cloud access.

## Workflow

1. **Funnel** — Add property → address → source → screening questions
2. **Lead / Screen** — Edit funnel details, move pipeline stage
3. **Property Inputs** — Measurements once per property
4. **Quick Estimate** — Pre-offer ballpark (5 min walkthrough)
5. **Scope of Work** — Post-contract line items for bids
6. **Summary** — Variance tracking, benchmarks, PDF export

## PDF export

Click **PDF** in the property header to download a report with property overview, quick estimate, budget summary, and active SOW line items.
