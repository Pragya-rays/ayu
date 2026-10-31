# AYU — PLAN.md

**The project's permanent development log and single source of truth for progress.**
Scope and product decisions live in [docs/AYU_PROJECT_SUMMARY.md](docs/AYU_PROJECT_SUMMARY.md); implementation detail in [docs/AYU_DEV_GUIDE.md](docs/AYU_DEV_GUIDE.md). If those docs conflict with section 4 below, section 4 wins on Gnani API facts because it was read from the live docs.

**Last updated:** 2026-10-31 · **Deadline:** 2026-11-10, 11:59 PM IST (target: submit Nov 9)

---

## 1. Current status

| | |
|---|---|
| **Current phase** | Phase 3, SOS Brain. Phase 2 accepted by the team with open items R16 and R17 |
| **Phase state** | Built and tested locally on real Gnani and Gemini. **Not deployed; https://ayu-4801.onrender.com still runs Phase 2** |
| **Real Gnani API tested?** | **Yes.** Smoke test 5/5, real voice on laptop Chrome (quiet room), SOS opening line in a browser run. SOS listening with real speech, noise and phones are not tested. See sections 6 and 12 |
| **Next action** | Team adds `GEMINI_API_KEY` on Render and approves the push, then tests Phase 3 on a phone |
| **Blocked on** | Team approval to push, medical reviewer's qualification (D9), award and posting decisions (D3, D4), noisy clips before Phase 4 |

### If you are an AI agent resuming this project
1. Read this section, then sections 3, 4, 10 and 11, then the current phase in section 7.
2. Read `docs/AYU_PROJECT_SUMMARY.md` and `docs/AYU_DEV_GUIDE.md`.
3. Run `npm install`, `npm run typecheck`, `npm test` to confirm the state matches this file.
4. Never start the next phase until the team has validated the current one.
5. Update this file at the end of every phase, and whenever reality changes.

**Status words used here.** `Built` = code exists. `Tested (mock)` = automated or browser test passed without real Gnani. `Tested (live)` = worked against real Gnani. `Validated` = the team tested it and accepted it. A feature is **Done** only when Tested (live) where Gnani is involved, and Validated.

---

## 2. Project in brief

Ayu is a Hindi/Hinglish-first, voice-first health assistant (mobile PWA). **Normal mode** handles everyday health questions. **SOS mode** is one tap to share location, open a **simulated** dispatch case, and be talked through fixed, doctor-reviewed first-aid steps until help arrives. A hospital dashboard shows live cases with a pre-arrival brief.

**The two core engines are Gnani Prisma (STT) and Timbre (TTS).** Every user interaction passes through them; the rest of the system exists to decide what Ayu hears and says. Gemini is bounded support only.

**Must always stay simulated:** ambulance, dispatch, driver, ETA, emergency-contact alerts, hospital and 112 integration. No real ambulance is ever contacted. The UI and write-up must label this clearly.

---

## 3. Working rules (from the team, 2026-10-31)

1. Work phase by phase: scope, build, test, fix, update this file, then **stop for team review**.
2. Never mark anything complete unless it is implemented and tested. Never fake functionality.
3. No new integrations, services, APIs or dependencies without team agreement. Stack listed in the Dev Guide counts as agreed; anything else goes to section 10 first.
4. No major features or direction changes on our own. Suggest them in section 10 and wait.
5. Do not rewrite working code unnecessarily. Avoid feature bloat.
6. Keep env vars, keys, setup and deployment steps current (section 8).
7. End every phase by stating what was built, how to test it, what remains and what needs validating.
8. Every decision should serve the real-world problem or the submission.

Safety rules from the Dev Guide section 0 always apply. Above all: the LLM never writes medical instructions, SOS text comes only from `protocols/*.json`, and keys stay server-side.

---

## 4. Verified Gnani facts (read from docs.gnani.ai, 2026-10-31)

Docs read, not yet proven live. Pricing per minute or character and account concurrency are **not published**; check app.gnani.ai/voice.

### Common
- Base: `https://api.vachana.ai` (WebSocket `wss://`). Auth header `X-API-Key-ID`. One key covers STT and TTS. Keys from `app.gnani.ai/voice/`.
- Errors: 401 key, 402 out of credit, 403 scope, 429 rate limited (no `Retry-After`; back off 0.5/1/2 s).
- **Some accounts allow only 1 active request at a time** (429, "Only 1 active request is allowed at a time").

