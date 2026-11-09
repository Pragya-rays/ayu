# AYU — PLAN.md

**The project's permanent development log and single source of truth for progress.**
Scope and product decisions live in [docs/AYU_PROJECT_SUMMARY.md](docs/AYU_PROJECT_SUMMARY.md); implementation detail in [docs/AYU_DEV_GUIDE.md](docs/AYU_DEV_GUIDE.md). If those docs conflict with section 4 below, section 4 wins on Gnani API facts because it was read from the live docs.

**Last updated:** 2026-11-01 · **Deadline:** 2026-11-10, 11:59 PM IST (target: submit Nov 9)

---

## 1. Current status

| | |
|---|---|
| **Current phase** | **All build work deployed 11-07.** Phases 10 to 14 and the seven-page redesign (I58) are live, tested in Chrome, and waiting for the team's phone check. Phases 1-5 validated on iPhone XR in quiet conditions |
| **Phase state** | Live version is `fb15139`. `/api/health` reports real voice and Gemini, and all seven pages and `/og.png` answer. No live SOS was run, to keep the team's dashboard clean. Phone check: `docs/testing/PHONE_TEST.md`, steps 21-30 |
| **Real Gnani API tested?** | **Yes.** Real voice on iPhone XR and Samsung in quiet settings, and a stream scorecard on synthetic noisy calls. See sections 6 and 12 |
| **Next action** | Team runs phone test steps 21-31 on the live site and reports the first instruction time. The assistant fixes what it finds |
| **Who does what** | **Team decision 11-01:** the assistant works on the product only. The team handles registration, posts, video, trials and submission, so the assistant does not raise them. Registration is not confirmed done |
| **Medical status** | The team chose to ship published first aid without a doctor (I44). The labels in I44 stay |
| **Blocked on** | Nothing in the build |

### If you are an AI agent resuming this project
1. Read this section, then sections 3, 4, 10 and 11, then the current phase in section 7.
2. Read `docs/AYU_PROJECT_SUMMARY.md` and `docs/AYU_DEV_GUIDE.md`.
3. Run `npm install`, `npm run typecheck`, `npm test` to confirm the state matches this file.
4. Never start the next phase until the team has validated the current one.
5. Update this file at the end of every phase, and whenever reality changes.

**Status words used here.** `Built` = code exists. `Tested (mock)` = automated or browser test passed without real Gnani. `Tested (live)` = worked against real Gnani. `Validated` = the team tested it and accepted it. A feature is **Done** only when Tested (live) where Gnani is involved, and Validated.

---

## 2. Project in brief

Ayu is a Hindi/Hinglish-first, voice-first health assistant (mobile PWA). **Normal mode** handles everyday health questions. **SOS mode** is one tap to share location, open a **simulated** dispatch case, and be talked through fixed first-aid steps from published guidance, not reviewed by a doctor (I44), until help arrives. A hospital dashboard shows live cases with a pre-arrival brief.

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
- **Authenticity (read 11-01):** "plagiarism and misleading demos aren't allowed". The FAQ advises synthetic data and no real phone numbers, account numbers, Aadhaar, PAN or recorded calls. No rule on AI coding tools was found, and each member is interviewed individually.
- **Steps in the page's order (read 11-01):** Register, Build, Post your demo, Submit. No separate registration deadline is stated, and the page does not say late registration is allowed. Projects can change after registering. The teammate is added during registration and accepts terms separately. Credits come from registering, to the primary registrant's account.
- **The required post is a demo video** ("Post your demo: publish a video on LinkedIn or X"). So video comes before the final post, not after everything; leave days for engagement before Nov 10.
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
- [ ] Deferred by the team 10-31, **now due during Phase 4 testing**, since it decides how strict read-back must be: record 3 noisy clips into `eval/audio`, run `npm run gnani:spike`, choose the Prisma config
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
| Table-driven triage rules | Tested. Not reviewed by a doctor (I44) |
| 7 protocol files, validator, startup fails on bad or missing files | Tested. Real steps from published guidance since 11-01 (I44), heard on a phone |
| SOS conversation: opening, two questions, protocol, Call 112 line on RED | Tested (live) in Chrome using buttons |
| Yes / No / Not sure buttons, silence prompt, retry then move on | Tested |
| Protocol switch when a caller reports a change | Tested in unit tests |
| Severity on phone, triage and protocol on dashboard | Tested (live) |
| Answering by real voice on a phone | Validated by the team on iPhone XR in a quiet setting: CPR, choking and button paths correct, answers heard first time. Noise untested |
| Pre-generated audio (all 21 fixed lines) | Deployed 10-31 (`b5e0eb4`, `5706235`). Validated by the team on iPhone XR |
| Deployment of Phase 3 | Deployed 10-31 at https://ayu-4801.onrender.com |

**Exit criteria (team to complete):**
- [x] Add `GEMINI_API_KEY` on Render, then push (10-31; `/api/health` reports `llm: gemini`)
- [x] Run SOS on the phone answering by voice ("nahi", "haan") and by buttons (10-31, iPhone XR)
- [x] Say a full sentence (choking) and check the protocol on the dashboard (10-31)
- [x] Team reported the voice comes a bit late. Pre-generated audio deployed; team retest on iPhone: clear, normal volume, nothing wrong (dashboard timing numbers not reported)
- [ ] Confirm the map pin (R16) and try Android (R17)
- [ ] Decide who reviews the rules and protocols (D9)

### Phase 4 — SOS Live Loop (Nov 3 – 4) · **VALIDATED on iPhone XR, quiet setting** (noisy clips and Android still open)
**Goal:** the voice stays useful until help arrives.

| Item | Status |
|---|---|
| Area name via Nominatim (rounded coordinates, cached, 1 request per second, off switch, attribution) | Tested (live) with one simulated location. **Not tested from a real phone** |
| Spoken read-back after the first protocol; yes verifies, no asks for landmark, floor or gate | Tested in Chrome with buttons. **Spoken correction not tested with real voice** |
| Poor GPS, weak address or no GPS goes straight to asking for a place | Tested in unit tests |
| `watchPosition`: sends a better fix when accuracy improves | Built. **Not tested on a real phone** |
| Simulated dispatch: accept, ETA, en route, arrived, 60-second no-ack with Call 112 | Tested (live) in Chrome |
| Status priority: never over a protocol step or triage; ahead of a re-check | Tested in unit tests |
| Re-check every 45 s; switches protocol if breathing changes; severity never drops | Tested in unit tests. **Not tried by voice** |
| A worsening patient outranks any pending question | Tested in unit tests |
| Handover screen and Close; case stays ARRIVED | Tested in Chrome |
| Barge-in with a loudness gate; protocol steps stay uninterruptible | Tested in Chrome with a simulated signal. **Threshold untested on a real phone speaker** |
| Reconnect after a network drop, same conversation; long drop ends in Call 112 | Tested in Chrome with a forced drop |
| Prisma reopened if it drops, and rotated at 14 minutes | Reopen tested with a fake; **the real 15-minute cap has not been hit** |
| Filler steps (Summary 7.4) | Built in Phase 10 |

