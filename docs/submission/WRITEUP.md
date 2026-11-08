# Ayu: a Hindi and Hinglish voice assistant for health emergencies

**Live app:** https://ayu-4801.onrender.com · **Code:** https://github.com/Pragya-rays/ayu
**Team of two:** Pragya and Aryan Pandey, SRMCEM, Lucknow · **Gnani models used:** Prisma v3.0 (speech to text), Timbre v2.5 (text to speech)

> Not a medical device. It does not replace emergency services. Ambulance dispatch is simulated. First aid and home care come from published guidance and have not been reviewed by a doctor.

## The problem

It is 2 AM and someone has collapsed. The person beside them is panicking, speaking Hinglish, with a TV or traffic in the background. They have to explain where they are, what happened and how bad it is, and then they do not know what to do until help comes.

Small hospitals often have no 24x7 call centre, so one front-desk person has to decode "petrol pump ke paas, Gomti Nagar side", judge severity and ring the driver.

## Who it is for

- Bystanders and family in an emergency, especially Hindi and Hinglish speakers
- People with a minor health worry at an odd hour, who cannot tell whether it is serious
- Hospital front desks and ambulance crews, who need a clear case quickly

## What Ayu does

**SOS.** One tap starts a 3-second countdown, then Ayu shares the location and raises a simulated ambulance request straight away, before asking anything. It asks two questions, whether the person is responding and breathing normally, and fixed rules choose severity and a script. Ayu reads the area back so the caller can correct it, reports ambulance status, re-checks breathing every 45 seconds, and tells the caller to call 112 in every red case and whenever no one accepts within 60 seconds. An optional Medical ID, stored only on the phone, reaches responders only when an SOS starts, and the caller can share their location with family through their own phone.

**Normal mode.** A short voice conversation for everyday problems. Gemini writes fitted follow-up questions, while warning-sign questions stay fixed. Chest or jaw pain, breathlessness and similar signs bring up "Switch to SOS?" It never diagnoses or names medicines.

**Hospital side.** A live dashboard with severity, location and accuracy, transcript, timeline, and a one-line pre-arrival brief. A driver view handles Accept, On the way and Arrived.

## How Gnani is used

Voice is the product here, not an add-on.

- **Prisma v3.0** runs in real time on the phone's microphone stream. `codemix` output keeps English words in Latin inside Hindi sentences, and keyterms help with landmarks. Its server-side voice detection decides when a caller has finished, and the app shows when it is hearing them.
- **Timbre v2.5** speaks every line in Hindi, Hinglish and English. Fixed lines are generated once and stored, so they start instantly and use no credits per call. Hinglish speech is sent in Devanagari, which sounded clearer in our listening test, while the screen keeps Latin text.

## Architecture

Phone (PWA) to a Node server over WebSocket. The server proxies Prisma and Timbre so keys stay private, runs the conversation, and streams live updates to the dashboard. Gemini 3.5 Flash-Lite pulls facts from speech. OpenStreetMap Nominatim turns coordinates, rounded to about 110 m, into an area name.

## Safety decisions

- **Gemini does not write medical instructions.** SOS speech comes only from fixed lines and script files, each listing its published sources. Gemini's output must pass strict validation, and it can raise severity but never lower it.
- **Unknown never reads as good news.** An unclear or silent reply to a warning-sign question withholds home care and says to see a doctor.
- **The ER brief comes from confirmed fields only**, and shows "unknown" for anything not stated.
- **Ayu never says "dispatched" before someone accepts.**
- **If the connection drops,** the phone reconnects and resumes the same conversation. If it cannot, it says to call 112, and it never claims help was sent when nothing could be sent.

## What is real and what is simulated

| Real | Simulated |
|---|---|
| Voice capture, Prisma, Timbre | Ambulance, driver, ETA |
| Phone GPS and area lookup | Dispatch acceptance |
| Gemini extraction and follow-up questions | Hospital and 112 integration |
| Triage rules, scripts, live dashboard sync | |

