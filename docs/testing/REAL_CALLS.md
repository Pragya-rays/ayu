# Real noisy calls

These prove Ayu works with real voices, and they are the strongest evidence you can add.

## Rules

- **Scripted lines only, with made-up details.** The challenge says no real phone numbers, Aadhaar, or recorded real calls.
- **Only people who agreed.** Team members or friends who have said yes.
- **Never press Call** on the 112 dialer.
- **Do not upload the audio.** Recordings stay on your computer, and `eval/audio` is kept out of git. Delete them after judging.

## How to run a call

Use the live site on a real phone, on speaker. Start SOS, say the lines, then cancel. Note the results below from the dashboard.

Sound panicked, speak quickly, and interrupt sometimes. Vary it: real callers do not read neatly.

**Aim for 15 to 20 calls:** at least 2 speakers, across quiet, street, and TV or fan, in Hinglish, Hindi and some English.

## Scripts

| ID | First sentence | Then say | Expect |
|---|---|---|---|
| E1 | "Mere dost ko achanak tez sir dard hua aur woh gir gaya, Hazratganj chauraha ke paas" | Nahi / Haan saans le raha hai | RED, recovery |
| E2 | "Papa gir gaye hain, Gomti Nagar mein petrol pump ke paas, jaldi aaiye" | Nahi / Nahi | RED, CPR |
| E3 | "Khana khate hue gale mein kuch atak gaya, bol nahi pa raha, Aminabad mein hain" | Haan / Pata nahi | RED, choking |
| E4 | "Accident ho gaya hai, bahut khoon nikal raha hai, Aliganj ke paas" | Haan / Haan | RED, severe bleeding |
| E5 | "Seene mein bahut dabaav hai aur paseena aa raha hai, Indira Nagar mein hain" | Haan / Haan | RED, chest pain |
| N1 | Normal mode: "Dhoop mein rehne ke baad sir dard ho raha hai" | Answer naturally, no warning signs | Summary, no SOS prompt |
| N2 | Normal mode: "Chole bhature ke baad pet mein jalan hai" | Answer naturally, no warning signs | Warning questions come first |
| N3 | Normal mode: same as N2, then "jabde mein bhi dard hai" | | SOS prompt |

For E1 to E5, use a made-up landmark the app should not know, too.

## Results

Copy this table into `eval/results/scorecard-real.md`.

| Call | Speaker | Noise | Language | Protocol right? | Area or landmark right? | Times Ayu misheard | First instruction (dashboard) | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | |

Send me the table, and I will turn it into the final scorecard and update the write-up. Failures are useful: the judges prefer honest results to perfect ones.
