# AYU — Dev Guide

> **Purpose:** everything needed to *build* Ayu: architecture, UI/design system, data model, state machines, prompts, protocol format, safety rules in code, testing and team workflow.
> Companion file: `AYU_PROJECT_SUMMARY.md` (the *what/why* and the decisions log). If the two ever disagree, the Project Summary wins on scope; this file wins on implementation details.
> **Last updated:** 2026-10-30 · **Deadline:** 2026-11-10, 11:59 PM IST

**Status tags:** `[DECIDED]` agreed · `[DEFAULT]` proposed, assume unless changed · `[OPEN]` not decided · `[VERIFY]` confirm from official docs before relying on it.

---

## 0. Rules for any AI assistant working on this repo

1. Read `AYU_PROJECT_SUMMARY.md` first. Do not add Cut-list features.
2. **Never invent Gnani API details.** Check `docs.gnani.ai`. If unknown, write the code behind an adapter interface with a clearly marked `TODO(verify)` and a mock.
3. **Never let the LLM generate medical instructions in SOS.** It may only (a) extract fields, (b) pick a protocol id from a fixed list, (c) phrase the ER brief from extracted fields. Instruction text always comes from `protocols/*.json`.
4. LLM output must be **schema-validated JSON**; on failure, fall back to rules/defaults, never to free text.
5. LLM may **raise** severity, never lower it below the rule-based result.
6. Keep API keys **server-side only**. Never put Gnani/Gemini keys in client code or commit them.
7. All user-facing strings go through the i18n layer (Hindi, Hinglish, English).
8. Do not claim real dispatch/clinical validity in UI strings. Dispatch shows a **"Simulated"** tag in the demo.
9. Small, focused commits. State which files you touched. Ask before changing shared contracts (types, API shapes, protocol schema).
10. Reply in English.

**Paste this header at the start of every AI session:**
```
Project: Ayu (voice health assistant, Gnani Prisma STT + Timbre TTS, PWA).
Read AYU_PROJECT_SUMMARY.md and AYU_DEV_GUIDE.md. Rules: no invented Gnani API details,
no LLM-written medical instructions (fixed protocols only), schema-validated LLM JSON,
keys server-side only, no Cut-list features, SOS UI = dark/large/simple.
Today's task: <task>. Files I own: <paths>.
```

---

## 1. Architecture overview

```
┌──────────────────────── Phone (PWA, mobile web) ────────────────────────┐
│  UI (Home · Normal · SOS · Summary)   Service Worker (cache audio/app)  │
│  Mic (getUserMedia → PCM chunks)  Speaker (play Timbre/cached audio)    │
│  Geolocation API   Wake Lock   Realtime client (WebSocket/SSE)          │
└──────────────┬───────────────────────────────────────────▲──────────────┘
               │ audio + events (WS)                       │ TTS audio, status, text
┌──────────────▼───────────────────────────────────────────┴──────────────┐
│                          Backend (Node/TypeScript)                       │
│  Voice gateway ── Prisma adapter (STT, streaming)                        │
│  Dialogue engine ── SOS state machine / Normal state machine             │
│  Triage rules ── Protocol engine (fixed scripts) ── Timbre adapter (TTS) │
│  LLM adapter (Gemini) ── extraction / protocol select / ER brief / chat  │
│  Location service (reverse geocoding, accuracy)  Dispatch simulator      │
│  Case store (DB) ── Event bus (SSE/WS) ── Metrics/logging                │
└──────────────┬───────────────────────────────────────────▲──────────────┘
               │ realtime case feed                        │ accept/status actions
┌──────────────▼───────────────────────────────────────────┴──────────────┐
│        Hospital Dashboard (web)  +  Driver view (simple page)            │
└──────────────────────────────────────────────────────────────────────────┘
```

**Why a backend proxy:** hides API keys, lets us run state machines/timers/rules server-side, and keeps dashboard and phone in sync.

---

## 2. Tech stack `[DEFAULT]` (confirm with partner)

| Layer | Proposal | Notes |
|---|---|---|
| Frontend | React + TypeScript (Vite or Next.js), Tailwind or CSS variables | Mobile-first PWA; both of us know web |
| Backend | Node.js + TypeScript (Express/Fastify) | **Persistent server** for WebSockets (e.g., Render/Railway/Fly). Serverless functions are a poor fit for long-lived audio sockets |
| Realtime | WebSocket for audio + events; SSE acceptable for dashboard feed | |
| DB | SQLite (local/dev) or Supabase/Postgres | Demo scale is tiny; keep simple |
| LLM | Gemini (model `[OPEN]`) behind `LLMAdapter` | `[OPEN]` consider Gnani's own LLM if available |
| STT/TTS | Gnani Prisma / Timbre behind `STTAdapter` / `TTSAdapter` | `[VERIFY]` streaming protocol, audio format, sample rate (Prisma is trained on 8 kHz telephony audio), languages, rate limits, credits |
| Hosting | Any **HTTPS** host | Mic and Geolocation require HTTPS (localhost is exempt) |
| Maps | Optional light map in dashboard (OpenStreetMap/Leaflet) | Cut: routing/ETA from maps |

