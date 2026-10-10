# Ritmo Claro

A small web demo for exploring personal running progress. Metrics and charts are calculated in the browser. When a runner requests an interpretation, the app sends the calculated summary and related run notes to the Worker.

## Project map

```text
public/
  index.html              Page structure and stylesheet link
  css/app.css             Shared styles and visual tokens
  js/
    app.js                Module entry point for app features
    data/format.js         Shared date and pace formatting
    data/goal-store.js     Editable goal and comparable-distance selection
    data/sample-runs.js   Fictional example runs
    data/run-store.js     Run history storage and read/write operations
    demo-data.js          Dashboard summary, run list, and run-entry interactions
    analytics-tools.js    Chart-summary rendering
    analytics/summary.js  Reproducible run comparisons, separate from the UI
    analytics/comparable-runs.js  Best-supported similar-distance group
    goal.js               Goal editor and goal summary
    dashboard.js          Charts, cards, and dashboard interactions
    csv-import.js         CSV import and template download
    ai-analysis.js        AI provider request and interpretation UI
worker.js                 Cloudflare API and model connection
wrangler.jsonc            Cloudflare configuration
package.json              Local development and formatting commands
AGENTS.md                 Product and implementation rules for coding agents
```

The app loads its features as ES modules with explicit imports. `data/run-store.js` owns browser persistence and exposes small list, sort, and add operations. `data/goal-store.js` stores the runner's editable distance, time, and date goal; the goal is context and does not filter logged runs. `analytics/comparable-runs.js` selects similar recorded distances for fair pace comparisons. Pace and speed are derived from distance and duration. Optional effort, elevation gain, and app-reported calorie estimates are stored separately; feeling and perceived effort are distinct. The carousel shows pace, speed, the distance of each run, weekly run days, pulse, and perceived effort. One AI request reads the whole history against the runner's goal, together with pace, pulse, effort, and notes, and says in plain Spanish whether that pattern is going better, going worse, or faster at a higher cost. The global reading appears once below the chart carousel and stays available while the runner explores charts. `demo-data.js` renders five recent runs first and appends five more as the runner scrolls the history list. CSV import and AI analysis use their dependencies directly; there is no global compatibility adapter. This version has no UI framework or runtime library.

The demo does not collect age, weight, sex, or gender. Its current personal-progress comparisons do not have a justified use for those fields.

## Run locally

1. Install Node.js.
2. Run `npm install` once.
3. Run `npm run dev` to serve the app and Worker locally.
4. Run `npm run format` to keep source files readable.

Use `npm run deploy` when you are ready to deploy the Worker.

## Default model

The Worker uses Qwen 3.8 27B, an open-weight model, through Cloudflare Workers AI. Workers AI has a daily quota on the Free plan and rejects requests after it is exhausted. Quotas and prices can change, so check the account settings before deployment.

The app shows a locally calculated fallback if the Worker fails or its quota runs out. Reproducible tools calculate comparisons; the model explains those results and can relate them to run notes. A pattern in the history does not establish causation, and the example runs are fictional.

## Optional private Gemini connection

The UI does not expose a provider selector. For a private instance, configure `AI_PROVIDER` and `GEMINI_MODEL` in Cloudflare and save the key with `wrangler secret put GEMINI_API_KEY`. Never put API keys in browser files or in the repository.
