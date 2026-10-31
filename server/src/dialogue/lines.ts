import type { Lang } from "../types/voice.js";

// Fixed spoken lines. Copy is from Dev Guide 12.8; Hindi and Hinglish await native-speaker review.
// Never say "dispatched" here: that is reserved for after acceptance (Phase 4).
export const SOS_OPENING: Record<Lang, string> = {
  en: "Help is being sent. I'm with you.",
  hi: "मदद भेजी जा रही है। मैं आपके साथ हूँ।",
  hinglish: "Madad bheji ja rahi hai. Main aapke saath hoon.",
};

export const ASK_RESPONSIVE: Record<Lang, string> = {
  en: "Is the person responding to you?",
  hi: "क्या वो आपकी बात का जवाब दे रहे हैं?",
  hinglish: "Kya woh aapki baat ka jawab de rahe hain?",
};

export const ASK_BREATHING: Record<Lang, string> = {
  en: "Is the person breathing normally?",
  hi: "क्या वो सामान्य रूप से सांस ले रहे हैं?",
  hinglish: "Kya woh normal tareeke se saans le rahe hain?",
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