### Prisma (STT)
- REST `POST /stt/v3` (max 30 s). Realtime `wss://api.vachana.ai/stt/v3/stream`. Config goes in **upgrade headers**, so browsers cannot connect directly; our backend must proxy.
- Models: `prisma-v2.5` (default), `prisma-v3.0` (opt-in, released 2026-10-22). v3.0 adds `format=codemix` (English stays Latin), `transliterate`, `keyterms` (up to 200), language hint lists like `hi-IN,en-IN`, and `indic-auto`.
- Audio: 16-bit mono PCM, **exactly 1024-byte frames**, at real-time pace. 8 or 16 kHz. Bursting degrades VAD.
- Flow: `connected`, `speech_start`, `processing`, `transcript`. VAD is server-side: `x-min-silence-ms` (default 500), `x-min-speech-ms`, `x-min-segment-ms` (too high **silently drops short answers**). `{"type":"commit"}` closes an utterance immediately.
- **Transcripts are final-only. There are no partial results.**
- Limits: 15-minute session cap (close 1001), idle timeout 60 s default (5-900), concurrent sessions capped per organisation (number not published). Bad handshake closes 1008.

### Timbre (TTS)
- REST `POST /api/v1/tts/inference` (binary), SSE `/api/v1/tts/sse`, WebSocket `wss://api.vachana.ai/api/v1/tts`.
- Models: `timbre-v2.5` (42 voices), `timbre-v3.0` (13 voices, audio tags). v2.0 is being deprecated.
- **Hinglish (`hi-en`) exists only on v2.5, and only with voice `Poorvi`.** v3.0 has no Hinglish.
- `speed` 0.85-1.15. Output: 8-48 kHz, `raw` / `wav` / `mp3` / `ogg` / `mulaw` / `alaw`. WebSocket returns ordered base64 chunks, then `complete`.
- **No cancel message is documented.** Interrupting means closing the socket and stopping client playback.
- Text normalisation is automatic (numbers, dates). Max input length is not published.

### What this changes in the Dev Guide
| Dev Guide assumed | Reality | Effect on Ayu |
|---|---|---|
| Partial transcripts (`transcript.partial`), live line under the orb | Final-only | UI shows "hearing you" from `speech_start`, then the full sentence. No word-by-word text |
| Our server does endpointing | Prisma does VAD | Tune Prisma headers. Set `x-min-silence-ms` to 800 |
| Separate Prisma and Timbre keys | One key | `GNANI_API_KEY` only |
| Sample rate unknown | 16 kHz supported | Browser audio goes at 16 kHz; 8 kHz reserved for telephony-noise evaluation |
| Barge-in stops the TTS stream | No cancel | Barge-in uses `speech_start` + stop playback + close socket |
| Long SOS sessions just work | 15-minute cap | Must reconnect Prisma silently during SOS (Phase 4) |
| Hinglish as a TTS language generally | v2.5 + Poorvi only | Pins Timbre to v2.5 for Hinglish; v3.0 only as an option for Hindi/English |
| Short answers "haan"/"nahi" are easy | May be dropped by VAD | Triage must test one-word answers early; Yes/No buttons stay as fallback |

### Found on the live API (2026-10-31), overrides the docs
- **Streaming rejects a language list** (`hi-IN,en-IN`): "exactly one locale is required... Use multi_lang_codes for parallel multi-locale transcription." We send one locale; `codemix` handles mixed speech. `multi_lang_codes` is undocumented and unused.
- `connected.config` includes `partials_enabled: false`, `partial_interval_ms: 450`, `partial_max_window_s: 15`. **Partials may exist but are undocumented.** Worth asking Gnani; live text would help the demo and could cut latency. Not used until confirmed.
- `hi-en` with `Poorvi` on `timbre-v2.5` works.

### Doc inconsistencies still open
- Realtime headers: reference page says `language_code` / `model` / `format`; v3.0 changelog says `lang_code` / `x-model` / `x-format`. We send both spellings (`TODO(verify)` in `server/src/adapters/prisma.ts`). The live `connected.config` reports `language_code` and `format`, and a detected language is returned, which the docs list as v3.0-only, so v3.0 appears active. Which spelling is honoured is untested.

---

## 5. Verified challenge facts (read from gnani.ai/internship, 2026-10-31)

These differ from or add to the Project Summary.

- **Award names:** the target "Real World Impact" is actually **Real Deal** ("most useful real-world problem solved"; rural health workers are a listed example). Others relevant to us: **Mixed Vibes** (code-mixed voice), **Noise Canceller** (noisy real telephonic audio), **Two-Person Army**, **Demo Day Drop** (best **60-second** video), **Small Town, Big Build** (Tier 2/3 college or city), **Crowd Favourite** (public votes). Max one award per entrant. Healthcare is not its own category.
- **Internship shortlisting is driven by verified post engagement.** The published steps are engagement check, eligibility check, then "eligible projects with the strongest verified engagement", then interviews. Purchased votes, bots and engagement exchanges are excluded.
- **Mandatory submission items:** working app shown in a public video; project title, problem, target users, Gnani models used, each member's contribution; a demo video; a public LinkedIn or X post **live before submission**, tagging Gnani AI with `#GreatIndianAIInternshipChallenge` and `#GnaniAI`; one nominated link per platform.
- **Eligibility:** enrolled at an Indian college, 18+. Both teammates must qualify; teammate must accept terms.
- **Evon v3.3 is not on the API platform**, so Gnani's own LLM is not available to us that way. Gemini stays (Open Question 3 is effectively answered).
- Prisma v3.0 and Timbre v3.0 are listed as newer releases. Using them is allowed; name each model used in the submission.

