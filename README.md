# Ayu

A Hindi, Hinglish and English voice health assistant, built on Gnani **Prisma** (speech to text) and **Timbre** (text to speech).

**Not a medical device, and it does not replace emergency services. All dispatch is simulated.**

**Live:** https://ayu-4801.onrender.com · dashboard at `/dashboard`, driver view at `/driver`

- **SOS:** one tap shares your location and raises a simulated ambulance request. Ayu triages by voice, reads back your location, and stays with you until arrival.
- **Normal mode:** a short voice conversation for everyday problems that spots warning signs.
- **Hospital side:** live cases, transcript, timeline and a one-line pre-arrival brief.

First-aid and home-care content comes from published guidance, listed in each file, and has not been reviewed by a doctor.

[PLAN.md](PLAN.md) holds the status, decisions, verified API facts and test log. The write-up is in [docs/submission](docs/submission/WRITEUP.md).

## Run it

Needs Node 22 or later.

```
npm install
copy .env.example .env
npm run dev:server
npm run dev:web
```

Run the last two in separate terminals, then open http://localhost:5173. With no `GNANI_API_KEY` the app runs in a labelled mock mode. With no `GEMINI_API_KEY` it runs on rules alone.

## Checks

| Command | Does | Spends credits |
|---|---|---|
| `npm run typecheck`, `npm test` | Types and automated tests | No |
| `npm run gnani:smoke` | Live Prisma and Timbre check | A little |
| `npm run eval:triage -w server` | Emergency scenarios through the SOS logic | Gemini only |
| `npm run eval:synthetic -w server` | Noisy-call scorecard | Yes |
| `npm run gen:audio -w server -- missing` | Generates audio for new fixed lines | Per line |

Rerun `gen:audio` after changing any fixed line, script or voice setting.