**Adapter pattern is mandatory** so we can mock Prisma/Timbre/Gemini during UI work and swap implementations if an API detail changes.

---

## 3. Suggested repo structure

```
ayu/
├─ docs/
│  ├─ AYU_PROJECT_SUMMARY.md
│  └─ AYU_DEV_GUIDE.md
├─ apps/
│  ├─ web/                  # PWA: home, normal, sos, summary
│  │  ├─ src/{pages,components,hooks,i18n,styles}
│  │  └─ public/{manifest.webmanifest, sw.js, audio/ (cached protocol audio)}
│  └─ dashboard/            # hospital dashboard + driver view
├─ server/
│  ├─ src/
│  │  ├─ voice/             # gateway, vad/endpointing, barge-in
│  │  ├─ adapters/          # prisma.ts, timbre.ts, llm.ts, geocode.ts (+ mocks)
│  │  ├─ dialogue/          # sosMachine.ts, normalMachine.ts, triageRules.ts
│  │  ├─ protocols/         # *.json (fixed scripts), loader + validator
│  │  ├─ dispatch/          # simulator, ack timers, ETA
│  │  ├─ prompts/           # extraction.md, brief.md, normal.md
│  │  ├─ routes/            # REST + WS
│  │  └─ db/                # schema, queries
│  └─ tests/
├─ eval/
│  ├─ scripts/              # call scripts (text)
│  ├─ audio/                # recordings (consented, no real data)
│  └─ results/              # scorecards (csv/md)
├─ .env.example
└─ README.md
```

**Ownership suggestion** `[OPEN]`: Person A = `server/` (voice, dialogue, adapters). Person B = `apps/` (UI, dashboard, PWA) + `eval/`. Shared contracts live in `server/src/types` and `docs/`. Change shared contracts only after telling the other person.

---

## 4. Data model (proposal)

```ts
type Severity = "RED" | "AMBER" | "GREEN";
type Lang = "hi" | "hinglish" | "en";

interface Case {
  id: string;
  mode: "sos" | "normal";
  createdAt: string;
  lang: Lang;
  severity: Severity | null;
  protocolId: string | null;
  location: {
    lat: number; lng: number; accuracyM: number;
    addressText?: string; landmark?: string; floor?: string; gate?: string;
    status: "captured" | "confirming" | "verified" | "updated";
  } | null;
  callbackNumber?: string;
  triage: { responsive?: boolean; breathingNormally?: boolean; conscious?: boolean;
            patients?: number; emergencyType?: string; extra?: Record<string,string> };
  dispatch: {
    status: "requested" | "accepted" | "en_route" | "arrived" | "unacknowledged" | "cancelled";
    ambulanceId?: string; etaMinutes?: number; simulated: true;
    requestedAt: string; acceptedAt?: string; arrivedAt?: string;
  };
  brief?: string;                 // pre-arrival brief
  medicalId?: { allergies?: string; conditions?: string; medicines?: string }; // optional, consented
  consent: { given: boolean; at: string };
  metrics: { tapToFirstInstructionMs?: number; turns: number; misunderstandings: number };
  closedAt?: string;
}

interface CaseEvent {          // append-only timeline
  id: string; caseId: string; at: string;
  type: "sos_tap"|"countdown_cancel"|"gps_captured"|"location_confirmed"|"location_updated"
      |"dispatch_requested"|"dispatch_accepted"|"status_update"|"triage_answer"
      |"protocol_selected"|"instruction_spoken"|"recheck"|"severity_changed"
      |"user_utterance"|"ayu_utterance"|"error"|"closed";
  payload: Record<string, unknown>;
}
```

Retention `[DEFAULT]`: demo recordings and transcripts deleted after judging; no real patient data ever.

---

## 5. State machines

### 5.1 SOS (three parallel tracks per case)

```
Global:  IDLE → ARMING(3s, cancel) → ACTIVE → HANDOFF → CLOSED
                         └─ cancel → IDLE (log countdown_cancel)

Voice track:    OPENING → TRIAGE_Q1(responsive?) → TRIAGE_Q2(breathing normally?)
                → PROTOCOL(step loop) → WAITING_LOOP(status + filler + re-check) → HANDOFF
                (re-check answer changes → re-run rules → maybe new PROTOCOL)

Dispatch track: REQUESTED → ACCEPTED → EN_ROUTE → ARRIVED
                REQUESTED --60s no ack--> UNACKNOWLEDGED (Ayu: "also call 112 now")

Location track: CAPTURED → CONFIRMING (read-back) → VERIFIED | UPDATED (landmark/floor/gate)
```