**Exit criteria (team to complete):**
- [x] Approve the push (deployed 10-31)
- [x] On the iPhone, hear the area read back, and say whether it is right (10-31: correct, closes R16)
- [x] Say a landmark by voice and see it on the dashboard (10-31)
- [x] Accept, follow the ETA and arrive from the dashboard (10-31, iPhone XR. The first attempt failed only because the dashboard tab was an old version; refreshing fixed it)
- [x] No-acknowledgement warning on the phone (10-31, iPhone XR)
- [x] Talk over Ayu; confirm it stops for you but does not stop itself from speaker echo (10-31, iPhone XR)
- [ ] Record the noisy clips and run the spike

### Phase 5 — Normal Mode (Nov 4) · **IN REVIEW**
**Goal:** safe everyday conversation.

| Item | Status |
|---|---|
| Talk to Ayu on the public site; short-lived session, rate limited, keeps no record | Tested in Chrome on real services |
| One question at a time from a fixed list, at most 6, warning-sign questions before advice | Tested |
| Warning signs by rules plus Gemini; "Switch to SOS" prompt, never automatic | Tested. Not reviewed by a doctor (I44) |
| Decline SOS, unclear reply or silence on a warning question: no home care, see a doctor | Tested |
| 5 home-care cards, validator, startup fails on bad or missing files | Tested. Real advice from published guidance since 11-01 (I44), no medicines |
| Summary card with share | Tested in Chrome. **Share not tried on a phone** |
| Typed input and Yes / No buttons | Tested in Chrome |
| Real voice in Normal mode, on a phone | **Not tested** |
| Deployment | Deployed 10-31. Live typed check in desktop Chrome reached the SOS prompt |

**Exit criteria (team to complete):**
- [x] Approve the push (deployed 10-31)
- [x] Try one everyday problem by voice on the iPhone and read the summary (10-31: heard correctly. Team says it feels built only for fixed cases, see D15)
- [x] Mention jaw or chest pain and check the SOS prompt appears (10-31)
- [x] Share on a phone (11-01, iPhone XR)
- [ ] Pronunciation: "dard" and "takleef" fixed by sample B; "gale" was still wrong (11-01). Fix built, retest after push. English words sound natural
- [ ] Conversation feels less fixed but still fixed, with a noticeable pause (11-01). Acknowledgements and mixed questions built, retest after push
- [ ] Decide on shorter SOS lines (D14)

### Phase 6 — Dashboard Complete (Nov 5) · **IN REVIEW**
**Goal:** convincing for the hospital side.

| Item | Status |
|---|---|
| One-line ER brief, built only from confirmed fields, updates live | Tested in Chrome and unit tests. No prep hint: it needs a doctor-reviewed table |
| Case detail: transcript and timeline, live | Tested in Chrome |
| Driver view at `/driver`, same password: address, place, map link, brief, Accept / On the way / Arrived | Tested in Chrome at phone size. **Not tried on a real phone** |
| Change on the driver view reaches dashboard and caller | Tested: about 0.37 s, locally |
| Deployment | Deployed 11-01 |

**Exit criteria (team to complete):**
- [x] Approve the push (deployed 11-01)
- [x] Run one SOS by voice, and check the transcript on the laptop (11-01). The brief's text from real speech was not reported
- [x] Run the driver view, in a laptop tab, and see the phone update (11-01). Not yet tried on a separate phone

### Phase 7 — Safety, Resilience, Polish · **BUILD WORK DONE, content waiting on people**
The team asked on 11-01 to build straight through, then returned to the usual pace the same day: the deadline stays Nov 10, one phase at a time with team review. Work below was built during that push.

| Item | Status |
|---|---|
| Pre-generated Timbre audio for all fixed lines | Done, 114 lines |
| Shorter SOS lines (D14), decided by the assistant on the team's request to keep moving | Built, not yet heard on a phone |
| Service worker: app opens offline, spoken and written "call 112", never claims help was sent | Tested in Chrome, 5/5. **Not tried on a real phone.** Offline triage is not built |
| Medical ID: optional, stored on the phone, sent only with an SOS, shown apart from the brief, deletable | Restored 11-01, tested in Chrome 7/7. **Not deployed; not tried on a real phone** |
| Share my location during SOS: the caller's own share sheet, falling back to copy. Ayu sends nothing itself (keeps the no-SMS rule) | Restored 11-01, tested in Chrome and unit tests. **Native share sheet not tried on a phone during SOS** |
| Replacing placeholders | Done 11-01 from published guidance (I44). No placeholder text ships. A doctor's review stays optional |
| Native-speaker review of Hindi and Hinglish | Team's call. Sheet refreshed 11-01 |

### Phase 8 — Evaluation · **SYNTHETIC PART DONE, real calls waiting on the team**

| Item | Status |
|---|---|
| Synthetic scorecard, `npm run eval:synthetic -w server`, in `eval/results/scorecard-synthetic.md` | Done, 40 calls plus 16 short answers |
| Hindi and English end to end in Chrome | Done, 10/10 |
| Live-stream version of the scorecard, whole calls with answers, `-- --stream` | Done 11-01, `eval/results/scorecard-stream.md`: script 39/40, landmark 40/40, number 8/8, short answers 16/16, median Prisma about 0.5 s. Failure fixed (I43), not re-run |
| 15-20 consented real noisy calls | Guide ready in `docs/testing/REAL_CALLS.md`. Team reported 5 calls run and all fine (11-01), with no per-call results, so nothing is scored. **Measured real calls still open** |
| 5-10 people trying it, one genuine quote | Kit ready in `docs/testing/USER_TRIAL.md`. 1 result so far (11-01): aged 24, nothing confusing, trusted it, words clear, 4.5/5, quote "good and impactable", agreed to be quoted. **Waiting on the team for more** |
| Android and real-device QA checklist | One 20-step list in `docs/testing/PHONE_TEST.md`. **Waiting on the team** |
| Native-speaker wording check | Sheet in `docs/testing/WORDING_REVIEW.md`; rerun `npm run export:wording -w server` after wording changes. **Waiting on the team** |

### Phase 9 — Submission · **DRAFTS DONE, publishing waiting on the team**

| Item | Status |
|---|---|
| Write-up, demo script, post drafts in `docs/submission/` | Drafted. Write-up has TODOs for names, contributions and medical status |
| Demo video, 60-second cut and backup recording | **Waiting on the team** |
| Public posts, live before submission | **Waiting on the team** |
| Submit through the form | **Waiting on the team**; the assistant cannot submit |

### Phase 10 — SOS finishing pass (Nov 1) · **DEPLOYED (`4da7308`), waiting for the team's phone check**
**Goal:** finish what the Summary promised for the wait until help arrives, and close the ways an SOS could silently fail.

