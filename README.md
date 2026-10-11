# Ritmo Claro

**See how your running is really going, toward a goal you set yourself.**

Ritmo Claro turns your runs into clear trends: pace, pulse, effort, and how often and how far you run. An open-weight AI reads your history and tells you, in plain Spanish, what the data shows and what to watch next.

## Highlights

- 🎯 **Your goal, your terms.** Any distance, target time, and date. The goal gives context and never hides your runs.
- 📈 **Fair comparisons.** Pace, pulse, and effort are compared only between runs of similar distance.
- 🧠 **Open-weight AI.** Qwen 3.8 27B runs on Cloudflare Workers AI by default; Gemini is optional.
- 🧮 **Calculated first.** Every number is computed in code. If the AI is down or out of quota, you still get a calculated reading.
- 🔒 **Your data.** Try it as a guest with fictional runs, or sign in with Google to keep your runs in a Drive file you own.

## Quick start

```bash
npm install
npm run dev
```

Open the local URL that Wrangler prints. Deploy the Worker with `npm run deploy`.

## Accounts

- **Guest:** example runs stay in this browser. Nothing leaves your device.
- **Google sign-in:** your goal and runs live in one Drive file created by the app. Sign out to return to guest mode.

Google sign-in needs a Client ID set once in `wrangler.jsonc`. See `AGENTS.md` for the implementation rules.

## AI

The Worker calls an open-weight model through Workers AI. To use Gemini on a private instance, set `AI_PROVIDER=gemini` and save the key with `wrangler secret put GEMINI_API_KEY`. API keys never go in browser files or the repository.

Readings are explanations, not advice. They don't prescribe training plans or judge readiness for an event.

## Project map

```text
public/          Interface and browser modules
worker.js        AI route and model prompt
wrangler.jsonc   Cloudflare Worker and static assets
AGENTS.md        Product rules and implementation guide
```

## License

Add a license before publishing.