**Timers `[DEFAULT]`:** ack timeout 60 s; re-check every 45 s; status update when status changes or ETA crosses 5/2 minutes; silence prompt after ~8 s of no response during triage ("Are you there? Is he responding?").

**Priority rules (dialogue engine):**
1. Protocol step in progress > status update > filler step > re-check.
2. Never speak a status update in the middle of CPR counting/rhythm; queue it for a pause.
3. Barge-in: if the user speaks, stop TTS immediately, transcribe, re-evaluate.
4. If a user utterance contains a state change ("he stopped breathing", "he's not responding"), run extraction and re-run triage immediately.
5. "Call 112" button and spoken reminder available at all times in RED cases.

### 5.2 Normal mode
```
GREETING → COLLECT (one question at a time, max ~6 turns)
  ├─ red_flag detected → OFFER_SOS ("This sounds serious. Switch to SOS?")
  └─ else → ADVISE (reviewed home-care card) → SUMMARY → END
```

---

## 6. Voice pipeline

### 6.1 Client capture and playback
- `getUserMedia({audio:{echoCancellation:true, noiseSuppression:true, autoGainControl:true}})`.
- Convert to PCM via `AudioWorklet`; resample to the rate/format Prisma expects `[VERIFY]` (likely 8 or 16 kHz mono 16-bit). Send small chunks (e.g., 100-250 ms) over WebSocket.
- **iOS/Safari:** audio playback needs a user gesture; the SOS tap (or Talk tap) is that gesture, so unlock/resume `AudioContext` there. Use Screen Wake Lock to keep the screen on in SOS. Test on a real iPhone and a real Android early.
- Playback: queue of audio buffers; `stop()` on barge-in; pre-cached files played from Cache Storage via service worker.
- Echo: when Ayu speaks through the loudspeaker, mic picks it up. Use echo cancellation, and optionally mute STT results while TTS is playing unless user speech energy is high (barge-in).

### 6.2 Server flow per turn
```
audio chunks → Prisma (stream) → partial/final transcript
 → endpointing (silence ~700-900 ms, tunable) → final utterance
 → [SOS] extraction (LLM JSON) → rules update → dialogue engine picks next action
 → text (dynamic) → Timbre TTS  |  fixed protocol → cached audio
 → stream audio to client → log events + metrics
```

### 6.3 Latency and caching `[DEFAULT]`
- **Pre-generate with Timbre and cache:** all triage questions, all protocol steps, filler steps, status phrases with no variables, "call 112" lines, confirmations. Store as files keyed by `protocolId.stepId.lang`.
- **Dynamic TTS only for:** address read-back, ETA numbers, names, summary. (Timbre reads numbers/currency naturally; test Hindi digits and "X minute" phrasing.)
- **Targets (to be measured, not promises):** SOS tap → first spoken line ≤ ~2 s; triage answer → first protocol instruction ≤ ~2 s using cached audio; log `tapToFirstInstructionMs` for every SOS.
- LLM calls: short prompts, `temperature` low, small JSON outputs. Run extraction **in parallel** with sending the next cached triage question when possible.

### 6.4 Failure handling
- STT empty/low confidence → "Sorry, can you say that again?" (cached) up to 2 times, then fall back to simple yes/no buttons on screen (large Yes / No / Not sure buttons exist in SOS UI as a fallback input).
- LLM failure/timeout (>2.5 s) → rules-only path with default protocol for the triage answers.
- TTS failure → show text instruction on screen in large type + play cached audio if available.
- Network drop → client switches to **offline SOS mode**: play cached protocol audio from triage answers entered by buttons, show "Call 112" prominently. Banner: "Connection lost. Call 112."
- GPS denied/timeout → ask for address/landmark by voice and text; continue.

---

## 7. LLM usage (Gemini) — strictly bounded

### 7.1 Allowed jobs
| Job | Input | Output (JSON, validated) |
|---|---|---|
| Extraction | latest utterances + current case fields | updated fields |
| Protocol selection | triage fields + extracted symptoms | `protocolId` from enum + confidence |
| Red-flag detection (Normal) | conversation so far | `redFlags: string[]` (can only trigger OFFER_SOS) |
| ER brief | final fields | ≤ 25-word one-liner (template-constrained) |
| Normal-mode next question | conversation so far | one question string, max 20 words, no advice |