| Item | Status |
|---|---|
| Waiting steps (Summary 6.5, 7.4), one between re-checks, chosen per protocol, in `server/src/protocols/waiting/steps.json` | Tested in Chrome and unit tests. **Not yet heard on a phone** |
| CPR beat at 110 per minute, with a pulsing dot for loud rooms. Plays from the phone, so it survives a lost connection (Summary section 10) | Tested in Chrome. **Volume, and whether it interrupts Ayu, not tried on a phone speaker** |
| Encouragement during CPR, repeated once the list runs out | Tested |
| Instructions resume after a drop. **Bug:** a blip mid-CPR silently lost every remaining step and the 112 line, while the dashboard logged them as spoken | Fixed; the failing test came first. Tested in Chrome with a forced drop |
| Arrival stops the remaining steps at once. **Bug:** they carried on, and "the ambulance is here" waited behind them | Fixed, unit tests |
| Timbre time limit, 8 s of silence. **Bug:** a hung request froze the whole SOS conversation | Fixed, tests with a silent fake server. Seen once in real use: a generation run hung on one request |
| SOS start time limit, 10 s, then the Call 112 screen. **Bug:** it could wait forever after saying help was being sent | Fixed, tested in Chrome: 13.5 s including the 3 s countdown |
| Spoken "call 112" after a long drop. The audio was being closed just before that line and any beat | Fixed, tested in Chrome: line played, audio stays open |
| Reconnecting note no longer shown beside "Connection lost" | Fixed, code change only |
| App opens from the saved copy after 4 s on a hung network; a host's holding page can never replace it in the cache | Tested in Chrome: 4.3 s. Render's own wake page was not seen, so the holding page was simulated |

**Exit criteria (team to complete):**
- [x] Approve the push (deployed 11-01)
- [ ] Phone test steps 21-24: hear the beat, the waiting steps, and a drop during CPR

### Phase 11 — First instruction speed (Nov 1) · **DEPLOYED (`4da7308`), waiting for the team's phone check**
**Goal:** cut R20 without touching triage safety.

| Item | Status |
|---|---|
| Silence trimmed from every stored line as it loads, and from the six lines the phone plays itself. No new audio, no credits | Tested. Ayu speaks before the first instruction: Hinglish 4.48 to 3.61 s, Hindi 5.12 to 4.25 s, English 3.68 to 2.99 s. **Not yet heard on a phone** |
| Step pauses raised from 2.0 to 2.3 s, so the pace the team approved by ear stays the same | Calculated from a mean 0.34 s trimmed per line, not re-heard |

**Exit criteria (team to complete):**
- [x] Approve the push, together with Phase 10 (deployed 11-01)
- [ ] Phone test step 25: no clipped words. Read "first instruction" on the dashboard for one voice run

### Phase 12 — Everyday cards and false alarm (Nov 2) · **BUILT, not pushed, waiting for team review**
**Goal:** finish the last Summary items, which completes the planned build.

| Item | Status |
|---|---|
| Home-care cards for vomiting, sore throat and constipation, from NHS pages, no medicines. 8 cards, the top of the Summary's 6-8 | Tested live with typed input and Gemini. **Not heard on a phone** |
| Two new warning questions from the NHS emergency lists: green, black or bloody vomit, and being unable to swallow or drooling | Tested |
| Sudden severe pain added to the acidity questions, because a bare "pet mein dard" reaches that card | Tested |
| Issue matching reordered. **Bug:** "पेट में दस्त" got acidity, and "potty nahi ho rahi" would have got loose motions | Fixed, tests |
| **Safety bug, live since Phase 5:** going quiet on an everyday question ended in advice, with warning questions never asked. Now any ending with a warning question left gives "see a doctor" and no advice | Failing test first, then fixed. Tested live. **The live site still has this until the next push** |
| False alarm (Summary 7.5). Saying "galti se dab gaya" offers a button to cancel and talk to Ayu. Help and the questions carry on until that tap, and voice alone cancels nothing. Not offered on a RED case. Taken back if answers turn RED. The dashboard timeline shows it | Tested live: real speech through Prisma, offer, dashboard note, tap reaches Normal mode. **Not tried on a phone**, where the new audio must start from the tap |

**Exit criteria (team to complete):**
- [ ] Approve the push
- [ ] Phone test steps 26-28

### Phase 13 — Website redesign (Nov 2) · **BUILT, not pushed, waiting for team review**
**Goal:** team feedback: the site looked empty on PC, cards were plain white, and Home was one screen.

| Item | Status |
|---|---|
| Abstract shapes behind every page: colour fields, rings, pulse lines, dot grids. Line art shows on wide screens only | Tested in Chrome |
| Translucent glass on every card, with a firmer fallback where a browser has no blur | Chrome only. **Safari, and smoothness on a low-end Android, not tried.** Blur can be heavy on old phones |
| Rounded glass navbar pill that stays on screen, with Home, Why it matters, How it works and About | Tested in Chrome |
| Home is now four sections: hero, India facts, how Ayu works, about. On PC an example conversation fills the right side, labelled as an example | Tested at 7 sizes in 3 languages |
| India facts with a source link on each, and a line saying they describe the problem and are not Ayu's results | Each read at its source; see section 12 |
| Navbar SOS appears once the main SOS scrolls away, so SOS is never a scroll from the caller | Tested: starts the countdown |
| Primary button font changed to the headline serif, in all three languages | Team to judge |
| Same look on consent, chat, Medical ID, dashboard and driver. **SOS screen stays dark and plain on purpose**: faint shapes at the sides of wide screens only, none on a phone | Tested |

**Phase 14 polish (Nov 3), same review:**

| Item | Status |
|---|---|
| Text contrast measured against the real pixels behind each line, glass and shapes included: 62 lines failed WCAG AA. Grey text, language buttons, the Medical ID link and the 112 link darkened; the active language is now dark | Now 0 failures, Home in 3 languages on PC and phone, plus dashboard login. A control with pale text was flagged (53 failures), so the check can fail |
| Keyboard focus ring on every control, light and dark | Built |
| Link preview for LinkedIn, X and WhatsApp: title, description and a 1200x630 image (`apps/web/public/og.png`) that keeps "simulated" and "not a medical device" | Served locally. **How LinkedIn shows it is untested until pushed** |

| Home split into real pages (I57): Home, Why it matters, How it works, About. The current page is marked in the navbar, the back button and shared links work, and an unknown address shows Home | Tested in Chrome, 19/19: each page by navbar, cards and direct address, back button, navbar SOS on each page, cancel returns to the same page, phone in Hindi and Hinglish with no overflow. Contrast 0 failures on all four pages, 3 languages, PC and phone |