---

## 6. Live Gnani verification log

Second run of `npm run gnani:smoke`, after the language fix (first run: 3/5). Input was clean Timbre speech, so these are best-case numbers, not noisy-call results.

| Check | Date | Result | Notes |
|---|---|---|---|
| Timbre stream (first-audio latency) | 10-31 | **PASS** | 776-784 ms, with a new socket per request |
| Timbre REST | 10-31 | **PASS** | 1.5-2.0 s for one sentence |
| Prisma REST | 10-31 | **PASS** | "petrol pump" stayed Latin. Without keyterms, Gomti Nagar heard once as "गोमती नागर" |
| Prisma stream (full utterance) | 10-31 | **PASS** | "मेरे पापा गिर गए हैं, Gomti Nagar में petrol pump के पास हैं।" 434 ms after speech end. With keyterms, landmark was correct |
| **Timbre during open Prisma session** | 10-31 | **PASS** | First audio 574 ms. R1 cleared for one session |
| Noisy-clip spike, 4 configs | | not run | Decides `PRISMA_MODEL`, `PRISMA_FORMAT`, keyterms |
| Credits used per minute of STT / per TTS request | | not run | Read from the dashboard after the smoke test |

---

## 7. Roadmap

Dates follow the summary timeline, shifted to today. Each phase ends with a team review.

### Phase 1 — Voice Foundation (Oct 31 – Nov 1) · **IN REVIEW**
**Goal:** prove the Prisma and Timbre loop through our backend, on a phone-shaped UI.

| Item | Status |
|---|---|
| Monorepo (npm workspaces), env handling, `.gitignore`, git initialised (no commits yet) | Built |
| Shared types: voice protocol, Case and CaseEvent model | Built |
| Prisma adapter + mock | Tested (live, synthetic speech) |
| Timbre adapter + mock | Tested (live) |
| Voice gateway `/ws/voice/:id`, health route, session and credit guards | Tested (mock) |
| Browser mic capture: 16 kHz, exact 1024-byte frames | Tested in Chrome with fake mic |
| Streaming playback | Tested (live), heard clearly by a team member on laptop Chrome. Stopping mid-sentence not yet tried by a person |
| Half-duplex mic gate (prevents Ayu transcribing itself) | Tested in Chrome |
| Barge-in toggle (`speech_start` stops playback) | Built. Server stop is tested; **full browser barge-in is not** |
| Consent screen, Home, Voice Check; Hindi / Hinglish / English via i18n | Tested in Chrome (390 px) |
| PWA manifest and icon | Built. Service worker is deferred to Phase 7 |
| `gnani:smoke` script | Tested (live), 5/5 |
| `gnani:spike` script | Built. **Never run**, needs clips |

**Exit criteria (team to complete):**
- [x] Add `GNANI_API_KEY` to `.env`, run `npm run gnani:smoke`, record results in section 6
- [ ] Remove the key from `.env.example`, and replace the key before Phase 2 deployment (it was exposed in an AI session)
- [x] Voice Check in real voice mode on laptop: speak Hinglish, see the transcript, hear Timbre repeat it (10-31, quiet room)
- [ ] Deferred by the team 10-31, **must happen before Phase 4**: record 3 noisy clips into `eval/audio`, run `npm run gnani:spike`, choose the Prisma config
- [ ] Moved to Phase 2, once Render gives us HTTPS: try on a real Android and a real iPhone
- [ ] Review Home and consent look, and Hindi/Hinglish wording

### Phase 2 — SOS Skeleton + Live Dashboard (Nov 1 – 2) · **IN REVIEW**
**Goal:** one tap creates a real case that appears on a second device.

| Item | Status |
|---|---|
| SOS tap, 3-second countdown, big Cancel | Tested (Chrome, 390 px) |
| GPS capture from the moment of tap; never blocks dispatch | Tested with simulated GPS. **Not tested on a real phone GPS** |
| Case + simulated dispatch created immediately, event timeline | Tested |
| First spoken line, in-memory cached, warmed at server start | Tested (live) in headless Chrome: audio delivered, 747 ms countdown end to first audio. **Not yet heard in SOS by a person** |
| Dark SOS screen, Call 112, SIMULATED tag, wake lock | Tested in Chrome except wake lock (phones only) |
| Case store (in memory), SSE feed, dashboard live list | Tested across two browser contexts |
| Dashboard password, private case API | Tested |
| Failure paths: GPS denied, mic denied, server lost | Tested in Chrome |
| Cancel SOS after activation, closes voice session | Tested |
| Public-link guards: Voice Check off in production, voice only for active cases, SOS rate limit, active-case cap | Tested |
| `render.yaml`, Render deployment | Tested (live) at https://ayu-4801.onrender.com with desktop Chrome: 12/12 checks |
| Barge-in during SOS, triage, answers to speech | Not in this phase. Ayu listens and logs what it hears but does not respond yet |