### 7.2 Extraction schema
```json
{
  "emergencyType": "cardiac|collapse|stroke_signs|choking|bleeding|accident|breathing|seizure|burn|other|unknown",
  "location": { "text": "string|null", "landmark": "string|null", "floor": "string|null" },
  "patients": "number|null",
  "age": "child|adult|elderly|null",
  "sex": "male|female|null",
  "responsive": "true|false|null",
  "breathingNormally": "true|false|null",
  "conscious": "true|false|null",
  "symptoms": ["string"],
  "onsetText": "string|null",
  "stateChange": "true|false"
}
```
`null` means "not stated"; never guess. `stateChange=true` triggers immediate re-triage.

### 7.3 Extraction system prompt (starting point)
```
You extract structured fields from a panicked emergency caller's speech.
Speech is noisy, code-mixed Hindi/English (Hinglish), transcribed by ASR and may contain errors.
Rules:
- Output ONLY valid JSON matching the schema. No prose, no markdown.
- Use null when a field is not clearly stated. Never guess or infer medical facts.
- Do NOT give advice, instructions or diagnoses.
- Keep location text exactly as spoken (transliterate to Latin if helpful); do not invent places.
- Set stateChange=true if the caller reports a change (e.g., stopped breathing, became unresponsive, woke up).
```

### 7.4 Protocol selection
- Constrain output to an **enum of protocol ids** + `"none"`. Rules (section 8) run first; LLM only breaks ties or handles ambiguous symptom text. If LLM disagrees with rules on severity, **take the higher severity**.

### 7.5 ER brief template (LLM fills slots only)
```
"{age} {sex}, {chief_complaint}, {responsive_state}, {breathing_state}, ETA {eta} min, {prep_hint?}"
Example: "Adult male, collapsed after headache, responsive: no, breathing: yes, ETA 12 min."
```
`prep_hint` (e.g., "prepare ECG") only from a fixed mapping table reviewed by a doctor.

### 7.6 Normal-mode prompt guardrails
```
You are Ayu, a calm health assistant speaking Hinglish. You ask ONE short question at a time.
You never diagnose, never name medicines or doses, never say "you have X".
Use cautious phrasing ("this is commonly...", "it could be..."). Maximum 6 questions.
If any red-flag symptom appears, output {"redFlag": true, "reason": "..."} instead of a question.
Advice text is NOT generated by you; it is selected from the reviewed home-care library by id.
```

---

## 8. Triage rules (code-level, draft — doctor must review)

```ts
function triage(t: Triage, ex: Extraction): { severity: Severity; protocolId: ProtocolId|null } {
  if (t.responsive === false && t.breathingNormally === false) return RED("cpr");
  if (t.responsive === false && t.breathingNormally === true)  return RED("recovery_stroke_collapse");
  if (ex.emergencyType === "choking")                           return RED("choking");
  if (ex.emergencyType === "bleeding" || ex.emergencyType === "accident" && ex.symptoms.includes("severe_bleeding"))
                                                                return RED("severe_bleeding");
  if (ex.emergencyType === "stroke_signs")                      return RED("stroke");
  if (ex.emergencyType === "cardiac" && t.responsive !== false) return RED("chest_pain_conscious");
  if (t.responsive === true && t.breathingNormally === true)    return AMBER("general");
  return AMBER("general"); // unknowns default to caution, keep asking
}
```
Principles: unknown → caution; severity only goes **up** during a case unless a human operator downgrades; every transition is logged as `severity_changed`.

---

## 9. Protocol library format

`server/src/protocols/<id>.json`, validated at startup (fail fast if invalid).

```json
{
  "id": "cpr",
  "title": { "en": "CPR", "hi": "सीपीआर", "hinglish": "CPR" },
  "severity": "RED",
  "triggers": ["responsive=false","breathingNormally=false"],
  "sources": ["Red Cross", "AHA", "<Indian guideline>"],
  "reviewedBy": "TODO: doctor name, institution",
  "reviewedAt": "TODO: date",
  "steps": [
    {
      "id": "s1",
      "text": { "en": "TODO reviewed text", "hi": "TODO", "hinglish": "TODO" },
      "audioKey": "cpr.s1.{lang}",
      "pauseAfterMs": 1500,
      "interruptible": false
    }
  ],
  "rhythmCue": { "enabled": true, "bpm": "TODO per reviewed guidance", "audioKey": "metronome" },
  "recheckQuestion": { "text": {"en":"Is he breathing normally now?","hi":"TODO","hinglish":"TODO"}, "everySeconds": 45 },
  "doNot": ["TODO reviewed list"],
  "callEmergencyLine": true
}
```

