# AYU — Project Summary

> **Purpose of this file:** the single source of truth for *what* we are building and *why*, and every decision made so far. Companion file: `AYU_DEV_GUIDE.md` (the *how*: architecture, UI system, code-level rules).
> **Last updated:** 2026-10-30 · **Deadline:** 2026-11-10, 11:59 PM IST · **Status:** planning finished, build starting.

**Status tags used in this file**
- `[DECIDED]` — agreed by the team, do not change without discussion.
- `[DEFAULT]` — proposed in planning and accepted by moving forward; assume it unless the team changes it.
- `[OPEN]` — not decided yet.
- `[VERIFY]` — a fact we must confirm from official docs before relying on it.

---

## 0. Instructions for any AI assistant reading this file

1. Treat this file as the source of truth for scope. If a request conflicts with it, say so before proceeding.
2. **Never invent Gnani API details** (endpoints, parameters, audio formats, limits, pricing, credits). Anything marked `[VERIFY]` must be checked at `docs.gnani.ai` / `gnani.ai/internship`.
3. **Medical safety is non-negotiable.** In SOS mode the LLM never writes free-form medical advice. It only picks from a fixed, pre-reviewed protocol library (section 10). Do not "improve" protocol wording.
4. Do not add features from the **Cut list** (section 6.4) unless the team agrees.
5. Do not claim real dispatch, real ambulances, or clinical validity anywhere in code, UI or docs. Dispatch is **simulated**.
6. The product serves Hindi / Hinglish speakers first. Write user-facing strings in Hindi, Hinglish and English (see Dev Guide for copy rules).
7. Reply to the team in English. Keep answers practical and short unless asked for depth.

---

## 1. One-paragraph summary

**Ayu** is a voice-first healthcare assistant for Indian users, built as a mobile-first web app (PWA) on Gnani.ai's **Prisma** (speech-to-text) and **Timbre** (text-to-speech). It has two modes. **Normal mode** handles everyday, non-emergency health questions by voice. **SOS mode** is for emergencies: one tap shares the phone's location, creates a dispatch case (simulated in the demo), and Ayu talks the caller through first aid, using fixed, reviewed protocols, until help arrives, while also giving live ambulance status. A hospital dashboard shows incoming cases with an auto-generated pre-arrival brief for the ER.

**Pitch line:** *"Ayu is a Hindi/Hinglish voice health assistant for the moment you're panicking, it's 2 AM, and no doctor is reachable."*

**Name:** `[DEFAULT]` Ayu (alternative considered: AyuNet).

---

## 2. Context: the Gnani.ai challenge

| Item | Detail |
|---|---|
| Challenge | Great Indian AI Internship Challenge 2026 by Gnani.ai (Bengaluru) |
| Deadline | **Nov 10, 2026, 11:59 PM IST** (plan to submit by night of Nov 9) |
| Prizes | Up to 100 paid six-month internships starting Jan 1, 2027, plus ten awards of ₹50,000 each |
| Awards vs internships | Awards are judged **separately** from the internship shortlist |
| Award limit | A person/team can win **at most one** award |
| Categories (reported) | Include Indian-language applications, code-mixed voice experiences, **real-world impact**, creativity, solo and team entries. `[VERIFY]` the exact list on gnani.ai/internship; "healthcare tech" is **not** confirmed as a separate award |
| Mandatory | Every entry must use Gnani models/APIs and **name each one used** in the submission |
| Gnani models | Prisma v2.5 (STT; Hindi/Hinglish and other Indian languages; streaming), Timbre v2.5 (TTS, beta). Gnani also lists other models (e.g., Warp speech-to-speech, Aion/Evon language models) `[VERIFY]` availability in challenge credits |
| Credits | 5,000 credits on the Gnani API dashboard (app.gnani.ai/voice). For teams, credits go to the **primary registrant**, so decide who holds the API key `[VERIFY]` |
| Team | Individual or team of two |
| Submission | A working app, a public demo, and an explanation of how it was built `[VERIFY]` exact format on the official page |
| Shortlist | Interviews after the challenge closes |
| Judging themes heard | Real user need, a working solution, production-ready over flashy demos, honest limitations over faked results |

**Target:** `[DECIDED]` Win **Real World Impact** (primary), and be strong for the internship shortlist. Voice depth (code-mixed, noisy speech) covers the other categories as a bonus. Remember: only one award per entrant.

