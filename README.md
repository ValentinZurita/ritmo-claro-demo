# Ritmo Claro

**See how your running is really going, toward a goal you set yourself.**

![Ritmo Claro dashboard](docs/screenshot.png)

Ritmo Claro turns your logged runs into trends you can trust: pace, pulse, effort, and how often and how far you run. You set the goal, any distance, time, and date. The app calculates every number in code, and an AI coach explains what the history shows in plain English or Spanish.

The interface and global AI reading follow your browser's English or Spanish preference. Other browser languages default to Spanish.

## What it does

- **Like-for-like trends.** Pace, pulse, and effort are compared only across runs of similar distance.
- **Your goal as context.** It frames the history and never hides a run.
- **An AI coach.** One reading of your history, written by an open-weight model. It describes the evidence and its limits; it never prescribes training or judges readiness for an event.
- **Works without the AI.** If the model is down or out of quota, you still get a calculated reading.

## How the AI works

The Worker sends the calculated results and recent notes to **Qwen 3.8 27B**, an open-weight model on Cloudflare Workers AI. The model explains those results; it does not calculate them. You can switch to Gemini on a private instance by setting `AI_PROVIDER=gemini` and saving the key with `wrangler secret put GEMINI_API_KEY`. API keys never go in the browser files or the repository.

## Run it

```bash
npm install
npm run dev
```

Deploy the Worker with `npm run deploy`.

## Accounts

Without an account, the app runs on fictional example runs stored in this browser. **Continue with Google** creates a Drive file that holds your goal and runs. Google sign-in needs a public OAuth Client ID in `GOOGLE_CLIENT_ID` (`wrangler.jsonc`).

## Built with

Cloudflare Workers · Workers AI · Google Drive · vanilla JavaScript