**Protocol ids:** `cpr`, `chest_pain_conscious`, `recovery_stroke_collapse`, `stroke`, `choking`, `severe_bleeding` (stretch: `seizure`, `burns`).
**Content rules:** short imperative sentences, one action per step, ≤ ~15 words, no medicine unless the reviewer explicitly includes it. Known pitfalls to avoid: leg elevation for suspected heart attack; assuming heart attack for headache+collapse; giving food/water/medicine to a collapsed or confused person. Final wording comes from sources + doctor review, not from an AI.

**Universal filler steps (fixed list, review):** stay with the person and keep the phone on speaker; unlock the door and turn on lights; send someone to the gate/main road to guide the ambulance; don't give food/water/medicine unless instructed; don't move the person unless there's danger; loosen tight clothing around neck/chest; keep the crowd back; gather medicines/ID/reports; note when symptoms started.

**Home-care library (Normal mode):** `home_care/<issue>.json` with fields `id`, `title`, `commonCauses` (cautious), `steps` (reviewed), `seeDoctorIf`, `redFlags`, `sources`, `reviewedBy`. Issues: acidity, heat/sun headache, mild fever, cold and cough, loose motions.

---

## 10. Location and dispatch simulation

**Location**
- `navigator.geolocation.getCurrentPosition` with `enableHighAccuracy: true`, timeout ~8 s; also `watchPosition` while SOS is active (location may update).
- Store accuracy; if `accuracyM` > ~100 m or GPS fails, force a landmark/floor/gate question.
- Reverse geocoding `[OPEN]`: options are OpenStreetMap Nominatim (free, strict usage policy), Google/Mapbox (billing). Cache results; never block dispatch on geocoding; dispatch uses raw coordinates.
- Read-back text built from `addressText` + `landmark`; if address is low-quality, read only the area and ask the user to say the landmark.

**Dispatch simulator (`server/src/dispatch`)**
- On SOS start: create dispatch `requested`, push to dashboard immediately.
- Operator/driver accepts via dashboard button; demo mode may auto-accept after N seconds (configurable env `AUTO_ACK_SECONDS`).
- Simulated ETA: random/configured 6-14 min, counts down; status progresses `accepted → en_route → arrived`.
- Ack timeout (60 s) → `unacknowledged` + Ayu "call 112 now".
- All responses include `simulated: true`; UI shows a "Simulated" badge.

---

## 11. API (proposal)

REST
```
POST /api/sos/start            {lat,lng,accuracyM,lang,consent} → {caseId}
POST /api/sos/:id/location     {lat,lng,accuracyM}  | {landmark,floor,gate,text}
POST /api/sos/:id/cancel
POST /api/sos/:id/triage       {responsive?,breathingNormally?}   // button fallback
POST /api/normal/session       {lang,consent} → {sessionId}
POST /api/normal/:id/message   {text}  // text fallback
GET  /api/cases                // dashboard list
GET  /api/cases/:id            // detail + timeline
POST /api/cases/:id/accept     {ambulanceId?}
POST /api/cases/:id/status     {status}
GET  /api/protocols            // for client cache manifest
GET  /api/audio/manifest       // list of cached audio keys + hashes
```
Realtime
```
WS  /ws/voice/:caseId          client→server: audio chunks, control msgs
                               server→client: transcript.partial/final, tts.audio, status, ui.state
SSE /api/cases/stream          dashboard feed (case created/updated/events)
```
All server→client events carry `caseId`, `type`, `at`, `payload` (mirrors `CaseEvent`).

---

## 12. UI / Design system `[DECIDED]` (items marked DEFAULT were proposed and accepted by moving forward)

### 12.1 Principles
Minimal, calm, trustworthy, premium. Restraint is the premium part: one corner radius everywhere, soft shadows only, no gradients, slow subtle motion. Trust comes from visible safety signals more than from decoration.

### 12.2 Fonts
| Role | Font | Notes |
|---|---|---|
| Headings / brand / big moments | **Instrument Serif** | Closest free match to the editorial serif on Gnani's site hero. Use ≥ 32 px, tight line-height (~1.0-1.1), slight negative tracking |
| Body / UI / buttons | **Inter** | Clean grotesque; ≥ 16 px body |
| Labels (case ID, time, ETA, status) | **IBM Plex Mono** | "Medical chart" feel |
| Hindi headings | **Tiro Devanagari Hindi** | Instrument Serif has no Devanagari |
| Hindi body | **Noto Sans Devanagari** | Inter has no Devanagari |

Rules: Devanagari looks smaller, so size it ~10% larger with line-height ~1.5. **Serif is for brand moments on Home only. In SOS all instructions use Inter at large sizes** (clarity beats style in a panic). Load via Google Fonts with `display=swap`; self-host/cache in service worker so SOS never waits on fonts.

