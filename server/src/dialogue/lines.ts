import type { Lang } from "../types/voice.js";

// Fixed spoken lines. Copy is from Dev Guide 12.8; Hindi and Hinglish await native-speaker review.
// Never say "dispatched" here: that is reserved for after acceptance (Phase 4).
// Kept short on purpose: this speech is most of the time before the first instruction.
export const SOS_OPENING: Record<Lang, string> = {
  en: "Help is being sent.",
  hi: "मदद भेजी जा रही है।",
  hinglish: "Madad bheji ja rahi hai.",
};

export const ASK_RESPONSIVE: Record<Lang, string> = {
  en: "Are they responding?",
  hi: "क्या वो जवाब दे रहे हैं?",
  hinglish: "Kya woh jawab de rahe hain?",
};

export const ASK_BREATHING: Record<Lang, string> = {
  en: "Are they breathing normally?",
  hi: "क्या वो सामान्य सांस ले रहे हैं?",
  hinglish: "Kya woh normal saans le rahe hain?",
};

/** Played from the phone's own copy when the server cannot be reached. */
export const CONNECTION_LOST: Record<Lang, string> = {
  en: "Connection lost. Please call 112 now.",
  hi: "कनेक्शन टूट गया। कृपया अभी 112 पर कॉल करें।",
  hinglish: "Connection toot gaya. Kripya abhi 112 par call karein.",
};

export const SAY_AGAIN: Record<Lang, string> = {
  en: "Sorry, can you say that again?",
  hi: "माफ़ कीजिए, क्या आप दोबारा बोल सकते हैं?",
  hinglish: "Maaf kijiye, kya aap dobara bol sakte hain?",
};

export const ARE_YOU_THERE: Record<Lang, string> = {
  en: "Are you there? You can also tap Yes or No.",
  hi: "क्या आप वहाँ हैं? आप हाँ या ना भी दबा सकते हैं।",
  hinglish: "Kya aap wahan hain? Aap Haan ya Nahi bhi daba sakte hain.",
};

export const CALL_112: Record<Lang, string> = {
  en: "Please also call 112 now.",
  hi: "कृपया अभी 112 पर भी कॉल करें।",
  hinglish: "Kripya abhi 112 par bhi call karein.",
};

export const NO_ACK: Record<Lang, string> = {
  en: "There is no confirmation yet. Please also call 112 now.",
  hi: "अभी तक पुष्टि नहीं मिली है। कृपया अभी 112 पर भी कॉल करें।",
  hinglish: "Abhi tak confirmation nahi mili hai. Kripya abhi 112 par bhi call karein.",
};

export const PRE_ACK: Record<Lang, string> = {
  en: "I've sent your location. Waiting for confirmation.",
  hi: "मैंने आपकी लोकेशन भेज दी है। पुष्टि का इंतज़ार है।",
  hinglish: "Maine aapki location bhej di hai. Confirmation ka intezaar hai.",
};

export const ASK_LANDMARK: Record<Lang, string> = {
  en: "Please tell me a nearby landmark, floor or gate.",
  hi: "कृपया पास की कोई पहचान, मंज़िल या गेट बताइए।",
  hinglish: "Kripya paas ki koi pehchaan, floor ya gate batayein.",
};

export const ASK_ADDRESS: Record<Lang, string> = {
  en: "I could not find your location. Please tell me your address or a nearby landmark.",
  hi: "मुझे आपकी लोकेशन नहीं मिली। कृपया अपना पता या पास की कोई पहचान बताइए।",
  hinglish: "Mujhe aapki location nahi mili. Kripya apna address ya paas ki koi pehchaan batayein.",
};

export const LOCATION_UPDATED: Record<Lang, string> = {
  en: "Thank you. I've updated your location.",
  hi: "धन्यवाद। मैंने आपकी लोकेशन अपडेट कर दी है।",
  hinglish: "Dhanyavaad. Maine aapki location update kar di hai.",
};

export const ALMOST_THERE: Record<Lang, string> = {
  en: "The ambulance is almost there.",
  hi: "एम्बुलेंस लगभग पहुँच गई है।",
  hinglish: "Ambulance lagbhag pahunch gayi hai.",
};

export const ARRIVED: Record<Lang, string> = {
  en: "The ambulance is here. Tell them what happened and give them the medicines list.",
  hi: "एम्बुलेंस पहुँच गई है। उन्हें बताइए कि क्या हुआ और दवाइयों की सूची दीजिए।",
  hinglish: "Ambulance pahunch gayi hai. Unhe batayein kya hua aur medicines ki list dein.",
};

export const RECHECK_STILL: Record<Lang, string> = {
  en: "Is the person still breathing normally?",
  hi: "क्या वो अब भी सामान्य रूप से सांस ले रहे हैं?",
  hinglish: "Kya woh ab bhi normal tareeke se saans le rahe hain?",
};

export const RECHECK_STARTED: Record<Lang, string> = {
  en: "Has the person started breathing normally?",
  hi: "क्या उन्होंने सामान्य रूप से सांस लेना शुरू किया?",
  hinglish: "Kya unhone normal tareeke se saans lena shuru kiya?",
};

export const locationConfirm = (lang: Lang, area: string) => ({
  en: `I have your location as ${area}. Is that correct?`,
  hi: `आपकी लोकेशन ${area} है। क्या यह सही है?`,
  hinglish: `Aapki location ${area} hai. Kya yeh sahi hai?`,
})[lang];

export const locationNear = (lang: Lang, area: string) => ({
  en: `I think you are near ${area}. Please tell me a nearby landmark, floor or gate.`,
  hi: `लगता है आप ${area} के पास हैं। कृपया पास की कोई पहचान, मंज़िल या गेट बताइए।`,
  hinglish: `Lagta hai aap ${area} ke paas hain. Kripya paas ki koi pehchaan, floor ya gate batayein.`,
})[lang];

export const dispatched = (lang: Lang, minutes: number) => ({
  en: `An ambulance has been dispatched. It will take about ${minutes} minutes.`,
  hi: `एम्बुलेंस भेज दी गई है। इसमें लगभग ${minutes} मिनट लगेंगे।`,
  hinglish: `Ambulance bhej di gayi hai. Isme lagbhag ${minutes} minute lagenge.`,
})[lang];

export const etaUpdate = (lang: Lang, minutes: number) => ({
  en: `The ambulance is about ${minutes} minutes away.`,
  hi: `एम्बुलेंस लगभग ${minutes} मिनट दूर है।`,
  hinglish: `Ambulance lagbhag ${minutes} minute door hai.`,
})[lang];

export const FIXED_LINES = [
  SOS_OPENING, ASK_RESPONSIVE, ASK_BREATHING, SAY_AGAIN, ARE_YOU_THERE, CALL_112, CONNECTION_LOST, NO_ACK, PRE_ACK, ASK_LANDMARK,
  ASK_ADDRESS, LOCATION_UPDATED, ALMOST_THERE, ARRIVED, RECHECK_STILL, RECHECK_STARTED,
];