---

## 3. Problem, users, why it matters

**Problem.** In an emergency, the first two minutes matter most, but:
- A panicked caller (often crying, speaking Hinglish, with background noise) must explain location, condition and urgency to a stranger.
- Small hospitals (30-100 beds) typically have no 24x7 call centre. At 2 AM a single front-desk person has to decode a landmark ("petrol pump ke paas, Gomti Nagar side"), judge severity, and ring the driver.
- Bystanders usually don't know what to do until help arrives, and often do the wrong thing (give water, move the person, wrong position).
- For non-emergencies at night ("acidity", "headache after sun"), people have no one to ask, and may either ignore a serious sign or panic over a minor one.

**Primary users**
- Bystanders/family in an emergency (Hindi/Hinglish speakers; small-town and non-English users benefit most).
- Individuals with minor health questions at odd hours.
- Hospital front-desk/ER/ambulance teams (via dashboard).

**Why voice:** panic, stress, elderly users, and low literacy make typing impractical. Prisma is built for noisy, telephony-grade, code-mixed Indian speech.

---

## 4. Product overview

### 4.1 Two modes, one app `[DECIDED]`
- **Home screen has two big buttons:** `Talk to Ayu` (Normal) and `SOS`.
- Mode is chosen by the **user pressing a button**. Automatic routing between modes is **postponed** `[DECIDED]`.
- **Exception (minimal safety net):** in Normal mode, a small rule-based *red-flag screen* can show a **"Switch to SOS"** prompt when answers sound serious. This is a prompt, not an automatic switch.

### 4.2 App form `[DECIDED]`
Mobile-first **PWA** (single web link). Reasons: mic and GPS access, no app store, one demo link, fastest build in the time left. No real telephony.

### 4.3 Stack at a glance `[DEFAULT]`
- Gnani **Prisma** (speech-to-text) and **Timbre** (text-to-speech): the voice layer.
- **Gemini** (or equivalent LLM): structured extraction, protocol *selection*, ER brief wording, Normal-mode conversation. `[OPEN]` consider Gnani's own LLMs if available (stronger "uses Gnani" story).
- Browser Geolocation API, small backend, realtime dashboard.
- Full detail in `AYU_DEV_GUIDE.md`.

---

## 5. Decisions log

| # | Decision | Status |
|---|---|---|
| 1 | Product = healthcare voice assistant "Ayu" with Normal + SOS modes | DECIDED |
| 2 | Mode selected by button; auto-routing postponed | DECIDED |
| 3 | SOS: one tap = location + dispatch case + voice guidance | DECIDED |
| 4 | Dispatch fires **immediately** on SOS; questions come after | DECIDED |
| 5 | Dispatch is **simulated** in the demo; labeled in UI and write-up | DECIDED |
| 6 | Location is **confirmed by voice** (read-back) with landmark fallback | DECIDED |
| 7 | Ambulance dispatch is **confirmed** (driver/operator accepts); Ayu never says "dispatched" before acceptance | DECIDED |
| 8 | Triage = two quick questions: responding? breathing normally? Answers drive severity by **rules**, not LLM guess | DECIDED |
| 9 | While waiting, Ayu gives **live status** (dispatched, ETA, "arriving soon") and **general helpful steps** | DECIDED |
| 10 | Fixed, reviewed **protocol library**; LLM only selects a protocol, Timbre reads the fixed script | DECIDED |
| 11 | Always tell the caller to also call **112** in red cases | DECIDED |
| 12 | Normal mode: small curated home-care library, cautious wording, always "see a doctor if…" | DECIDED |
| 13 | Replies/UX Hindi/Hinglish first, English second | DECIDED |
| 14 | UI: editorial serif headings + clean sans body; white/black/gray + health green; paper-grid home | DECIDED |
| 15 | Red used **only** for SOS/critical states | DEFAULT |
| 16 | SOS screen is dark; grid used on Home only | DEFAULT |
| 17 | SOS activation: tap → 3-second countdown with big Cancel (no "Are you sure?" popup) | DEFAULT |
| 18 | Pre-cache protocol audio (Timbre) so guidance plays instantly and offline | DEFAULT |
| 19 | Target award: Real World Impact | DECIDED |

---

## 6. Feature list (final)

### 6.1 Tier 1 — must ship

