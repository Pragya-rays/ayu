# Ayu

Hindi/Hinglish voice health assistant built on Gnani Prisma (speech-to-text) and Timbre (text-to-speech).

**Prototype · not a medical device · does not replace emergency services. All dispatch is simulated.**

Start with [PLAN.md](PLAN.md): it holds the current status, roadmap, verified API facts, setup and test log.

## Quick start

```
npm install
copy .env.example .env
npm run dev:server
npm run dev:web
```

Run the last two in separate terminals and open http://localhost:5173. Without `GNANI_API_KEY` the app runs in clearly labelled mock mode.

`npm run typecheck` and `npm test` run the checks. `npm run gnani:smoke` tests the live APIs and spends credits.