**Exit criteria (team to complete):**
- [x] Push to a **public** GitHub repo (team decision 10-31)
- [x] Replace the Gnani key (10-31, smoke test 5/5 on the new key)
- [x] Deploy on Render, set `GNANI_API_KEY` and `DASHBOARD_SECRET` (10-31: https://ayu-4801.onrender.com)
- [x] SOS on a real phone appears on a laptop dashboard over HTTPS, with real GPS (iPhone XR Safari, ±7 m)
- [x] Hear the opening line; transcript shows your speech (Hinglish on iPhone; Hindi and English lines not separately checked)
- [x] Try cancel; reaches the dashboard
- [ ] Carried forward: confirm the dashboard map pin matches the real location (R16)
- [ ] Carried forward: test on a real Android phone
**Tester warning:** the Call 112 button opens the real dialer. Do not press Call on the phone during testing.

### Phase 3 — SOS Brain (Nov 2 – 3) · **IN REVIEW**
**Goal:** the right fixed protocol for the right situation.

| Item | Status |
|---|---|
| Gemini adapter, strict schema validation, fallback to rules | Tested (live) |
| Rule-based reading of Hindi/Hinglish answers and facts, works without the LLM | Tested |
| Table-driven triage rules | Tested. **Needs medical review** |
| 7 protocol files, validator, startup fails on bad or missing files | Tested. **All are placeholders with no first-aid text** |
| SOS conversation: opening, two questions, protocol, Call 112 line on RED | Tested (live) in Chrome using buttons |
| Yes / No / Not sure buttons, silence prompt, retry then move on | Tested |
| Protocol switch when a caller reports a change | Tested in unit tests |
| Severity on phone, triage and protocol on dashboard | Tested (live) |
| Answering by real voice on a phone | **Not tested** |
| Deployment of Phase 3 | **Not deployed**; needs `GEMINI_API_KEY` on Render and a push |

**Exit criteria (team to complete):**
- [ ] Add `GEMINI_API_KEY` on Render, then push
- [ ] Run SOS on the phone answering by voice ("nahi", "haan") and by buttons
- [ ] Say a full sentence (try a choking or chest pain case) and check the protocol on the dashboard
- [ ] Confirm the map pin (R16) and try Android (R17)
- [ ] Decide who reviews the rules and protocols (D9)

### Phase 4 — SOS Live Loop (Nov 3 – 4)
**Goal:** the voice stays useful until help arrives. Location read-back, landmark/floor/gate fallback, verified/updated flags; dispatch accept, ETA, status, 60-second no-ack "call 112"; status + filler + re-check loop under the priority rules; barge-in; silent Prisma reconnect before the 15-minute cap; failure paths (STT empty, LLM timeout, TTS failure, GPS denied).
**Exit:** a full simulated emergency runs from tap to arrival, including the no-ack path.

### Phase 5 — Normal Mode (Nov 4)
**Goal:** safe everyday conversation. One question at a time, reviewed home-care library, cautious wording, red-flag detection with Switch to SOS, summary card.
**Exit:** N1, N2, N3 scripts pass; no diagnosis or medicine advice appears.

### Phase 6 — Dashboard Complete (Nov 5)
**Goal:** convincing for the hospital side. Case detail, timeline, transcript, extracted fields, ER brief, accept and status actions, driver view.
**Exit:** two-device demo stays in sync; brief is template-constrained.

### Phase 7 — Safety, Resilience, Polish (Nov 5 – 6)
**Goal:** trustworthy and instant. Doctor review replaces placeholders and shows reviewer + sources; pre-generated Timbre audio for all fixed lines; service worker and offline SOS; Tier 2 items (metrics, Medical ID, emergency-contact link); native-speaker review of Hindi/Hinglish.
**Exit:** airplane-mode SOS plays guidance; no placeholder text ships.

### Phase 8 — Evaluation (Nov 7 – 8)
**Goal:** honest proof. 15-20 consented scripted calls across noise, language and speaker; scorecard with failures and fixes; 5-10 user trials; real-device QA checklist; fix top failures.
**Exit:** `eval/results/scorecard.md` exists with real numbers.

### Phase 9 — Submission (Nov 9; Nov 10 is buffer)
**Goal:** a complete entry. Final deployment, 60-second demo plus longer walkthrough if useful, write-up with simulated-vs-real table and limitations, members' contributions, nominated public posts, backup recording, submit.

**Cut order if late:** Tier 3, emergency contact, Medical ID, interrupt polish, extra protocols. Keep CPR, chest pain, stroke/collapse.

---

## 8. Technical reference

### Run it
```
npm install
copy .env.example .env      # add GNANI_API_KEY for real voice; without it the app runs in MOCK mode
npm run dev:server          # terminal 1, http://localhost:8787
npm run dev:web             # terminal 2, http://localhost:5173 (open this)
```
Production-style: `npm run build`, then `npm run start` serves everything on port 8787.
Checks: `npm run typecheck`, `npm test`. Live checks that **spend credits**: `npm run gnani:smoke`, `npm run gnani:spike`.

### Code map
| Path | Purpose |
|---|---|
| `server/src/adapters/` | `prisma.ts`, `timbre.ts`, `mocks.ts`, `types.ts` (STTAdapter, TTSAdapter), `index.ts` picks real or mock |
| `server/src/voice/gateway.ts` | Per-session bridge between browser, Prisma and Timbre. A session is an SOS case, or Voice Check when the lab is on |
| `server/src/cases/store.ts` | In-memory cases, event timeline, change notifications |
| `server/src/dialogue/` | `sosMachine.ts` (SOS conversation), `triageRules.ts` (severity and protocol), `ruleExtract.ts` (Hindi/Hinglish rules), `lines.ts` |
| `server/src/protocols/` | One JSON per protocol; `index.ts` validates at startup. `server/scripts/make-protocols.mjs` wrote the placeholders and never overwrites |
| `server/src/adapters/llm.ts`, `prompts/extraction.ts` | Gemini extraction and the validator |
| `server/scripts/` | Also `triage-scenarios.ts` (`npm run eval:triage -w server`, add `-- --rules` for rules only) and `gemini-check.ts` (compare models) |
| `server/src/routes/` | `sos.ts` (start, location, cancel), `dashboard.ts` (login, cases, SSE stream), `rateLimit.ts` |
| `server/src/dialogue/lines.ts` | Fixed spoken lines, shared with the web app |
| `server/src/adapters/cachedTts.ts` | In-memory cache for fixed Timbre lines |
| `apps/web/src/pages/` | `Sos.tsx`, `Dashboard.tsx` (at `/dashboard`), `VoiceCheck.tsx` (lab only) |
| `render.yaml` | Render deployment blueprint |
| `server/src/types/` | Shared contracts: `voice.ts` (WS messages), `case.ts` (Dev Guide data model, used from Phase 2) |
| `server/src/config.ts` | All env handling |
| `server/scripts/` | `gnani-smoke.ts`, `gnani-spike.ts` |
| `server/tests/` | Adapter tests against a fake protocol server, gateway integration tests |
| `apps/web/src/audio/` | `voiceClient.ts` (mic, socket, player), `pcm.ts` (resample, framing, decode) |
| `apps/web/src/i18n/strings.ts` | All UI strings in three languages |
| `apps/web/src/hooks/useVoice.ts`, `pages/VoiceCheck.tsx` | Phase 1 test screen |
| `eval/` | `audio/` is git-ignored; generated results are git-ignored |

### Voice pipeline as built
Browser mic, downsample to 16 kHz, 1024-byte frames, `/ws/voice/:id`, Prisma stream. `transcript` goes to the browser and, in Voice Check, to Timbre WebSocket (raw 24 kHz PCM), base64 chunks back to the browser, gapless Web Audio playback. Each `tts.*` message carries `ttsId` so stale audio is dropped after an interrupt. Per-utterance Timbre socket: simple and cancellable, but pays a handshake each time. Measure it; fixed lines will be pre-generated in Phase 7 anyway.

### Environment variables
Listed with comments in `.env.example`: `GNANI_API_KEY`, `VOICE_MODE`, `PRISMA_MODEL`, `PRISMA_FORMAT`, `PRISMA_KEYTERMS`, `PRISMA_MIN_SILENCE_MS`, `TIMBRE_MODEL`, `TIMBRE_VOICE_HI`, `TIMBRE_VOICE_HINGLISH`, `TIMBRE_VOICE_EN`, `TIMBRE_SPEED`, `VOICE_MAX_SESSIONS`, `VOICE_SESSION_MAX_SECONDS`, `VOICE_LAB`, `DASHBOARD_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `PORT`. Optional `LOG_LEVEL`, `GEMINI_TIMEOUT_MS`. `DASHBOARD_SECRET` is required when `NODE_ENV=production`; development default is `ayu-dev`. Without a Gemini key Ayu runs on rules alone. Later: `AUTO_ACK_SECONDS`, `PUBLIC_BASE_URL`.

### Dependencies (all within the Dev Guide stack)
Server: `fastify`, `@fastify/websocket`, `@fastify/static`, `ws`. Web: `react`, `react-dom`. Dev: `typescript`, `tsx`, `vitest`, `vite`, `@vitejs/plugin-react`, type packages. Google Fonts per the guide. Node 22+ (built on v24.17).

### Deployment
Needs a **persistent** Node host with HTTPS, because of the Prisma and browser WebSockets. One service serves both API and web build (`npm run build`, `npm run start`, env vars set on the host). Host: Render (D2), defined in `render.yaml`, region Singapore, free plan; not deployed yet. Render docs (read 10-31): free services sleep after 15 idle minutes and take about a minute to wake, have no persistent disk, and may restart at any time; 750 free hours a month.

---

## 9. Decisions log (implementation)

| # | Date | Decision | Why |
|---|---|---|---|
| I1 | 10-31 | Fastify + `ws`, npm workspaces, React + Vite, CSS variables | Dev Guide defaults; smallest set that works |
| I2 | 10-31 | Backend proxies all Gnani traffic | Required: browsers cannot set the headers. Also protects the key |
| I3 | 10-31 | Mic capture at device rate with our own downsampler | Avoids browser differences with fixed-rate audio contexts. Only Chrome is tested so far |
| I4 | 10-31 | Default `prisma-v3.0` + `codemix` + keyterms, env-switchable | Best fit on paper for Hinglish and landmarks, but v3.0 is new. **The spike decides** |
| I5 | 10-31 | Default voices: Yashvi (hi), Poorvi (Hinglish), Kaveri (en), all v2.5 | Yashvi is catalogued as gentle and reassuring; Poorvi is the only Hinglish voice. Listen and confirm |
| I6 | 10-31 | Half-duplex mic by default; barge-in opt-in | Without it, loudspeaker echo could make the repeat-back loop spend credits forever |
| I7 | 10-31 | Consent screen built now, not later | Real voice leaves the device from Phase 1 |
| I8 | 10-31 | `Case` model copied from the Dev Guide unchanged | Shared contract; not used until Phase 2 |
| I9 | 10-31 | Browser end-to-end checks run from a temporary folder, not in the repo | Avoids adding a dependency without agreement. See D5 |
| I10 | 10-31 | Cases stored in memory, no database | Free Render has no disk, Postgres would be a new service, and restarts clearing test data fits the retention rule. Dashboard loses cases on restart |
| I11 | 10-31 | Dashboard lives in the web app at `/dashboard`, not a separate `apps/dashboard` | One deployment, shared strings and types; the Dev Guide layout was only a suggestion |
| I12 | 10-31 | Case is created when the countdown ends, not at tap | A cancelled countdown leaves no case, so `countdown_cancel` is not logged on the server |
| I13 | 10-31 | Added `metrics.activationToFirstLineMs` to the shared Case type | `tapToFirstInstructionMs` is reserved for the first protocol step (Phase 3). This one excludes the deliberate 3-second countdown |
| I14 | 10-31 | SOS opening line is cached in memory and generated at server start, ahead of Phase 7 pre-generation | Fast first line and saves credits. Spends one request per language per server start |
| I15 | 10-31 | Dashboard password uses an HttpOnly cookie | Browser SSE cannot send custom headers |
| I17 | 10-31 | Gemini model `gemini-3.1-flash-lite` | Measured on 7 scripted lines: 6/7, median 853 ms. `3.5-flash-lite` also 6/7 but slower (1001 ms). `2.5-flash` and `2.5-flash-lite` failed every call; cause not investigated |
| I18 | 10-31 | **Added beyond the guide's draft, for medical review:** unresponsive with unknown breathing, or not breathing with unknown response, rate RED with `general` | The guide's code would rate these AMBER. Unknown must never read as good news |
| I19 | 10-31 | Added a seventh protocol, `general` | The guide's rules return it but its list omits it |
| I20 | 10-31 | Protocol selection is not a separate LLM call. Extraction's emergency type feeds the rules | Fewer calls, less latency, and the LLM stays further from the decision |
| I21 | 10-31 | Answer buttons go over the voice socket, not `POST /api/sos/:id/triage` | Same connection, and the machine lives in that session. Offline fallback is Phase 7 |
| I22 | 10-31 | A reply counts as yes/no only if short (4 words or fewer) or on the topic asked | Fixes E3: "बोल नहीं पा रहा" was read as "not responding" and chose the wrong protocol |
| I23 | 10-31 | Only the opening and first question are generated at server start; other lines cache on first use | Limits Timbre requests per restart, since Render's free plan restarts often |
| I24 | 10-31 | GREEN (false alarm) not built; Cancel SOS covers it | Keeps Phase 3 small. The Summary's "offer Normal mode" needs Phase 5 |
| I16 | 10-31 | Repo is public. `CLAUDE.md` and `.claude/` are git-ignored, and commits carry no AI co-author line | Team instruction. Never commit keys, recordings or personal data |

---

## 10. Decisions needed from the team

| # | Question | Recommendation | Needed by |
|---|---|---|---|
| D1 | Gnani key | **Answered 10-31:** team member will supply it, added to `.env` locally. Still to confirm: team of two and both eligible | Now |
| D2 | Which HTTPS host? | **Decided 10-31: Render.** Confirm plan limits (idle sleep, persistent disk) at setup; these affect demos and D6 | Set up in Phase 2 |
| D3 | Update target award from "Real World Impact" to **Real Deal**, with Mixed Vibes and Noise Canceller as secondary? | Yes. Also check if Lucknow qualifies for Small Town, Big Build | Now |
| D4 | **Post early, not on Nov 9.** Shortlisting depends on verified engagement, and the plan leaves almost no time for it | Build-in-public post around Phase 2-3, final post Nov 8-9. Authentic reach only | By Nov 3 |
| D5 | Add Playwright as a dev dependency for repeatable browser tests? | Optional. Worth it if the UI gets complex | Phase 2 |
| D6 | DB for the case store | **Decided 10-31:** in memory (I10). Revisit only if demo history must survive restarts | Done |
| D12 | Render's free plan takes about a minute to wake after 15 idle minutes, which a judge may hit. Paid plan for demo week, or keep it awake some other way? | Decide before submission; check Render pricing then. No paid choice without team approval | Phase 9 |
| D7 | Gemini model and key | **Decided 10-31:** `gemini-3.1-flash-lite` (I17), free-tier key in `.env`. Google's rate-limit page does not state whether free-tier data is used for training, so only scripted test calls may pass through it | Done |
| D8 | Reverse geocoding provider | Nominatim for demo scale, cached, never blocking dispatch | Before Phase 4 |
| D9 | Who reviews the medical content? | **Answered 10-31:** a team member volunteered. **Open:** their medical qualification. The Summary (section 9.8) requires a qualified doctor or medical person, and "Reviewed by" must be truthful. If not qualified, an outside reviewer is still needed | **Now** |
| D10 | Produce a 60-second cut for Demo Day Drop as well as the 2-3 minute plan? | Yes; one recording session can yield both | Phase 9 |
| D11 | Evaluate some calls at 8 kHz to mimic telephony for Noise Canceller? (Not real telephony, which stays cut) | Yes, cheap to add in Phase 8 | Phase 8 |

---

## 11. Known issues and risks

| # | Item | Severity | Plan |
|---|---|---|---|
| R1 | Account request limits. **Cleared for one session:** Timbre works with Prisma open. Two Timbre requests at once and multiple users remain untested | Low | Test in Phase 2 with two devices |
| R2 | Adapters proven on clean synthetic speech only. Real voices, noise and panicked speech are unproven | **High** | Voice Check with real voice, then the noisy-clip spike |
| R3 | Concurrent-session cap unknown. Multiple judges at once may be refused | Medium | Read limit from dashboard; `VOICE_MAX_SESSIONS` guard; friendly busy state in Phase 2 |
| R4 | Credit cost unknown; 5,000 credits must cover testing, audio generation and judges' demos | Medium | Measure in section 6, then budget. Mocks are the default for UI work |
| R5 | One-word answers may be dropped by VAD. "haan" and "nahi" both came through in Hindi in a quiet room (10-31); noise untested | Low-Medium | Include them in noisy clips; tune `x-min-segment-ms` and `x-min-speech-ms` if dropped |
| R6 | No partial transcripts: Ayu knows only that speech started until the utterance ends, adding end-of-speech delay | Medium | Accept; use cached next line; tune silence |
| R7 | Voice session stops at the guard limit (10 min) and Prisma at 15 min, with no reconnect yet | Medium | Phase 4 must fix before real SOS loop |
| R8 | Not tested on Safari, iPhone, Android or real microphones | Medium | Phase 1 team checklist |
| R9 | Timbre rejects a quick new request after an interrupt on single-request accounts (possible) | Low | Observe in live test; add backoff if seen |
| R10 | Public link can spend credits. Voice Check is now off in production, voice needs an active case, and SOS is rate limited, but anyone with the link can still start a real-voice SOS case | Low-Medium | Share the link only with testers until submission; watch credits |
| R13 | No reconnect after a lost connection in SOS: the phone shows "Call 112" but the session stays dead | Medium | Phase 4 |
| R14 | Dashboard cases disappear on server restart or Render sleep | Low-Medium | Accepted for now (I10); see D12 |
| R15 | Gnani key appeared in an AI session | Closed | Replaced 10-31 |
| R16 | Dashboard map pin not confirmed against the real location. One team report said location was wrong, without detail | Medium | Check before Phase 4 location read-back, which depends on it |
| R17 | Android and Hindi/English SOS lines not tested on real devices | Medium | Check during Phase 3 testing |
| R18 | **SOS gives no real first aid yet.** Every protocol is a "pending medical review" line. Triage rules are unreviewed too | **High** | Needs a qualified reviewer (D9). No AI may write this content |
| R19 | Mic is off while Ayu speaks, so a caller talking over the opening or a question is not heard | Medium | Barge-in in Phase 4. Buttons work meanwhile |
| R20 | First instruction takes about 3.7 s after a tap on buttons locally, mostly because both questions are spoken first. Voice answers will add more | Medium | Measure on phones; judges will see this number |
| R21 | Real voice answers untested; ASR errors and noise may produce wrong yes/no readings | **High** | Phase 3 phone test, noisy clips, Phase 8 |
| R11 | Hindi and Hinglish copy is unreviewed draft | Low | Phase 7 |
| R12 | The original docs are not updated with section 4 and 5 findings | Low | PLAN.md overrides; update docs after team agrees D3 |

---

## 12. Test log

**2026-10-31, Phase 1 (mock mode, Windows, Chrome headless, Node 24.17)**
- `npm run typecheck`: pass, both workspaces. `npm run build`: pass.
- `npm test`: 19 of 19 pass (server 13, web 6). Covers framing, headers, event mapping, recoverable vs fatal errors, Timbre streaming and cancel, gateway loop, session limit, text cap, resampling, sample-split decoding.
- Browser run against the production build with a fake microphone clip: consent, language switch, Home, Voice Check. Result: 4 full turns; all mic frames exactly 1024 bytes; 32 ms pace on an earlier continuous run (269 frames in about 8.6 s); consent remembered after reload; no console errors.
- Found and fixed by screenshots: Home buttons not anchored to the bottom, consent text in secondary gray, wide Devanagari spacing in the mono font.
- **Latency numbers from mock runs mean nothing** and must not be quoted.
- **Not tested:** real speech, audible playback, real barge-in in a browser, Safari, phones.

**2026-10-31, Phase 1 (live Gnani)**
- `npm run gnani:smoke`: first run 3/5. Prisma streaming rejected the language list, contrary to the docs. Fixed to one locale. Second run **5/5**. `npm test` still 19 of 19.
- Team voice check, laptop Chrome, quiet room, real mode (no MOCK badge): "haan" and "nahi" transcribed in Hindi, Ayu's voice heard clearly. One latency figure of 498 ms reported (which of the two readouts is unknown). Long-sentence accuracy not reported.


**2026-10-31, Phase 2 (local production build, `NODE_ENV=production`)**
- `npm run typecheck`, `npm run build`: pass. `npm test`: 32 of 32 pass (server 26, web 6).
- Two-browser Chrome run, phone-sized context plus desktop dashboard, simulated GPS and fake mic: **17/17 in mock mode, 17/17 with real Gnani**. Covers dashboard login, Talk disabled in production, countdown cancel, case reaching the dashboard, GPS and accuracy, SIMULATED labels, Call 112 link, audio streamed, cancel, GPS denied, server killed mid-SOS, mic denied, locked API.
- Real run: 747 ms from countdown end to first audio (cached line, localhost, not a phone network).
- Only console error in the real run: the expected refused connection after the server was killed on purpose.
- **Not tested:** Prisma transcribing real speech during SOS (the test tone is not speech, so 0 transcripts is expected), real phones, real GPS, wake lock.

**2026-10-31, Phase 2 (deployed on Render, desktop Chrome, simulated GPS and mic)**
- 12/12: real voice mode, voice lab off, cases and stream locked, `/dashboard` loads, Talk disabled, secure voice socket, opening audio, Prisma connected, mic frames sent, location shown, no voice errors, cancel returns home. No console errors.
- New key smoke test locally: 5/5.

**2026-10-31, Phase 2 (team test, real iPhone XR + Lenovo, deployed site)**
- Opening line heard, spoken Hinglish sentence transcribed correctly on the phone, cancel reached the dashboard.
- Location check was first reported as "no". Follow-up: phone showed `Location ✓`, and the dashboard showed coordinates at ±7 m with cases arriving correctly. The map pin itself was not confirmed, so the original "no" is unexplained (R16).
- First line on the real phone network: 1162 ms and 1956 ms from countdown end to first audio.
- Team accepted Phase 2 and chose to move on.

**2026-10-31, Phase 3 (local production build, real Gnani and Gemini)**
- `npm run typecheck`, `npm run build`: pass. `npm test`: 101 of 101 (server 95, web 6).
- E1-E5 as text through the real SOS machine: **5/5 with Gemini, 5/5 rules only**. First run was 4/5: E3 chose the collapse protocol instead of choking. Fixed (I22). No real speech or ASR involved.
- Two-browser Chrome run with buttons, three paths (CPR, collapse, AMBER general): 13/13, no page errors. First line 321-721 ms; first instruction 3.6-3.8 s.
- Only spoken lines were fixed ones; a unit test confirms LLM text cannot be spoken.
- **Not tested:** answering by real voice, phones, noise, this build on Render.

---

## 13. Changelog

- **2026-10-31** Created PLAN.md. Read live Gnani docs and challenge page; recorded differences. Built Phase 1 foundation on mocks. Copied source docs to `docs/`.
- **2026-10-31** First live Gnani runs. Fixed the Prisma streaming language header. Smoke test 5/5. R1 largely cleared.
- **2026-10-31** Team confirmed real voice works and approved Phase 2. Built SOS flow, case store, live dashboard, public-link guards and `render.yaml`.
- **2026-10-31** Deployed Phase 2 to Render; iPhone XR test passed apart from the map pin (R16). Built Phase 3: Gemini extraction, triage rules, protocol engine with placeholders, SOS conversation, answer buttons.
