import type { Lang } from "../types/voice.js";

type Line = Record<Lang, string>;

// Fixed lines for Normal mode. Questions only: advice comes solely from reviewed home-care cards.
export const NORMAL_GREETING: Line = {
  en: "Hello, I'm Ayu. Please tell me what is troubling you.",
  hi: "नमस्ते, मैं आयु हूँ। बताइए, आपको क्या तकलीफ़ है?",
  hinglish: "Namaste, main Ayu hoon. Batayein, aapko kya takleef hai?",
};

export const NORMAL_SERIOUS: Line = {
  en: "This sounds serious. Would you like to switch to SOS?",
  hi: "यह गंभीर लग रहा है। क्या आप SOS पर जाना चाहेंगे?",
  hinglish: "Yeh serious lag raha hai. Kya aap SOS par jaana chahenge?",
};

export const NORMAL_SEE_DOCTOR_NOW: Line = {
  en: "Please see a doctor as soon as you can. If it gets worse, call 112.",
  hi: "कृपया जितनी जल्दी हो सके डॉक्टर को दिखाएँ। तकलीफ़ बढ़े तो 112 पर कॉल करें।",
  hinglish: "Kripya jitni jaldi ho sake doctor ko dikhayein. Takleef badhe to 112 par call karein.",
};

export const NORMAL_NO_MATCH: Line = {
  en: "I can't give guidance for this. Please speak to a doctor.",
  hi: "मैं इसके लिए मार्गदर्शन नहीं दे सकता। कृपया डॉक्टर से बात करें।",
  hinglish: "Main iske liye guidance nahi de sakta. Kripya doctor se baat karein.",
};

export const NORMAL_CLOSING: Line = {
  en: "Here is your summary. Please take care.",
  hi: "यह रहा आपका सारांश। अपना ध्यान रखें।",
  hinglish: "Yeh raha aapka summary. Apna dhyan rakhein.",
};

export const NORMAL_SAY_YES_NO: Line = {
  en: "Please say yes or no.",
  hi: "कृपया हाँ या नहीं बोलिए।",
  hinglish: "Kripya haan ya nahi boliye.",
};

export const NORMAL_PROMPT: Line = {
  en: "Are you there? You can also type your answer.",
  hi: "क्या आप वहाँ हैं? आप अपना जवाब लिख भी सकते हैं।",
  hinglish: "Kya aap wahan hain? Aap apna jawab likh bhi sakte hain.",
};

export const QUESTION_IDS = [
  "onset", "food", "medicine", "fever", "chest", "breath", "sudden", "faint", "stool_blood", "conditions",
] as const;
export type QuestionId = (typeof QUESTION_IDS)[number];

export interface NormalQuestion {
  text: Line;
  /** A yes here is a warning sign, and an unclear reply is never treated as a no. */
  redFlag: boolean;
  yesNo: boolean;
}

export const QUESTIONS: Record<QuestionId, NormalQuestion> = {
  onset: {
    redFlag: false,
    yesNo: false,
    text: { en: "Since when has this been happening?", hi: "यह कब से हो रहा है?", hinglish: "Yeh kab se ho raha hai?" },
  },
  food: {
    redFlag: false,
    yesNo: false,
    text: { en: "What did you last eat or drink?", hi: "आपने आख़िरी बार क्या खाया या पिया?", hinglish: "Aapne aakhri baar kya khaya ya piya?" },
  },
  medicine: {
    redFlag: false,
    yesNo: true,
    text: { en: "Have you taken any medicine for this?", hi: "क्या आपने इसके लिए कोई दवाई ली है?", hinglish: "Kya aapne iske liye koi dawai li hai?" },
  },
  fever: {
    redFlag: false,
    yesNo: true,
    text: { en: "Do you also have a fever?", hi: "क्या आपको बुखार भी है?", hinglish: "Kya aapko bukhar bhi hai?" },
  },
  chest: {
    redFlag: true,
    yesNo: true,
    text: {
      en: "Do you have pain or pressure in your chest, arm or jaw?",
      hi: "क्या सीने, बाँह या जबड़े में दर्द या दबाव है?",
      hinglish: "Kya seene, baanh ya jabde mein dard ya dabaav hai?",
    },
  },
  breath: {
    redFlag: true,
    yesNo: true,
    text: { en: "Are you having trouble breathing?", hi: "क्या सांस लेने में दिक्कत है?", hinglish: "Kya saans lene mein dikkat hai?" },
  },
  sudden: {
    redFlag: true,
    yesNo: true,
    text: { en: "Did this start suddenly and very severely?", hi: "क्या यह अचानक और बहुत तेज़ शुरू हुआ?", hinglish: "Kya yeh achanak aur bahut tez shuru hua?" },
  },
  faint: {
    redFlag: true,
    yesNo: true,
    text: { en: "Did you faint, or do you feel confused?", hi: "क्या आप बेहोश हुए या भ्रमित महसूस कर रहे हैं?", hinglish: "Kya aap behosh hue ya confused feel kar rahe hain?" },
  },
  stool_blood: {
    redFlag: true,
    yesNo: true,
    text: { en: "Is there any blood in your stool?", hi: "क्या मल में खून आ रहा है?", hinglish: "Kya potty mein khoon aa raha hai?" },
  },
  conditions: {
    redFlag: true,
    yesNo: true,
    text: { en: "Do you have diabetes or any heart condition?", hi: "क्या आपको डायबिटीज़ या दिल की कोई बीमारी है?", hinglish: "Kya aapko diabetes ya dil ki koi bimari hai?" },
  },
};

export const NORMAL_FIXED_LINES = [
  NORMAL_GREETING, NORMAL_SERIOUS, NORMAL_SEE_DOCTOR_NOW, NORMAL_NO_MATCH, NORMAL_CLOSING, NORMAL_SAY_YES_NO, NORMAL_PROMPT,
  ...Object.values(QUESTIONS).map((question) => question.text),
];

export const ISSUE_IDS = ["acidity", "heat_headache", "mild_fever", "cold_cough", "loose_motions"] as const;
export type IssueId = (typeof ISSUE_IDS)[number];

/** Red-flag questions come early, so advice is never reached before they are answered. */
export const ISSUE_QUESTIONS: Record<IssueId | "unknown", QuestionId[]> = {
  acidity: ["onset", "chest", "breath", "food", "conditions"],
  heat_headache: ["onset", "sudden", "faint", "fever", "medicine"],
  mild_fever: ["onset", "breath", "faint", "medicine"],
  cold_cough: ["onset", "breath", "chest", "fever"],
  loose_motions: ["onset", "stool_blood", "fever", "faint", "medicine"],
  unknown: ["onset", "chest", "breath", "faint"],
};