**Exit criteria (team to complete):**
- [ ] Review the look on a real PC and phone
- [ ] Phone test steps 29-30
- [ ] Hindi and Hinglish wording of the new sections is unreviewed. `docs/testing/WORDING_REVIEW.md` is refreshed

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
| `server/src/protocols/` | One JSON per protocol; `index.ts` validates at startup. `waiting/steps.json` holds the waiting steps and which protocols each fits. `server/scripts/make-protocols.mjs` wrote the placeholders and never overwrites |
| `apps/web/src/audio/metronome.ts` | The CPR beat: one looped click, no timers |
| `apps/web/src/pages/Home.tsx`, `components/Backdrop.tsx`, `components/LanguageToggle.tsx` | Home sections with their sources, the shapes behind every page, the language switch |
| `server/src/adapters/llm.ts`, `prompts/extraction.ts` | Gemini extraction and the validator |
| `server/scripts/` | Also `triage-scenarios.ts` (`npm run eval:triage -w server`, add `-- --rules` for rules only) and `gemini-check.ts` (compare models) |
| `server/src/dialogue/normal*.ts`, `server/src/homecare/`, `routes/normal.ts`, `apps/web/src/pages/Normal.tsx` | Normal mode. `normalContent.ts` holds the question list; `normalRules.ts` the warning signs; `server/scripts/make-home-care.mjs` wrote the placeholders and never overwrites. Voice Check moved to `/voice-check` (lab only) |
| `server/src/dispatch/simulator.ts` | Simulated accept, ETA, status and no-ack timer. Contacts nothing real |
| `server/src/adapters/geocode.ts`, `cases/addresses.ts` | Nominatim lookup and per-case address |
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
Listed with comments in `.env.example`: `GNANI_API_KEY`, `VOICE_MODE`, `PRISMA_MODEL`, `PRISMA_FORMAT`, `PRISMA_KEYTERMS`, `PRISMA_MIN_SILENCE_MS`, `TIMBRE_MODEL`, `TIMBRE_VOICE_HI`, `TIMBRE_VOICE_HINGLISH`, `TIMBRE_VOICE_EN`, `TIMBRE_SPEED`, `VOICE_MAX_SESSIONS`, `VOICE_SESSION_MAX_SECONDS`, `VOICE_LAB`, `DASHBOARD_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `ACK_TIMEOUT_SECONDS`, `AUTO_ACK_SECONDS`, `SIM_MINUTE_SECONDS`, `GEOCODER`, `SOS_SESSION_MAX_SECONDS`, `PORT`. Optional `LOG_LEVEL`, `GEMINI_TIMEOUT_MS`. `DASHBOARD_SECRET` is required when `NODE_ENV=production`; development default is `ayu-dev`. Without a Gemini key Ayu runs on rules alone. Later: `PUBLIC_BASE_URL`.

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
| I31 | 10-31 | Replaced by I35 after team feedback. Normal questions started as a fixed list only | Safe, but felt built only for fixed cases |
| I35 | 11-01 | Gemini may phrase everyday follow-ups, which must pass `checkQuestion` (one short question; no medicine, instruction or diagnosis wording). Warning-sign questions stay fixed. Failure falls back to the fixed list | Team decision D15. Generated lines use live Timbre, so they cost credits and start slower |
| I44 | 11-01 | **Team overrode the doctor-review rule** (Summary 9.8, Dev Guide 0.3): real steps ship with status `sourced`, condensed from published guidance, each file listing sources, with no "Reviewed by" label and no medicines. The word "prototype" is removed from the app at the team's request. **Kept on purpose:** "Simulated", "Not a medical device · does not replace emergency services", and an honest "published guidance, not doctor-reviewed" tag, because the site and repo are public and the rules ban misleading demos | Team decision. The assistant declined to remove those labels |
| I45 | 11-01 | Team instruction: the assistant works on the product only, and the team handles registration, posts, video, trials and submission | Team decision |
| I46 | 11-01 | Waiting steps are spoken from a fixed file, one per 45-second cycle, 20 s after the last re-check. Each lists the protocols it fits, so CPR, choking and bleeding callers only hear what a helper can do, and "do not move them" never reaches a protocol that moves the person | Summary 6.5 and 7.4. I44 removed the reason they were held back. A file keeps the LLM out of it |
| I47 | 11-01 | CPR beat at 110 per minute, a looped click on the phone, starting at a new step after "push fast". It keeps running under speech and questions | 100-120 is the target, and Hwang 2020 used 110 for dispatcher-assisted CPR. Live Prisma test: 12 s of clicks produced no speech or text, and answers over clicks were transcribed correctly with no added delay, at worst case with no echo cancellation. So the planned mic filter was dropped |
| I48 | 11-01 | Encouragement during CPR repeats after the waiting list runs out | Hwang 2020: metronome plus encouragement held the rate near 110 better than metronome alone. Ayu says it about every 45 s, not the study's 30 s |
| I49 | 11-01 | SOS keeps its audio open after the connection ends for good. Only leaving the screen closes it | Otherwise the beat and the spoken 112 line die exactly when they matter |
| I54 | 11-02 | Team redesign overrides parts of Dev Guide 12: shapes and glass on all pages except SOS, and the headline serif on primary buttons, which the guide kept to Home. SOS keeps Inter, dark, no glass | The guide's reason still holds for SOS alone: clarity beats style in a panic |
| I55 | 11-02 | Facts on Home use only figures read at a source, name it, and say when they come from one hospital. Hindi uses the census, cited through Wikipedia's table because the census file could not be opened. Dropped: ambulance response times, because the figures found ranged from 10 to 134 minutes across small studies and no national number exists | Public health site, and the rules ban misleading demos. A search summary was wrong once already (Phase 10) |
| I56 | 11-02 | **Replaced by I57.** Home sections as one scrolling page with anchors | The team asked for real pages |
| I60 | 11-09 | A GitHub Actions job visits `/api/health` every 10 minutes (`.github/workflows/keep-awake.yml`), so the free Render service does not sleep before judging. Settles D12 without a paid plan | One always-on free service uses about 720 of Render's 750 free hours a month; a second free service in the same Render account would push past it. GitHub may run scheduled jobs late, so a cold start is still possible now and then. On 11-08 the site stopped answering for over an hour with nothing changed on our side; it was back on 11-09 |
| I59 | 11-08 | **Ayu's voice travels as µ-law (G.711) in binary frames; the caller's mic stays raw 16-bit PCM.** The phone asks with `codec: "mulaw"`; older saved copies of the app get the old format. The server also accepts µ-law mic audio (`micCodec`), switched off | On a link throttled to 100 kbps the first sound arrived in 0.72 s instead of 1.37 s, and the opening line in 2.5 s instead of 6.2 s, with 2.6x less data. µ-law on the mic was measured and dropped: in the live 40-call test it kept 37/40 landmarks instead of 40/40, and heard 15/16 short answers instead of 16/16, all in the two noisiest conditions. Not conclusive, but what the caller says matters more than mic bandwidth. 8 kHz was not used for the same reason |
| I58 | 11-04 | **Team chose a new look from a reference site (ayu1.vercel.app):** dark navy, violet-to-pink gradient headings, heavy Inter type, a phone mockup, icon tiles, outline shapes. Seven pages: Home, Emergency `/sos`, Everyday care `/care`, Hospital `/hospital`, Voice `/voice`, Why India `/why`, About `/about`. Replaces I54's light glass and serif, and I57's four pages. Only the reference's look was used: its product claims (Sarvam, Neo4j, diagnosis) are not Ayu's and appear nowhere | Team request. Script and topic names are read from the protocol and home-care files at build time, so the pages cannot drift from them. Phones get a menu and a floating SOS; Home keeps its own SOS on the first screen at every size |
| I57 | 11-03 | Real pages at `/`, `/why`, `/how` and `/about`, using the browser's history with no router package. Home keeps the hero and links to the others with three cards. Every page except Home keeps SOS in the navbar | Team asked for separate pages. Audio is still unlocked inside the SOS tap itself, so moving between pages costs nothing. The server already serves the app at any address |
| I52 | 11-02 | False alarm is handled by an offer and a tap, never by voice. Replaces I24 | A caller can be wrong about a patient, and "sab theek hai" can be misheard or said under pressure. A wrong reading costs one spoken line. Keeps the Summary's rule of keeping dispatch until the user cancels. Severity stays as the rules set it: no GREEN state was added |
| I53 | 11-02 | The warning check sits in `finish()`, the one place every Normal conversation ends, not in the silence timer | A rule at each exit is how the silent-advice bug happened |
| I50 | 11-01 | Stored audio is trimmed when it loads, so the repo's audio files stay as generated. `gen-audio` trims the phone's own copies | Saves about 0.9 s with no change to words or triage, and opens the mic sooner after Ayu stops |
| I51 | 11-01 | **Rejected:** ending the caller's turn early with `commit` after a short answer, which could save about 1 s. Lowering `PRISMA_MIN_SILENCE_MS` was rejected for the same reason. Dropping "Kya woh" from the questions was also rejected | A panicked "haan... nahi nahi" cut after "haan" would mark an unresponsive person as responsive. Synthetic speech cannot show this risk, so it needs real callers first. A shorter question that gets misheard costs far more than the half second saved |
| I40 | 11-01 | ER brief is built from case fields in code, with no LLM step, and shows "unknown" for anything not stated. Stricter than the guide, which let the LLM fill slots | The hospital reads it under pressure, so it can never contain words the caller did not say |
| I41 | 11-01 | Timeline entries use their own feed, separate from case updates | So a new transcript line reaches the dashboard without waking the voice session |
| I43 | 11-01 | In triage, a reply clearly about the other question answers that question, and the current one is asked again | Stream test: "हाँ, साँस ले रहा है" was read as a yes to "are they responding", marking an unresponsive person as responsive |
| I42 | 11-01 | Driver view shares the dashboard password and shows only active calls | No new accounts, which are on the Cut list |
| I38 | 11-01 | Gemini also returns a Devanagari `spoken` version of each question, checked like the question and close to it in length. The word list then runs over it, because Gemini's spelling is often only part converted | Team found "gale" wrong: a list alone cannot cover everything Gemini says |
| I39 | 11-01 | Stored "Achha" style acknowledgement plays as soon as someone finishes, except on a warning sign or an unclear warning reply. Fitted questions may also sit between warning-sign questions, within the limit of 6, and every warning question keeps its place | Team reported a pause and a fixed feel. Warning questions themselves stay fixed |
| I37 | 11-01 | Hinglish stays in Latin on screen; `dialogue/hinglishSpeech.ts` converts words to Devanagari only in the text sent to Timbre. Applies to fixed lines, templates and Gemini questions. **New Hinglish words must go in its list**; a test fails if a fixed line is missed. Unlisted words in Gemini questions stay Latin, as before | Team chose sample B. One list covers everything, and Hinglish readers keep Latin text |
| I36 | 11-01 | Gemini model changed to `gemini-3.5-flash-lite` with minimal thinking, replacing I17 | Median about 0.85 s, against 1-8 s with timeouts on default thinking. Extraction accuracy unchanged at 6/7, E1-E5 5/5 |
| I32 | 10-31 | Warning-sign keywords outrank a parsed yes/no | "saans nahi aa rahi" looks like a "no" but is a warning sign |
| I33 | 10-31 | Normal mode stores no case and does not reconnect | No record is needed, and a dropped chat can simply restart |
| I34 | 10-31 | SOS screen styles scoped to `main.sos` | The `.sos` rule leaked onto buttons named `sos`, making them full-screen height since Phase 2 |
| I26 | 10-31 | Read-back runs after the first protocol and the Call 112 line, not during triage | Instructions come first. Dispatch already left at the start, so nothing waits on this |
| I27 | 10-31 | One SOS machine per case, kept when the socket drops | So a reconnect resumes rather than restarts the conversation |
| I28 | 10-31 | Answer buttons also serve location and re-check questions. No separate location card | Same control a caller already knows; the screen stays simple |
| I29 | 10-31 | Simulated minute defaults to 15 real seconds (`SIM_MINUTE_SECONDS`) | A demo should not wait out a 14-minute ETA. Everything stays labelled simulated |
| I30 | 10-31 | Coordinates rounded to about 110 m before leaving for Nominatim | Its policy bans personal data, and an area name needs no more precision |
| I25 | 10-31 | Moved pre-generated audio forward from Phase 7. `npm run gen:audio` stores all fixed lines in `server/src/audio`, checked against a voice manifest. The phone downloads the opening during the countdown and plays it locally | Team reported late voice. **Rerun `gen:audio` after any change to fixed lines, protocol text or voice settings**; a changed line falls back to live Timbre, a changed voice ignores all stored audio |
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
| D1 | Team and key | Team of two at SRMCEM, Lucknow. Aryan Pandey did the UI, Pragya the backend. Key held in `.env`. **Corrected 11-01: the team has NOT registered yet** and plans to after building. Must register before submitting | Now |
| D2 | Which HTTPS host? | **Decided 10-31: Render.** Confirm plan limits (idle sleep, persistent disk) at setup; these affect demos and D6 | Set up in Phase 2 |
| D3 | Target award. **Decided 11-01, team deferred to the recommendation:** Real Deal first; Two-Person Army and Mixed Vibes also fit. The page does not say entrants choose, and does not define Tier 2 or 3 towns, so Small Town, Big Build is unconfirmed for SRMCEM, Lucknow | Done |
| D4 | **Post early, not on Nov 9.** Shortlisting depends on verified engagement, and the plan leaves almost no time for it | Build-in-public post around Phase 2-3, final post Nov 8-9. Authentic reach only | By Nov 3 |
| D5 | Add Playwright as a dev dependency for repeatable browser tests? | Optional. Worth it if the UI gets complex | Phase 2 |
| D6 | DB for the case store | **Decided 10-31:** in memory (I10). Revisit only if demo history must survive restarts | Done |
| D15 | Normal mode feels fixed. **Decided 11-01:** Gemini writes the everyday follow-ups (I35); warning-sign questions stay fixed; advice stays cards only, since free-form medical Q&A is on the Cut list | Done |
| D16 | Hinglish "dard", "takleef" and similar were mispronounced. **Decided 11-01 by ear:** sample B, voice Poorvi fed Hindi script (I37) | Done |
| D14 | Shorten the SOS opening and the two questions? Ayu speaks for 7.1 s before the first instruction (opening 3.0, questions 1.9 and 2.2), which is most of the 11-16 s | Yes. Shorter lines could save about 3 s, and wording must stay plain. Needs `gen:audio` afterwards | Phase 6 |
| D13 | Keep the silent 3-second SOS countdown (Summary decision 17), or shorten it? | Keep for now; revisit if it still feels slow after the audio fix. It prevents accidental SOS | Phase 4 |
| D12 | Render's free plan takes about a minute to wake after 15 idle minutes, which a judge may hit. Paid plan for demo week, or keep it awake some other way? | Decide before submission; check Render pricing then. No paid choice without team approval | Phase 9 |
| D7 | Gemini model and key | **Decided 10-31:** `gemini-3.1-flash-lite` (I17), free-tier key in `.env`. Google's rate-limit page does not state whether free-tier data is used for training, so only scripted test calls may pass through it | Done |
| D8 | Reverse geocoding provider | **Decided 10-31: OpenStreetMap Nominatim.** Policy: https://operations.osmfoundation.org/policies/nominatim/ (at most 1 request per second across the whole app, identifying User-Agent, cached results, visible attribution, must be switchable off, no personal data, no bulk or systematic use, no autocomplete). `GEOCODER=off` disables it. Public Nominatim has no uptime promise and the policy can change, so a real deployment needs a paid or self-hosted geocoder | Done |
| D9 | Who reviews the medical content? | Pragya said on 11-01 they are qualified. **Open:** the Summary's B.Tech CS/DS line originally described Aryan and was renamed, so it proves nothing either way. Qualification and registration are still needed before any "Reviewed by" label. The label is public and must be truthful. Review sheet is at `docs/medical-review/REVIEW_SHEET.md`, git-ignored, and nothing from it is in the app | **Now** |
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
| R7 | SOS voice now has a 30-minute limit, and Prisma rotates at 14 minutes. The real cap has not been hit in testing | Low-Medium | Run one long session before the demo |
| R8 | Not tested on Safari, iPhone, Android or real microphones | Medium | Phase 1 team checklist |
| R9 | Timbre rejects a quick new request after an interrupt on single-request accounts (possible) | Low | Observe in live test; add backoff if seen |
| R10 | Public link can spend credits. Voice Check is now off in production, voice needs an active case, and SOS is rate limited, but anyone with the link can still start a real-voice SOS case | Low-Medium | Share the link only with testers until submission; watch credits |
| R13 | Phone reconnects and resumes the same conversation (fixed 10-31). A server restart still loses the call, because cases and machines are in memory (I10). Render free may restart at any time | Medium | Phone falls back to the Call 112 message; see D12 |
| R14 | Dashboard cases disappear on server restart or Render sleep | Low-Medium | Accepted for now (I10); see D12 |
| R15 | Gnani key appeared in an AI session | Closed | Replaced 10-31 |
| R16 | **Closed 10-31:** the spoken area was correct on the team's iPhone. The earlier wrong pin stays unexplained; it may have been an AI test case with simulated coordinates. AI live tests must not add simulated cases to the team's dashboard without saying so | Closed | Read-back with voice correction catches any bad fix during a call |
| R17 | Hindi and English pass end to end in Chrome with buttons and typing (11-01, 10/10). A Samsung Android phone passed a short check in Hinglish (11-01): voice, interrupting and layout. Hindi or English by voice on a real phone is untested | Low-Medium | User trials |
| R23 | **Gemini free tier allows 15 requests per minute** (measured 11-01), shared by all users. Each thing a caller says is one request. Over the limit it returns 429 in about 0.4 s and Ayu uses rules and fixed questions, so calls stay safe but lose Gemini's help. Several judges at once could hit this. Daily limit not measured | Medium | Accept for one user at a time; consider a paid tier for demo week |
| R18 | **First aid and home care are live without any clinical review** (team decision 11-01, I44). Steps were condensed from published guidance with AI help, translations are unchecked, and triage rules and warning signs are unreviewed. Waiting steps and the CPR beat (Phase 10) are also unreviewed. A real person could rely on them | **High** | App and write-up say so plainly. A qualified reviewer can still approve it through the sheet |
| R25 | Glass blur on many panes may stutter on low-end Android phones, Ayu's main users. It also has not been seen in Safari | Medium | Phone test step 30. Lowering `--glass-blur` in `app.css`, or removing blur on phones, is one line |
| R24 | CPR beat untested on a real phone: it may be too quiet on speaker, or too loud under Ayu, and echo on a real speaker differs from the Prisma test, which fed clicks in directly | Medium | Phone test steps 21-22. `VOLUME` is in `metronome.ts` |
| R19 | Barge-in works on iPhone XR on speaker, in a quiet setting, with no self-interruption (10-31). Android and noise are untested; the threshold (`BARGE_RMS` in `voiceClient.ts`) may need tuning there. The opening line and protocol steps cannot be interrupted | Low-Medium | Check on Android and in the noisy tests |
| R20 | First instruction took 11-16 s by voice on a real phone (10-31), against about 3 s with buttons. Not re-measured since. Ayu's speech before it went from 7.1 s to 4.5 s (shorter lines) to 3.6 s (trimmed, not deployed). Calculated, not traced: silence detection 1.6 s, Prisma about 1 s, and the rest is the caller responding. Interrupting Ayu already shortens it | **High** | Measure on a phone after the push. Further cuts trade against safety (I51); judges will see this number |
| R22 | Voice "felt half" on iPhone after the audio fix. **Closed 10-31:** mic now starts during the countdown and lines queue (`5706235`). Team retest on iPhone: every word heard, normal volume | Closed | Cause not isolated; both fixes shipped together |
| R21 | Voice answers work in a quiet setting; ASR errors and noise may still produce wrong yes/no readings | **High** | Noisy clips, Phase 8 |
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
- **Not tested at that point:** answering by real voice, phones, noise, this build on Render.

**2026-10-31, Phase 3 (deployed, then team test)**
- Render: `/api/health` reports real voice and Gemini. Live button flow in desktop Chrome: 7/7.
- Team test on iPhone XR, quiet setting: "Nahi" twice gave RED `cpr`; a spoken choking sentence gave RED `choking`; buttons gave RED `recovery_stroke_collapse`. Answers heard first time. Team said the voice comes a bit late.

**2026-10-31, Phase 3 latency fix (local production build, real Gnani and Gemini)**
- 21 fixed lines generated once with Timbre, about 2.9 MB. `npm test`: 105 of 105 (server 99, web 6).
- Two-browser Chrome run: 13/13. Countdown end to first audio went from 321-721 ms to **8-13 ms** (local copy). First instruction went from 3.6-3.8 s to 3.1 s. These are localhost figures; phone-network figures still need measuring.

**2026-10-31, Phase 4 (local production build, real Gnani, Gemini and Nominatim)**
- `npm run typecheck`, `npm run build`: pass. `npm test`: 142 of 142 (server 134, web 8). E1-E5 with Gemini: 5/5. 48 fixed lines generated, about 7 MB.
- New tests found three real bugs, all fixed: a pending re-check delayed the Call 112 warning; updates were lost during a disconnect; "he stopped breathing" during the location question was saved as an address instead of switching to CPR.
- Two-browser Chrome run, buttons, simulated GPS: 9/9 for read-back ("Hazratganj, Lucknow"), verify, accept, arrival, handover, no-ack, landmark question. First instruction 2.7 s.
- Forced network drop through a local relay, plus barge-in: 6/6. Chrome's offline mode did not cut open sockets, so the relay was needed; simple offline tests would prove nothing here.
- **Not tested:** real speech in these new stages, real phones, this build on Render, noise.

**2026-10-31, Phase 4 (deployed, team test on iPhone XR)**
- Spoken area correct; landmark by voice reached the dashboard; interrupting works; Ayu did not cut itself off; nothing reported as slow or wrong.
- Retest after refreshing the dashboard: Accept showed the ETA and Ayu announced the ambulance; Arrived spoke the arrival line; with no acceptance Ayu said to call 112.
- Real phone timing from the dashboard: first line 52-72 ms; first instruction 11.3-15.7 s by voice, against about 3 s with buttons. Not yet broken down (R20).
- **Lesson for demos:** a dashboard tab left open across a deployment keeps the old version. Refresh it first.

**2026-10-31, Phase 5 (local production build, real Gnani and Gemini, typed input and buttons)**
- `npm test`: 178 of 178 (server 170, web 8). E1-E5 with Gemini: 5/5. N1, N2, N3 in unit tests with rules only. 102 fixed lines generated, about 13 MB.
- Chrome run: 9/9 for warning sign to SOS, decline, and a full conversation to the summary. All lines started from stored audio.
- SOS regression after the styling fix: 9 of 10 checks, plus 6/6 forced-drop and barge-in. The one failure is the known Chrome offline step, which does not cut open sockets; the forced-drop run covers it.
- Code review found "saans nahi aa rahi" would cancel a warning sign (fixed, I32). Screenshots found the full-height SOS button (fixed, I34); no automated test caught it.
- **Not tested:** real voice in Normal mode, phones, share, noise.

**2026-11-01, Phase 5 revision (local build, real Gnani and Gemini)**
- `npm test`: 201 of 201 (server 193, web 8). `npm run normal:check`: 10/11 questions passed on a clean run, median 849 ms, none gave advice; an injection attempt and two "which medicine" requests got ordinary follow-ups.
- Extraction with the new model after cooldown: 6/7, median 967 ms; the miss is caught by rules. E1-E5 with Gemini: 5/5. A first run showed 0/7 only because the rate limit was exhausted; a passing E1-E5 there proved nothing about Gemini.
- Live typed conversation: fitted question in about 1.5 s, then a fixed warning-sign question in about 1 s.
- Second round after team feedback: `npm test` 211 of 211 (server 203, web 8). 111 stored lines. Live typed run: acknowledgement at once, question about 1.1-1.3 s after sending. With speech, add about 0.8 s silence detection and Prisma before that. Regression 9/9 with Gemini off.
- Pronunciation: team picked sample B by ear. Hinglish audio regenerated (`npm run gen:audio -w server -- hinglish`). `npm test`: 205 of 205 (server 197, web 8).

**2026-11-01, Phase 5 validated (team, iPhone XR, voice)**
- "gale" now correct, acknowledgement present, pause better, conversation accepted. Quiet setting only.

**2026-11-01, Phase 6 (local production build, real Gnani and Gemini)**
- `npm test`: 217 of 217 (server 209, web 8). Three-screen Chrome run (caller, dashboard, driver): 11/11, no page errors. Sync about 0.37 s. Buttons only, so the brief showed "complaint unknown".
- **Not tested:** brief from real speech, driver view on a real phone, this build on Render.

**2026-11-01, Phases 7 to 9 build work (local build, real services)**
- Offline in Chrome: 5/5 (app opens, says to call 112, never claims help was sent). Three-screen 11/11 with shorter lines. Hindi and English end to end 10/10.
- Synthetic scorecard: correct script 40/40, landmark 38/40, number 8/8, short answers 16/16, median Prisma about 0.7 s. Real failures: "Aminabad" split by noise, twice. The first run showed 0/8 for numbers because of a bug in the scorer, not Prisma; re-scored from the same transcripts, with no new calls.
- Limits: synthetic speech and noise; file mode, not the live stream; only the first sentence passed through noise.

**2026-11-01, Phase 7 Medical ID and share**
- `npm test`: 222 of 222 (server 210, web 12). Chrome 7/7, three-screen 11/11. The browser test found Share did nothing if the share sheet failed; fixed with a copy fallback, applied to Normal mode too.

**2026-11-01, final phone test on iPhone, parts 1 and 2 (live `8dd6ad3`)**
- Team reported working: speech and transcript, area read-back, share sheet, driver buttons updating the phone, shorter SOS lines feel faster, Medical ID shown and deleted, 112 warning with no acceptance, everyday chat. Nothing reported wrong. Opening line kept as it is.
- Part 3 passed: interrupting on speaker, add to home screen, Airplane Mode says to call 112, mic refused shows a warning and buttons work. All on iPhone, quiet setting.
- The pre-arrival brief from real speech was not reported.
- Live typed check found Gemini repeating a question with a misspelling ("bhuhaar"). Fixed with an overlap check, not yet deployed. `npm test`: 226 of 226.

**2026-11-01, Phase 10 (local production build, real Gnani and Gemini, Chrome, forced failures through a relay)**
- `npm run typecheck`, `npm run build`: pass. `npm test`: 241 of 241 (server 225, web 16). One run timed out on the first gateway test under load (5 s); it did not repeat in later full runs, and that test does not touch this work.
- The drop bug was reproduced by a failing test before the fix.
- Failure run 15/15: all steps heard in order after a drop, then the 112 line; beat at 110.0/min; first waiting step; beat through a re-check; long drop keeps the screen, spoken 112 line and beat; leaving stops it; breathing returning stops it; hung SOS start ends in Call 112 at 13.5 s.
- That run's slow-network check passed in 0.1 s, too fast to be real: it had reused an open connection. Redone with connections cut first, 4/4: 4.3 s, and the holding page came through and did not replace the saved app.
- Regression on the final build: three-screen 11/11, E1-E5 rules only 5/5.
- Prisma live, clicks mixed into the audio at level 0.25 (no echo cancellation): clicks alone gave 0 speech starts and no text; a sentence and a one-word answer over clicks were transcribed correctly, with no extra delay against the same sentence without clicks.
- 29 new lines generated with Timbre, about 4 MB. 36 spoken and 80 on-screen lines in the refreshed wording sheet.
- **Not tested:** the beat on a real phone speaker, waiting steps heard by a person, Gemini-on triage scenarios after this change, Render's real wake page.

**2026-11-01, Phase 11 (local production build)**
- Measured across all 314 stored lines: mean 0.12 s silence before and 0.22 s after, longest 0.51 s after.
- `npm run typecheck`: pass. `npm test`: 247 of 247 (server 231, web 16).
- Prisma heard 14 trimmed and untrimmed lines in Hindi and English: 12 identical, 2 differing only in spelling (वह/वो, गेट/gate). No word lost. Hinglish lines use the same Hindi-script audio path but were not in this check.
- Failure run 15/15, slow network 4/4, offline 5/5.
- Three-screen: **10/11 once, then 11/11 five times in a row.** The failing check was not captured, so the cause is unknown. It may be the live Nominatim lookup or a timing check under load.
- The offline script's two failures were stale checks (old cache name, the removed word "Prototype"), corrected in the script.
- **Not tested:** how trimmed lines sound to a person, first instruction time on a phone.

**2026-11-02, Phase 12 (local production build, real Gnani and Gemini)**
- `npm run typecheck`: pass. `npm test`: 298 of 298 (server 282, web 16). E1-E5 rules only 5/5. 42 new lines generated, about 5.5 MB.
- Spoken "गलती से दब गया, सब ठीक है" through live Prisma, 8/8: offer spoken, question repeated, nothing cancelled by voice, dashboard note, case open, tap reaches Normal mode with Ayu speaking, case closes. The clip was Timbre speech through Chrome's fake mic, not a person.
- New cards, typed, live Gemini, 9/9: each asks its warning question before advice, then reaches its card with the tag. A yes to the vomit warning offers SOS with no advice. Silence reaches no advice.
- **The first run of the card test passed 3/3 falsely:** it never answered a question, yet cards appeared. That exposed the silent-advice bug. The test now answers each question and counts them.
- Regression: Normal 9/9, offline 5/5, failure run 15/15.
- **Three-screen failures explained.** They appeared intermittently, as "2/3" with a click timeout. Cause: a test race. After the last answer, Yes/No stay on screen for a moment; the test could catch "Haan" there, and it does not return until the CPR steps end, past Playwright's 30 s. Forcing that timing reproduced the same failure 2/2, with the app correctly playing CPR steps. Waiting for the location question instead passes 11/11 under the same forced timing. A real tap in that moment is ignored by the server. The single 10/11 on 11-01 had no captured detail and may be a different cause.
- **Correction:** a run of "32 clean repeats" was false. A patch had broken the test script and the loop only searched for "FAIL", so crashes counted as passes. Discarded; repeats now require a real 11/11.
- **Not tested:** the new voice lines heard by a person, the audio starting from the tap on a real iPhone, Gemini-on triage scenarios.

**2026-11-02, Phase 13 (local production build, Chrome)**
- `npm test`: 298 of 298. Layout and safety run 9/9: no sideways overflow and SOS on the first screen at 7 sizes from 320x568 to 1920x1080, in all 3 languages; one SOS at the top; nav link lands clear of the navbar; navbar SOS starts the countdown; cancel returns home; SOS on a phone has no shapes and no glass.
- Regression on this build: Normal 9/9, three-screen 11/11, offline 5/5, Medical ID and share 7/7, failure run 15/15, slow network 4/4, false alarm by voice 8/8, new cards 9/9. The older card check that never answers now correctly ends in "see a doctor", so its 3 card lines fail by design; the 9/9 run replaces it.
- Facts read at source 11-02: 28.1% and 9.8% in the study abstracts through Europe PMC; "no formal cardiac arrest registry or a centralized emergency medical system" in Bhat 2021, as of 2021, also stated by a 2023 review; 20 deaths an hour and 1.72 lakh from PTI's report of the ministry's figures; 43.63% from Wikipedia's Census 2011 table; 112 from the Ministry of Home Affairs page. The ministry and census originals could not be opened.
- **Not tested:** Safari, real phones, smoothness on low-end Android.

**2026-11-08, weak networks, I59 (local production build)**
- µ-law encoder matches the G.711 reference values and keeps speech above 30 dB SNR. `npm test` 304 of 304 (server 288, web 16).
- Throttled relay, 300 ms round trip, SOS opening and first question from stored audio, two runs each: 100 kbps, first sound 1.37 s to 0.72 s, opening arrived 6.2 s to 2.5 s; 400 kbps, 0.58 s to 0.42 s, 1.8 s to 0.9 s. Data 134 KB to 51 KB. Below about 200 kbps the voice still arrives slower than it plays.
- Live 40-call stream test with µ-law on the mic (`eval/results/scorecard-stream-mulaw.md`): script 40/40, landmark 37/40 (all "Aminabad" in street 5 dB and phone 8 kHz), number 8/8, short answers 15/16 (one "हाँ" lost on phone 8 kHz). Mic µ-law dropped as a result.
- Browser, with µ-law voice and raw mic: spoken false alarm through live Prisma 8/8, failure run 15/15 (beat and every line played), cards 9/9, chat 9/9, three-screen 11/11, offline 5/5, Medical ID 7/7, seven pages 23/23.
- Contrast in Hindi and Hinglish on the dark pages: 0 failures with the floating SOS hidden. With it shown, 8 readings fall where it sits over text while scrolling; the page has room to scroll every line clear of it.
- **Not tested:** how µ-law voice sounds to a person on a phone speaker.

**2026-11-07, seven-page dark redesign, I58 (local production build, Chrome)**
- `npm test` 298 of 298. Seven-page run 23/23: each page from the navbar and marked current, SOS in reach on every page (navbar on PC, floating on phones), phone menu, 7 scripts and 8 topics read from the files, no sideways overflow on any page at 6 sizes in 3 languages, Home SOS on the first screen at every size (failed at 320x568 and 1024x768 in Hindi until the intro moved below the buttons on short screens).
- Regression: chat 9/9, three-screen 11/11, offline 5/5, Medical ID and share 7/7, failure run 15/15.
- Contrast, English, all 7 pages, PC and phone: 2 failures fixed (faint step numbers; the floating SOS covering the last line). Gradient headings checked by colour: weakest 4.46:1, used only on large text. Hindi and Hinglish not re-measured on the dark pages.
- A first run reported 70 failures and several broken flows. Causes: the checker read gradient text as transparent, two test runs shared one port, and Home now has two Talk buttons. All three were test faults, fixed before re-measuring.
- Staging failed with "Permission denied" while OneDrive was syncing `.git`; a retry seconds later succeeded.

**2026-11-03, Phase 14 (local production build, Chrome)**
- Contrast 0 below AA after fixes (was 62). Two first-run readings of 1.09 were the script's fault: text half off screen or under the sticky navbar. Fixed in the script before re-measuring.
- `npm test` 298 of 298. Layout 9/9, Normal 9/9, offline 5/5, Medical ID and share 7/7, three-screen 11/11. `/og.png` served as `image/png`.
- A first regression pass showed design 8/9 and Medical ID 0/1. Cause: a test server the assistant left running on the same port, with a different dashboard password. Stopped; both passed on rerun.

---

## 13. Changelog

- **2026-11-07** Seven-page dark redesign after the team's reference site, then pushed with Phases 12 to 14.
- **2026-11-03** Split Home into four real pages at the team's request.
- **2026-11-03** Phase 14: fixed text contrast on the new design, added keyboard focus and a link preview card.
- **2026-11-02** Built Phase 13: site-wide redesign with shapes, glass and a navbar pill, and a four-section Home with sourced India facts.
- **2026-11-02** Built Phase 12: three home-care cards, two warning questions, better issue matching and the false-alarm offer. Found and fixed advice being given after silence. All planned build work is done.
- **2026-11-01** Built Phase 11: trimmed silence from stored audio, about 0.9 s faster to the first instruction.
- **2026-11-01** Team asked the assistant to work on the product only. Built Phase 10: waiting steps, CPR beat and encouragement, and fixes for four ways an SOS could silently fail. Cleared stale doctor-review and placeholder wording from this file.
- **2026-10-31** Created PLAN.md. Read live Gnani docs and challenge page; recorded differences. Built Phase 1 foundation on mocks. Copied source docs to `docs/`.
- **2026-10-31** First live Gnani runs. Fixed the Prisma streaming language header. Smoke test 5/5. R1 largely cleared.
- **2026-10-31** Team confirmed real voice works and approved Phase 2. Built SOS flow, case store, live dashboard, public-link guards and `render.yaml`.
- **2026-10-31** Deployed Phase 2 to Render; iPhone XR test passed apart from the map pin (R16). Built Phase 3: Gemini extraction, triage rules, protocol engine with placeholders, SOS conversation, answer buttons.
- **2026-10-31** Deployed Phase 3; voice flow passed on iPhone XR. Built pre-generated audio after the team reported late voice.
- **2026-10-31** At the team's request, rewrote git history and force-pushed to remove a name from the first commit. Commit hashes changed; code unchanged.
- **2026-11-01** Team asked to finish by Nov 2. Shortened SOS lines, added offline support, cut Medical ID and emergency contact, built the synthetic scorecard, drafted the write-up, demo script and posts.
- **2026-11-01** Phase 5 validated on iPhone XR. Built Phase 6: ER brief, case detail, transcript, timeline, driver view. Medical review parked by the team.
- **2026-10-31** Phase 4 validated on iPhone XR. Built Phase 5: Normal mode with fixed questions, warning signs, placeholder home-care cards and summary card. Fixed full-height SOS button.
- **2026-10-31** Fixed iPhone audio (R22). Built Phase 4: Nominatim read-back, simulated dispatch, status and re-check loop, barge-in, reconnect.