| # | Feature | Notes |
|---|---|---|
| 1 | Home screen with `Talk to Ayu` and `SOS` | Huge buttons, no typing needed |
| 2 | Prisma live transcription | Hindi, Hinglish, English |
| 3 | Timbre voice replies | Calm, slow in SOS |
| 4 | One-tap SOS | Starts voice session, GPS capture and case creation together |
| 5 | Location read-back + landmark fallback | Weakest link; test hardest |
| 6 | Simulated dispatch with ETA and status | Dashboard card; never a real ambulance |
| 7 | Two-question triage | Responding? Breathing normally? Rule-based severity |
| 8 | Fixed protocol library | CPR, conscious chest pain, stroke/collapse (breathing), choking, severe bleeding |
| 9 | "Call 112 as well" on every red case | Never claim to replace emergency services |
| 10 | ER pre-arrival brief | One-line auto summary |
| 11 | Normal mode voice chat | One follow-up question at a time |
| 12 | Red-flag screen in Normal mode | Offers "Switch to SOS" |
| 13 | Home-care library | 6-8 common issues, "commonly…" wording, "see a doctor if…" |
| 14 | End summary card (Normal) | What you said, what to do, when to see a doctor |
| 15 | Hospital dashboard | Live cases, location, severity, transcript, brief, status |
| 16 | Consent screen + "prototype, not a medical device" label | Voice is personal data (DPDP) |
| 17 | **SOS live loop** | Status updates + waiting-time guidance + periodic re-check (6.5) |
| 18 | **Address & dispatch confirmation** | See section 7.3 |

### 6.2 Tier 2 — should ship (differentiators)
- **Pre-cached protocol audio** (instant + works if network drops).
- **Time-to-first-instruction metric** (SOS tap → first spoken instruction).
- **Medical ID** (optional, consented): allergies, conditions, medicines → included in ER brief.
- **Emergency contact alert**: user-initiated location link (simulated in demo).
- **Interrupt handling**: user can speak over Ayu (barge-in); graceful "dobara bolo" recovery.
- **Evaluation scorecard** from 15-20 scripted noisy calls, including failures.

### 6.3 Tier 3 — stretch only
Awadhi phrase tests, chronic-care daily check-in (BP/sugar trends), response-time analytics, medicine/doctor-visit reminders, elderly-friendly mode.

### 6.4 Cut list (do NOT build)
Real ambulance/SMS triggers, real telephony/IVR, diagnosis claims, medicine or dosage advice, accounts/patient records, multi-hospital support, wearables/fall detection, image analysis, free-form medical Q&A, maps routing (landmark text is enough), mobile native app.

### 6.5 SOS live loop (how guidance continues while waiting) `[DECIDED]`
1. **Tap and dispatch (0-5 s):** "Help is being sent to your location."
2. **Triage (5-20 s):** "Is he responding? Is he breathing normally?"
3. **Protocol guidance:** fixed script chosen by triage (CPR, recovery position, choking, etc.).
4. **Status updates:** short messages at set points ("dispatched", "ambulance is N minutes away", "almost there").
5. **Filler tasks while waiting:** useful general steps from a fixed, reviewed list (section 7.4).
6. **Re-check every 30-60 s:** "Is he still breathing? Any change?" If the answer changes, switch protocol.
7. **Arrival:** "The ambulance is at your door. Tell them what happened and give them the medicines list."

**Priority rule:** protocol steps (especially CPR) always come before status chatter; never interrupt CPR counting with an ETA. Give updates in pauses or when the caller asks.

---

## 7. SOS mode in detail

### 7.1 Principles
- Speed first: dispatch goes out **before** questions.
- One instruction at a time, under ~15 words each, calm tone.
- The LLM never improvises medical content; rules + fixed scripts do.
- Always escalate: say "call 112 as well" in red cases.
- Honest: ETA and dispatch are simulated in the demo and say so in the UI.

### 7.2 Flow (happy path)
1. User taps **SOS** → 3-second countdown with big **Cancel** → starts automatically.
2. Browser requests location; case created; dispatch request sent with coordinates immediately.
3. Ayu speaks: "Help is being sent. I'm with you." and begins triage.
4. Location read-back + dispatch confirmation run in parallel (7.3).
5. Triage answers → rules pick severity + protocol → Ayu reads the protocol script.
6. Status updates and waiting guidance loop until arrival.
7. Arrival → handoff screen/summary → case closed.