## Results

We ran 40 synthetic calls through the live Prisma stream the app uses: five emergencies, two Timbre voices, and four conditions (clean, fan noise, street noise, and 8 kHz phone quality with street noise). Every sentence and answer in each call passed through the noise, at real-time pace.

| Measure | Result |
|---|---|
| Correct script chosen | 39/40 |
| Landmark kept | 40/40 |
| Phone number kept | 8/8 |
| "Haan" and "nahi" read correctly | 16/16 |
| Median Prisma time after speech ended | about 0.5 s |

**The one failure found a real bug.** Noise swallowed a caller's answer, Ayu asked again, and the next reply was "हाँ, साँस ले रहा है" (yes, he's breathing). Ayu took that "yes" as the answer to "are they responding?", marking an unresponsive person as responsive. We fixed it so a reply is matched to what it is about, and added tests. An earlier file-based run also showed "Aminabad" split into "अमीना बाद" under noise, which is the kind of error the location read-back exists to catch.

**Read these numbers with care.** The speech and noise were generated, so they are cleaner than a real panicked caller, with no real microphone or room. Phone quality was simulated. Choosing the script also depends on our rules, not only on Prisma. These results were recorded before the fix above.

Full tables with every failure: [live stream](../../eval/results/scorecard-stream.md), [file mode](../../eval/results/scorecard-synthetic.md)

On a real iPhone XR in a quiet room, we tested the full flow: voice triage, location read-back, interrupting on speaker, ambulance accept to arrival, the no-acceptance 112 warning, Medical ID, Normal mode, sharing location, Airplane Mode, and a refused microphone. All worked. The opening line started 52-72 ms after the countdown once it was stored on the phone.

A team member also ran the five emergency scripts on the live app in noisy settings and reported that they worked. Results were not recorded call by call, so they are not scored here.

**Early user feedback.** One tester, aged 24, rated ease of use 4.5 out of 5, found nothing confusing and said they trusted it. In their words: "good and impactable". One person is a very small sample.

TODO: add results from more people trying it.

## Honest limitations

- **No clinical review.** First-aid steps and home care were condensed from published guidance (Indian COLS guideline, St John Ambulance, WHO, AHA, NHS) with AI help. No doctor has reviewed them, or the triage rules and warning signs. A clinician must approve all of it before anyone relies on it. Ayu gives no medicine advice, including aspirin.
- **Time to first instruction** was 11-16 seconds by voice on a real phone before we shortened the lines, mostly because of speech and the caller's own response. It is still not fast enough for a real cardiac arrest.
- **Noise testing above is synthetic.** Real panicked callers will do worse.
- **Limited device testing.** The full flow was tested on one iPhone XR, with a shorter check on one Samsung phone in Chrome. Other phones and older Android versions are untested.
- **One-at-a-time scale.** Free tiers allow 15 Gemini requests a minute and Render's free plan sleeps when idle. Cases live in memory, so a restart ends active calls. Ayu falls back to rules if Gemini is unavailable.
- **Offline support is limited.** With no network the app opens and says to call 112, but cannot run triage.
- **Coverage.** Adults only, three languages, eight everyday problems, and no support for other conditions.

## Path to real deployment

1. Clinical sign-off for every script, rule and card, and legal review of medical-device rules
2. Integration with 112 or a hospital ambulance desk instead of the simulator
3. Testing with real callers and a hospital, with their permission
4. A paid or self-hosted geocoder, a real database and paid service tiers
5. DPDP compliance: stated purpose, consent, retention limits and deletion

## Data and consent

A consent screen explains that voice is processed by speech services and location is used only for SOS. Testing used scripted calls by team members and generated speech, with no real patient data. Normal mode stores no record. Cases live in memory and are lost on restart.

## Team contributions

- **Pragya:** backend
- **Aryan Pandey:** user interface