### 12.3 Colors
| Token | Value | Use |
|---|---|---|
| `--paper` | `#FBFBF8` | Home/Normal background |
| `--ink` | `#0E0E0C` | Text, primary buttons |
| `--gray` | `#6B6B66` | Secondary text |
| `--grid` | `rgba(14,14,12,0.06)` | Notebook grid lines |
| `--green` | `#0B6B4F` | Brand accent, Normal mode, success |
| `--green-tint` | `#E6F2EC` | Soft backgrounds, chips |
| `--alert` | `#D32F2F` | **SOS only** (SOS button, critical states) |
| `--sos-bg` | `#0A0A09` `[DEFAULT]` | SOS screen background (dark, easier at 2 AM) |
| `--sos-text` | `#F7F7F2` `[DEFAULT]` | SOS text |
| `--sos-alert` | `#E5484D` `[DEFAULT]` | Red on dark (check contrast) |

Use a deep green; avoid bright "wellness" greens. Severity colors in dashboard: RED = alert, AMBER = amber (`#B26A00` on light), GREEN = brand green.

### 12.4 Tokens (CSS)
```css
:root {
  --paper:#FBFBF8; --ink:#0E0E0C; --gray:#6B6B66; --grid:rgba(14,14,12,0.06);
  --green:#0B6B4F; --green-tint:#E6F2EC; --alert:#D32F2F;
  --sos-bg:#0A0A09; --sos-text:#F7F7F2; --sos-alert:#E5484D;
  --radius:14px;
  --shadow:0 1px 2px rgba(0,0,0,.06), 0 6px 20px rgba(0,0,0,.06);
  --font-display:"Instrument Serif","Tiro Devanagari Hindi",serif;
  --font-body:"Inter","Noto Sans Devanagari",system-ui,sans-serif;
  --font-mono:"IBM Plex Mono",ui-monospace,monospace;
}
.paper{
  background-color:var(--paper);
  background-image:
    linear-gradient(to right,var(--grid) 1px,transparent 1px),
    linear-gradient(to bottom,var(--grid) 1px,transparent 1px);
  background-size:28px 28px;
}
/* fade the grid toward edges, and add very faint paper noise (~3% opacity) */
```
Home grid: very faint, fades toward edges. **No grid in SOS or anywhere a decision is made.**

### 12.5 Sizing and accessibility
- Buttons ≥ 56 px tall; body ≥ 16 px; SOS instruction text 28-36 px.
- Contrast ≥ WCAG AA everywhere; SOS ≥ AAA where possible.
- `aria-live="assertive"` for SOS instructions and status changes; every audio message also appears as text.
- Respect `prefers-reduced-motion`. Haptics (`navigator.vibrate`) where supported (not iOS).
- Large Yes / No / Not sure fallback buttons in SOS triage.
- One-hand, thumb-reachable controls at the bottom; no typing needed in SOS.