### 7.3 Confirmations (address + dispatch) `[DECIDED]`
**Address confirmation (spoken)**
- Ayu: "I have your location as [area, landmark]. Is that correct?"
- Yes → case marked *location verified*.
- No / silence → ask for landmark, floor and gate; update case; driver sees a **"location updated"** flag.
- If GPS accuracy is poor (indoors, large radius), always ask; dashboard shows accuracy.
- Also confirm: callback number, building/floor/gate/landmark (Indian addresses often need more than GPS).

**Dispatch confirmation**
- Driver/operator accepts the case on the dashboard (in the demo: a button, or auto-ack after a few seconds).
- Only then Ayu says: "An ambulance has been dispatched. It will take about X minutes."
- Before acceptance Ayu says: "I've sent your location, waiting for confirmation."
- Dashboard shows ambulance ID, ETA, status: Requested → Accepted → On the way → Arrived.
- **No acknowledgement within ~60 s:** Ayu says "Please also call 112 now"; dashboard flags the case *unacknowledged*. (A real system would alert the next unit.)

### 7.4 General steps Ayu can say while waiting (fixed list, needs doctor review)
- Stay with the person and keep your phone on speaker.
- Unlock the door and switch on the lights.
- Send someone to the gate/main road to guide the ambulance.
- Don't give food, water or medicine unless a reviewed protocol says so.
- Don't move the person unless there is danger (fire, traffic).
- Loosen tight clothing around the neck and chest.
- Keep the crowd back and give them space.
- Gather their medicines, ID and reports for the paramedics.
- Note the time symptoms started; the hospital will ask.

### 7.5 Triage rules (draft, doctor must review) `[DEFAULT]`
Inputs: responsive? (Y/N), breathing normally? (Y/N), plus extracted symptoms.

| Condition | Severity | Protocol |
|---|---|---|
| Not responsive AND not breathing normally | RED | CPR |
| Not responsive BUT breathing | RED | Recovery position + stroke/collapse |
| Choking (cannot speak/cough, hands at throat) | RED | Choking |
| Severe bleeding (spurting/soaking) | RED | Severe bleeding |
| Conscious + chest pain/pressure/sweating/breathless | RED | Conscious chest pain |
| Stroke signs (face droop, arm weakness, speech difficulty) | RED | Stroke |
| Conscious + breathing, none of the above | AMBER | General guidance, keep re-checking |
| Caller says false alarm / no symptoms | GREEN | Offer to switch to Normal mode, keep dispatch until user cancels |

**Rule:** the LLM may *raise* severity, never lower it below what rules give.

---

## 8. Normal mode in detail

- Hinglish voice conversation; Ayu asks **one follow-up question at a time** (what happened, since when, other symptoms, what was eaten, any medicines).
- **Wording is cautious:** "this is commonly…", "could be…", never "you have…". No diagnosis, no medicine or dosage advice.
- **Home-care library (6-8 issues, reviewed):** acidity, heat/sun headache, mild fever, cold and cough, loose motions (ORS/hydration). Traditional remedies (e.g., ajwan water for mild acidity) only from the reviewed list.
- **Always:** a "see a doctor if…" line.
- **Red-flag screen:** if answers include warning signs (e.g., chest/arm/jaw pain, sweating, breathlessness, fainting, sudden severe headache, confusion, one-sided weakness, age/diabetes risk), show **"This sounds serious. Switch to SOS?"** Example: throat + stomach burning at night is commonly acidity but can also be a heart-attack presentation, so Ayu asks red-flag questions before reassuring.
- **End summary card:** what you said, what Ayu suggests, when to see a doctor (shareable).
- Example conversations used in planning: headache after sun exposure (could be migraine/heat exhaustion/dehydration; simple steps + when to see a doctor); throat/stomach burning after chole bhature at 2 AM (ask what was eaten, red-flag questions, then simple home care if safe).

---

## 9. Safety, ethics and legal posture

