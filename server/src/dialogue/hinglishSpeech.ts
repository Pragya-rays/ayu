// Timbre says Hindi words better from Devanagari than from Latin spelling (team test, 11-01), and it
// reads mixed Devanagari and Latin as Hinglish. So screens keep Latin Hinglish, and only the text
// sent to Timbre is converted, word by word. English words and unknown words stay as they are.
const WORDS: Record<string, string> = {
  achha: "अच्छा", toot: "टूट", bhookh: "भूख", gale: "गले", ghar: "घर", jaise: "जैसे", ji: "जी", kamzori: "कमज़ोरी", kharash: "खराश",
  khana: "खाना", kyun: "क्यों", lage: "लगे", neend: "नींद", peene: "पीने", pyaas: "प्यास", sujan: "सूजन", thakan: "थकान",
  aa: "आ", aaj: "आज", aakhri: "आख़िरी", aap: "आप", aapka: "आपका", aapke: "आपके", aapki: "आपकी", aapko: "आपको",
  aapne: "आपने", aaram: "आराम", ab: "अब", abhi: "अभी", achanak: "अचानक", apna: "अपना", aur: "और", ayu: "आयु",
  baad: "बाद", baanh: "बाँह", baar: "बार", badhe: "बढ़े", bahut: "बहुत", balgam: "बलगम", baat: "बात",
  batayein: "बताइए", behosh: "बेहोश", bhej: "भेज", bheji: "भेजी", bhi: "भी", bimari: "बीमारी", bol: "बोल",
  boliye: "बोलिए", bukhar: "बुखार", chahenge: "चाहेंगे", chakkar: "चक्कर", chot: "चोट", dabaav: "दबाव", daba: "दबा",
  dard: "दर्द", dawai: "दवाई", de: "दे", dein: "दें", der: "देर", dhanyavaad: "धन्यवाद", dhoop: "धूप", dhyan: "ध्यान",
  di: "दी", dikhayein: "दिखाएँ", dikkat: "दिक्कत", dil: "दिल", din: "दिन", dobara: "दोबारा", door: "दूर", gala: "गला",
  gaya: "गया", gaye: "गए", gayi: "गई", ghante: "घंटे", ha: "हाँ", haan: "हाँ", hai: "है", hain: "हैं", halka: "हल्का",
  hoon: "हूँ", ho: "हो", hua: "हुआ", hue: "हुए", hui: "हुई", intezaar: "इंतज़ार", is: "इस", isme: "इसमें", iske: "इसके",
  ja: "जा", jaana: "जाना", jabde: "जबड़े", jaisa: "जैसा", jalan: "जलन", jaldi: "जल्दी", jawab: "जवाब", jitni: "जितनी",
  ka: "का", kab: "कब", kahan: "कहाँ", kaisa: "कैसा", kal: "कल", kar: "कर", karein: "करें", kaun: "कौन", ke: "के",
  khansi: "खांसी", khaya: "खाया", khoon: "खून", ki: "की", kijiye: "कीजिए", kiya: "किया", kitna: "कितना", kitni: "कितनी",
  ko: "को", koi: "कोई", kripya: "कृपया", kuch: "कुछ", kya: "क्या", lag: "लग", lagbhag: "लगभग", lagenge: "लगेंगे",
  lagi: "लगी", lagta: "लगता", le: "ले", lena: "लेना", lene: "लेने", li: "ली", liye: "लिए", likh: "लिख", maaf: "माफ़",
  madad: "मदद", main: "मैं", maine: "मैंने", mehsoos: "महसूस", mein: "में", mili: "मिली", mujhe: "मुझे", naak: "नाक",
  nahi: "नहीं", namaste: "नमस्ते", paani: "पानी", paas: "पास", pahunch: "पहुँच", par: "पर", pehchaan: "पहचान",
  pehle: "पहले", pet: "पेट", piya: "पिया", raat: "रात", raha: "रहा", rahe: "रहे", rahi: "रही", rahiye: "रहिए",
  rakhein: "रखें", rehne: "रहने", saans: "सांस", saath: "साथ", sahi: "सही", sake: "सके", sakta: "सकता", sakte: "सकते",
  sardi: "सर्दी", sath: "साथ", se: "से", seene: "सीने", shaam: "शाम", shuru: "शुरू", sir: "सिर", subah: "सुबह",
  tak: "तक", takleef: "तकलीफ़", tareeke: "तरीक़े", tez: "तेज़", tha: "था", the: "थे", thi: "थी", thoda: "थोड़ा", to: "तो",
  ulti: "उल्टी", unhe: "उन्हें", unhone: "उन्होंने", wahan: "वहाँ", woh: "वो", ya: "या", yeh: "यह", zyada: "ज़्यादा",
};

/** Words deliberately left in Latin, because Hinglish speakers use them as English. */
export const ENGLISH_WORDS = new Set([
  "address", "aid", "ambulance", "call", "care", "confirmation", "connection", "confused", "diabetes", "doctor", "emergency", "feel",
  "first", "floor", "gate", "guidance", "home", "line", "list", "location", "medical", "medicines", "minute", "normal",
  "potty", "review", "serious", "sos", "steps", "summary", "update",
]);

export const isConverted = (word: string) => word.toLowerCase() in WORDS;

export function toSpokenHinglish(text: string) {
  return text.replace(/[A-Za-z]+/g, (word) => WORDS[word.toLowerCase()] ?? word);
}