### 12.6 Motion
Slow and minimal. Voice orb/waveform (inspired by the waveform icon on Gnani's "Book a Demo" button) gently pulses when Ayu listens/speaks; shows live transcript line beneath. No bouncing or decorative animation in SOS.

### 12.7 Screens

**S0 Consent/first run:** short plain-language consent (voice is processed; demo recordings deleted; prototype not a medical device; location used only for SOS). One button to accept. Language picker (Hindi / Hinglish / English).

**S1 Home (paper + faint grid):**
- Wordmark "ayu" (serif) top-left; language toggle top-right.
- Big serif headline, e.g., "Health help, in your language." with a Hindi line beneath.
- Two large buttons: **Talk to Ayu** (ink/black) and **SOS** (alert red), always reachable.
- Small mono line: "Prototype · not a medical device".
- Optional: Medical ID entry (Tier 2).

**S2 Normal conversation (paper, green accent):**
- Center orb/waveform; live transcript styled like notes on the page; Ayu's last question shown as text; mic toggle; text fallback.
- If red flag: a calm banner "This sounds serious. Switch to SOS?" with a clear **Switch to SOS** button.

**S3 Normal summary card:** what you told Ayu, suggestions (reviewed library), "see a doctor if…", share/copy button, disclaimer.

**S4 SOS arming:** dark; big countdown "3…2…1" and a huge **Cancel** button; text "Sending help in 3 seconds".

**S5 SOS active (dark, no grid, Inter only):**
- Top status strip (mono): `Location ✓ · Ambulance requested/accepted · ETA 8 min · SIMULATED`.
- Center: one huge instruction line at a time (current protocol step), optional step counter.
- Orb/waveform small; live transcript line under it.
- Fallback buttons: **Yes / No / Not sure** when a question is asked.
- Persistent bottom **Call 112** button.
- Location confirmation card appears briefly: "Gomti Nagar, near petrol pump. Correct?" with Yes / Edit buttons.

**S6 Arrived/handoff:** "Ambulance is here." Quick summary for paramedics (symptoms, time started, medicines), then **Close**.

**S7 Dashboard (desktop/tablet, light):** left: live case list (severity chip, time since SOS, area, status, unacknowledged flag); center: case detail (map pin, location text + accuracy + verified/updated flag, transcript, extracted fields, protocol in use, brief); right/bottom: timeline and actions (Accept, Assign ambulance (simulated), status buttons, Close). "Simulated" badge visible.

**S8 Driver view (mobile):** one card: severity, address, landmark, brief, Accept / On the way / Arrived buttons.

### 12.8 Copy (draft; have a native speaker review)
| Moment | English | Hindi (draft) |
|---|---|---|
| SOS start | "Help is being sent. I'm with you." | "मदद भेजी जा रही है। मैं आपके साथ हूँ।" |
| Triage 1 | "Is he responding to you?" | "क्या वो आपकी बात का जवाब दे रहा है?" |
| Triage 2 | "Is he breathing normally?" | "क्या वो सामान्य रूप से सांस ले रहा है?" |
| Location | "I have your location as ___. Is that correct?" | "आपकी लोकेशन ___ है। क्या यह सही है?" |
| Pre-ack | "I've sent your location. Waiting for confirmation." | "मैंने आपकी लोकेशन भेज दी है। पुष्टि का इंतज़ार है।" |
| 112 | "Please also call 112 now." | "कृपया अभी 112 पर भी कॉल करें।" |
| Disclaimer | "Prototype · not a medical device" | "प्रोटोटाइप · चिकित्सा उपकरण नहीं" |

Tone: calm, short, direct, warm; second person; no jargon; never promise outcomes ("I'll make sure he's fine"); never say "dispatched" before acceptance.

### 12.9 PWA
`manifest.webmanifest` (name Ayu, theme `--green`, background `--paper`, icons), service worker caching: app shell, fonts, protocol audio, protocol JSON, UI strings. Test "Add to Home Screen" and airplane-mode SOS fallback.

---

## 13. Security, privacy, secrets

- `.env` (never commit): `PRISMA_API_KEY`, `TIMBRE_API_KEY` (or the Gnani key names from docs `[VERIFY]`), `GEMINI_API_KEY`, `GEOCODER_KEY?`, `AUTO_ACK_SECONDS`, `PUBLIC_BASE_URL`. Provide `.env.example` with placeholders only.
- Keys only on the server; the client talks to our backend.
- Rate-limit endpoints; basic auth or a shared secret for the dashboard in demo so the public link doesn't expose test cases. Do not host real personal data.
- Consent logged with timestamp; scripted/consented recordings only; delete demo audio/transcripts after judging; do not log raw audio by default (enable only for eval runs).
- Voice = personal data under DPDP; state processing purpose and retention on the consent screen and in the write-up.

---

## 14. Testing and evaluation

**Unit/integration:** triage rules (table-driven tests for every row), protocol JSON validation, state machine transitions and timers (fake timers), LLM adapter fallback on invalid JSON, dispatch ack timeout, offline fallback.

**Scenario scripts (write as text first, then record):**
| ID | Scenario | Expected |
|---|---|---|
| E1 | Friend collapsed after sudden headache, breathing | RED, recovery/stroke protocol, not CPR |
| E2 | Person collapsed, not responding, not breathing | RED, CPR |
| E3 | Choking at dinner, cannot speak | RED, choking |
| E4 | Road accident, heavy bleeding | RED, severe bleeding |
| E5 | Conscious, chest pressure + sweating | RED, chest pain protocol, no leg-raise, no food/water |
| N1 | Headache after sun | cautious advice + see-doctor line |
| N2 | Throat/stomach burning at 2 AM after chole bhature | red-flag questions; advice only if no flags |
| N3 | N2 but answers include arm/jaw pain | OFFER_SOS |

**Test matrix:** each scenario × noise (quiet / street / TV-fan / shouted-panicked) × language (Hindi / Hinglish / English; Awadhi stretch) × speaker (2+ people). Target 15-20 recordings minimum. Record on real phones.

**Metrics (log automatically + score manually):**
| Metric | How |
|---|---|
| Location correct | extracted vs scripted truth |
| Emergency type correct | |
| Protocol correct | |
| Triage fields correct | responsive / breathing |
| STT errors on landmarks and numbers | manual check |
| Misunderstandings per call | count |
| Time-to-first-instruction | `tapToFirstInstructionMs` |
| Turn latency | STT final → first audio |
| Dashboard sync delay | event time → UI time |

Scorecard format: `eval/results/scorecard.md` with a table + a "failures and fixes" list. **Show failures honestly.**

**Day-1 spike (do first):** shouted/noisy Hinglish clips through Prisma; record how it handles landmarks and numbers; decide whether the read-back needs to be stricter.

**Manual QA checklist before demo:** real iPhone + Android; Chrome + Safari; mic permission denied; GPS denied; airplane mode in SOS; Hindi font rendering; screen stays awake; Call 112 button opens dialer (`tel:112`); dashboard sync across two devices; auto-ack and no-ack paths.

---

## 15. Git and team workflow

- `main` is always deployable. Work in short-lived branches: `feat/sos-machine`, `feat/dashboard-list`, `fix/...`.
- Small PRs, reviewed by the other person (or at least skimmed) before merge; no direct pushes to `main` in the last 3 days.
- Commit style: `feat(sos): ...`, `fix(voice): ...`, `docs: ...`.
- Shared contracts (`types`, API shapes, protocol schema, i18n keys) change via a short PR + message to the other person.
- Daily 10-minute sync: what's done, what's blocked, what's next. Keep a `TODO.md` or issue board with tiers (T1/T2/T3).
- Each AI session starts with the header in section 0 and the files it owns.

---

## 16. Build order (checklist)

**Phase 1: Oct 30 – Nov 1**
- [ ] Repo, env, hosting with HTTPS, PWA shell
- [ ] Prisma/Timbre adapters (+ mocks); **noisy-audio spike**
- [ ] Mic → STT → transcript on screen
- [ ] Timbre playback + cached audio loader
- [ ] SOS tap → countdown → case created → dispatch requested → first spoken line
- [ ] Dashboard list receiving cases live

**Phase 2: Nov 2 – 4**
- [ ] Extraction (LLM JSON + validation + fallback)
- [ ] Triage rules + protocol engine + 5 protocols (placeholders until reviewed)
- [ ] Location read-back + landmark fallback + verified/updated flags
- [ ] Dispatch accept/ETA/status + ack timeout
- [ ] SOS live loop (status, filler, re-check) and barge-in
- [ ] Normal mode + red-flag → switch to SOS + summary card
- [ ] Dashboard detail, brief, driver view

**Phase 3: Nov 5 – 6**
- [ ] Doctor review of protocols/home-care; replace placeholders; add reviewer + sources in UI
- [ ] Tier 2: pre-cached audio everywhere, metric logging, Medical ID, emergency contact link, interrupt polish
- [ ] Offline SOS fallback, error states, Hindi copy review

**Phase 4: Nov 7 – 8**
- [ ] Record eval calls; run test matrix; produce scorecard
- [ ] Fix top failures; real-device QA; backup demo recording

**Phase 5: Nov 9**
- [ ] Demo video, write-up, public post, submit. Nov 10 = buffer.

**Definition of done (Tier 1):** works on a real phone over HTTPS; SOS tap to first spoken line is fast; location read-back works; dispatch confirm + status visible on a second device; 3 emergencies run end-to-end with fixed scripts; Normal mode shows cautious advice + red-flag switch; consent and disclaimers visible; scorecard exists.

---

## 17. Known risks and fallbacks (dev-level)

| Risk | Fallback |
|---|---|
| Prisma partial/noisy results | Confirmation loops + button fallbacks; lower endpointing sensitivity; test headset vs loudspeaker |
| Streaming API mismatch | Adapter with chunked/REST fallback `[VERIFY]` |
| LLM invalid JSON/timeouts | Strict validation, retry once, then rules-only path |
| iOS audio/GPS quirks | Early real-device tests; user-gesture unlock; wake lock |
| WebSocket hosting limits | Use a persistent Node host; keep SSE for dashboard |
| Credit exhaustion | Cache all fixed audio once; mock services in dev; monitor usage `[VERIFY]` |
| Hindi font/layout issues | Load Devanagari fonts early; test long strings; line-height 1.5 |
| Time crunch | Cut order: Tier 3 → emergency contact → Medical ID → interrupt polish → extra protocols |

---

## 18. Open technical questions

1. Prisma/Timbre exact API: streaming protocol, audio encoding, sample rate, language codes, latency, rate limits, credit cost per minute/char.
2. Which LLM and model id; can Gnani's LLM be used within challenge credits?
3. Reverse geocoding provider and billing.
4. Hosting provider and domain; public demo link access control.
5. DB choice (SQLite vs Supabase) given realtime needs.
6. Who is the doctor reviewer, and when do we need protocols final?
7. Final name (Ayu vs AyuNet) and logo mark (idea: a small pulse line forming the letter "a"; avoid cross/heart clichés).