1. **Not a medical device.** Label permanently: "Prototype · not a medical device · does not replace emergency services."
2. **No LLM free-styling in SOS.** Fixed scripts reviewed by a doctor; Gemini selects only.
3. **Always escalate:** "call 112 as well" for every red case.
4. **Simulated dispatch only** in the demo. Never trigger real ambulances, never send SMS to real numbers.
5. **Data:** voice counts as personal data under India's DPDP Act. Use scripted calls recorded by team members/consenting friends only. **No real patient or hospital data.** Show a consent screen. Define a retention rule (e.g., delete demo recordings after judging).
6. **Honesty:** the write-up must state limitations (accuracy numbers incl. failures, what was simulated, what would need clinical approval). Organisers prefer honest limitations over faked results.
7. **Known pitfalls for protocol authors** (verify with the reviewing doctor):
   - Raising legs is for fainting/shock, **not** a heart-attack step.
   - Sudden severe headache + collapse is **not** assumed to be a heart attack; ask responding/breathing first.
   - Default: **no medicines** (e.g., aspirin can be harmful in some situations such as brain bleeds). Only include if the reviewed protocol explicitly says so.
   - Never give food or water to a person who is collapsed, confused or in suspected stroke/heart attack.
8. **Reviewer:** get all protocols and the home-care library reviewed by a qualified doctor/medical person; show "Reviewed by ___" and sources (e.g., Red Cross, AHA, Indian guidelines) on each protocol card and in the write-up. `[OPEN]` who reviews.

---

## 10. Protocol library (content spec)

Core protocols (3 deeply tested, others included as scripts):
1. **Unresponsive, not breathing normally → CPR** (with rhythm cue per reviewed guidance)
2. **Conscious chest pain (suspected heart attack)** (sit comfortably, loosen clothing, no food/water, keep calm, monitor)
3. **Stroke signs / collapse but breathing** (recovery position, note time, no food/water/medicine)
4. **Choking**
5. **Severe bleeding**
Stretch: seizure, burns.

Each protocol has: id, title, trigger conditions, ordered short steps (English, Hindi, Hinglish text), pause points, re-check question, sources, reviewer name/date, pre-cached audio keys. Format and sample in the Dev Guide.

---

## 11. Hospital / dispatcher dashboard

- Live list of cases with severity colour, time since SOS, location (pin + text + accuracy), verification flag (verified/updated), status.
- Case detail: live transcript, extracted fields, triage answers, protocol in use, pre-arrival brief, timeline.
- Actions: accept case, assign ambulance (simulated), update status (On the way / Arrived), mark closed.
- Pre-arrival brief example: "Adult male, collapsed after headache, breathing, ETA 12 min."
- Stretch: response-time analytics, case history.

---

## 12. What is simulated vs real

| Real in demo | Simulated in demo |
|---|---|
| Voice capture, Prisma transcription, Timbre speech | Ambulance, driver, ETA |
| Phone GPS location | Dispatch acceptance (button/auto-ack) |
| Gemini extraction, protocol selection | Emergency contact alert (link shown, not sent) |
| Rule-based triage, protocol scripts | Hospital integration, 112 integration |
| Dashboard and live status sync | |

State this table in the write-up.

---

## 13. Winning strategy

1. **One target:** Real World Impact.
2. **Voice is the product:** show noisy, panicked, code-mixed Hinglish handled well, not a clean studio clip.
3. **Safety as signature:** fixed reviewed protocols, visible sources, always escalate, honest labelling.
4. **Proof, not claims:** scorecard from scripted noisy calls (location correct X/20, emergency type correct X/20, protocol correct X/20, time-to-first-instruction in seconds), failures shown with fixes.
5. **Real-world validation:** 5-10 people try it; one doctor/hospital gives feedback; one genuine quote in the write-up.
6. **One-page path to deployment:** 112 or hospital ambulance integration, DPDP data handling, retention, what needs clinical approval, hospital-side value (response-time dashboard).
7. **Honest limitations** in the write-up.
8. **Spend spare time on testing and polish, not extra features.**

**Biggest risks:** location extraction from noisy speech; unsafe wording in Normal mode; spending the last days on features instead of testing.

---

## 14. Evaluation and proof plan

- 15-20 scripted calls: 3 core emergencies × noise levels (quiet, street/TV, shouted/panicked) × languages (Hindi, Hinglish, English; Awadhi if time).
- Record with team members/consenting friends only. No real patient data.
- Metrics: location correct, emergency type correct, protocol correct, number of misunderstandings, STT errors on landmarks and numbers, time-to-first-instruction, end-to-end latency per turn.
- Day-1 test: shouted, noisy Hinglish clips through Prisma to see how it handles landmarks and numbers.
- Publish a scorecard table with failures and fixes.

---

## 15. Demo video script (2-3 minutes)

1. The 2 AM problem in one sentence (10 s).
2. Noisy Hinglish SOS: tap, location confirmed, dispatch card appears, first instruction within seconds.
3. ER dashboard + pre-arrival brief; status updates in sync.
4. Normal mode: headache/acidity example, then a red-flag switch to SOS.
5. Scorecard and honest limitations (15 s).
6. Path to deployment (10 s).

---

## 16. Timeline (deadline Nov 10, 11:59 PM IST)

| Dates | Goal |
|---|---|
| Oct 30 – Nov 1 | Voice loop (Prisma → LLM → Timbre) + SOS skeleton. **Day 1: test noisy Hinglish clips in Prisma** |
| Nov 2 – 4 | Protocols, triage, dispatch confirmation, dashboard, Normal mode |
| Nov 5 – 6 | Tier 2 features; get protocols reviewed by a doctor |
| Nov 7 – 8 | Noisy-call testing, scorecard, fixes |
| Nov 9 | Demo video, write-up, LinkedIn/X post, **submit** |
| Nov 10 | Buffer only |

**If time runs out, cut in this order:** Tier 3 → emergency contact alert → Medical ID → interrupt polish → extra protocols (keep CPR, chest pain, stroke/collapse).

---

## 17. Team and roles

| Person | Role | Owns |
|---|---|---|
| Pragya | `[OPEN]` | Suggested: voice pipeline + backend + Gnani API key |
| Partner | `[OPEN]` | Suggested: UI/PWA + dashboard + testing |

Decide: who is the **primary registrant** (holds Gnani credits/API key) `[VERIFY]`. Pragya is a B.Tech CS/DS student in Lucknow who builds websites professionally; the team can move fast, so the constraint is testing and quality, not coding speed.

---

## 18. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Location extraction errors in noisy speech | GPS first; spoken read-back; landmark/floor/gate fallback; show accuracy on dashboard |
| Unsafe medical wording | Fixed scripts, doctor review, cautious language, red-flag screen |
| Network drop in SOS | Pre-cached protocol audio, offline fallback, "call 112" button always visible |
| Latency | Cache fixed audio; stream STT; short LLM calls; measure time-to-first-instruction |
| Gnani API limits/credits | Check docs early; budget credits for testing; one person holds the key |
| Browser quirks (iOS audio/GPS) | Test on real iPhone and Android early; user-gesture to unlock audio |
| Scope creep | Cut list + cut order (section 16) |
| Demo failure | Record backup demo video; keep a scripted fallback path |

---

## 19. Open questions

1. Final name: Ayu vs AyuNet.
2. Who reviews the medical content (doctor name/institution)?
3. Which LLM: Gemini only, or Gnani's own LLM if available?
4. Exact award category list and submission format (`gnani.ai/internship`).
5. Who is the primary registrant / holds the API key?
6. Prisma/Timbre exact API (streaming protocol, audio format, sample rate, languages, rate limits).
7. Reverse-geocoding provider for addresses (free vs paid).
8. Hosting plan (persistent server for WebSockets).

---

## 20. Submission checklist

- [ ] Working app link (HTTPS) that opens on phone
- [ ] Gnani models named: Prisma, Timbre (plus any others used)
- [ ] 2-3 minute demo video
- [ ] Write-up: problem, solution, architecture, what's simulated vs real, scorecard, limitations, path to deployment
- [ ] Safety section: protocols reviewed, sources, "not a medical device"
- [ ] Data/consent statement (DPDP, scripted calls only)
- [ ] Public post (LinkedIn/X) if required
- [ ] Backup demo recording
- [ ] Submitted before Nov 10, 11:59 PM IST (target Nov 9)

---

## 21. Glossary

- **SOS mode:** emergency flow. **Normal mode:** non-emergency health chat.
- **Triage:** quick assessment (responding? breathing normally?) that sets severity.
- **Protocol:** fixed, reviewed first-aid script.
- **Pre-arrival brief:** one-line case summary sent to the ER.
- **Simulated dispatch:** demo-only dashboard flow standing in for real ambulances.
- **PWA:** progressive web app, installable web app that runs on phones.
- **Prisma / Timbre:** Gnani.ai speech-to-text / text-to-speech models.
- **DPDP:** India's Digital Personal Data Protection Act.
