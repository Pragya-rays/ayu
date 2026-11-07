import type { Lang } from "../../../../server/src/types/voice";

// Copy for the public pages. Hindi and Hinglish are drafts until a native speaker reviews them.
// Every claim here must stay true of the code: check PLAN.md before changing a number or a promise.

export const PAGE_IDS = ["home", "sos", "care", "hospital", "voice", "why", "about"] as const;
export type PageId = (typeof PAGE_IDS)[number];

interface Card { title: string; body: string }

export interface SiteCopy {
  nav: Record<PageId, string>;
  menu: string;
  builtOn: string;
  example: string;
  exampleNote: string;
  listening: string;
  speaking: string;
  open: string;
  home: { line1: string; line2: string; lead: string; exploreTitle: string; exploreLead: string; cards: Record<Exclude<PageId, "home">, string>; ctaTitle: string; ctaLead: string };
  sos: { line1: string; line2: string; lead: string; stepsTitle: string; steps: Card[]; scriptsTitle: string; scriptsLead: string; ctaTitle: string; ctaLead: string };
  care: { line1: string; line2: string; lead: string; how: Card[]; topicsTitle: string; topicsLead: string; ctaTitle: string };
  hospital: { line1: string; line2: string; lead: string; cards: Card[]; mockBrief: string; mockTimeline: string[]; simulatedNote: string; dashboardLink: string };
  voice: { line1: string; line2: string; lead: string; pipeline: { prisma: string; rules: string; timbre: string }; rulesResult: string; resultsTitle: string; resultsLead: string; results: { value: string; label: string }[]; resultsSource: string; features: Card[] };
  about: { safetyTitle: string; safety: Card[] };
}

const en: SiteCopy = {
  nav: { home: "Home", sos: "Emergency", care: "Everyday care", hospital: "Hospital", voice: "Voice", why: "Why India", about: "About" },
  menu: "Menu",
  builtOn: "Built on Gnani Prisma + Timbre",
  example: "Example",
  exampleNote: "example only",
  listening: "listening",
  speaking: "speaking",
  open: "Open",
  home: {
    line1: "Health help,",
    line2: "in your language.",
    lead: "Speak in Hindi, Hinglish or English. Ayu talks you through an emergency or an everyday health worry. No typing needed.",
    exploreTitle: "Everything Ayu does",
    exploreLead: "Seven short pages. Start anywhere.",
    cards: {
      sos: "One tap sends your location, then Ayu guides you until help arrives.",
      care: "Describe a problem. Warning signs are checked before any advice.",
      hospital: "A live dashboard and a one-line brief for the team on the way.",
      voice: "Gnani's speech models, tested with noise and mixed Hindi and English.",
      why: "The numbers behind Ayu, each with its source.",
      about: "Who built it, the safety rules, and what Ayu is not.",
    },
    ctaTitle: "Help is one tap away.",
    ctaLead: "Talk to Ayu now, or keep SOS for the moment it matters.",
  },
  sos: {
    line1: "One tap.",
    line2: "Help on the way.",
    lead: "For the moment someone collapses. Ayu sends your location first, and asks questions after.",
    stepsTitle: "What happens after you tap SOS",
    steps: [
      { title: "A 3-second countdown", body: "Enough time to cancel a tap by mistake. Nothing else is needed." },
      { title: "Your location goes first", body: "Your GPS location and an ambulance request are sent before any question. The ambulance is simulated." },
      { title: "Two quick questions", body: "Are they responding? Are they breathing normally? Answer by voice, or tap Yes or No." },
      { title: "Fixed first aid", body: "Rules choose one of seven fixed scripts. No AI writes first aid." },
      { title: "Ayu stays with you", body: "A CPR beat when needed, useful steps while you wait, and a check every 45 seconds." },
      { title: "Until help arrives", body: "Ambulance updates are read out. If nobody confirms within 60 seconds, Ayu tells you to call 112." },
    ],
    scriptsTitle: "The seven first-aid scripts",
    scriptsLead: "Condensed from published guidance, with sources in each file. Not reviewed by a doctor.",
    ctaTitle: "Keep this for a real emergency.",
    ctaLead: "And always call 112 as well.",
  },
  care: {
    line1: "Everyday worries,",
    line2: "answered carefully.",
    lead: "Describe a problem in your own words. Ayu asks about warning signs first, then gives simple home care from published guidance.",
    how: [
      { title: "Warning signs first", body: "If anything sounds serious, Ayu offers to switch to SOS. It never switches on its own." },
      { title: "One question at a time", body: "At most six short questions, in your language, by voice or typing." },
      { title: "No advice on a guess", body: "An unclear answer, or silence, on a warning question means see a doctor, not home care." },
      { title: "A summary to share", body: "What you said, what to do, and when to see a doctor." },
    ],
    topicsTitle: "Eight everyday topics",
    topicsLead: "No medicines or doses. Advice comes from NHS and similar guidance, and has not been reviewed by a doctor.",
    ctaTitle: "Tell Ayu what is wrong.",
  },
  hospital: {
    line1: "The hospital sees it",
    line2: "as it happens.",
    lead: "Every SOS appears on a live dashboard, with the transcript and a one-line brief built only from what the caller said.",
    cards: [
      { title: "Live case list", body: "Severity, place, GPS accuracy and status, updating within a second." },
      { title: "Pre-arrival brief", body: "One line for the team on the way. Anything the caller did not say stays unknown." },
      { title: "Transcript and timeline", body: "Every word and every step, in order." },
      { title: "Driver view", body: "Address, landmark, map link and the brief, with Accept, On the way and Arrived." },
    ],
    mockBrief: "Adult, collapsed, responsive: no, breathing: no. ETA 8 min.",
    mockTimeline: ["SOS started", "GPS received", "Ambulance requested (simulated)", "Protocol selected: CPR"],
    simulatedNote: "In this build the hospital, ambulance and driver are simulated. No real ambulance is ever contacted.",
    dashboardLink: "Open the dashboard (team password needed)",
  },
  voice: {
    line1: "Built for how",
    line2: "India speaks.",
    lead: "Ayu runs on Gnani.ai's speech models. Prisma turns speech into text, and Timbre gives Ayu its voice, in Hindi, Hinglish and English.",
    pipeline: { prisma: "Prisma · speech to text", rules: "Rules · triage", timbre: "Timbre · voice" },
    rulesResult: "responsive: no · breathing: no → CPR",
    resultsTitle: "Tested in noise",
    resultsLead: "40 synthetic calls through the live Prisma stream: generated voices with fan, street and phone-line noise. Real callers will be harder.",
    results: [
      { value: "39/40", label: "calls reached the right first-aid script" },
      { value: "40/40", label: "landmarks kept in the transcript" },
      { value: "16/16", label: "short yes and no answers heard right" },
      { value: "~0.5 s", label: "median Prisma time after speech ends" },
    ],
    resultsSource: "Ayu stream scorecard, November 2026",
    features: [
      { title: "Hinglish that sounds right", body: "Hindi words go to the voice in Devanagari, so dard sounds like dard." },
      { title: "Talk over Ayu", body: "Speak while Ayu is talking and it stops to listen, except during first-aid steps." },
      { title: "First words at once", body: "Fixed lines are recorded ahead, so the first words of an SOS play immediately." },
      { title: "Survives a bad network", body: "If the connection drops, Ayu repeats the step it was on. With no network at all, it says to call 112." },
    ],
  },
  about: {
    safetyTitle: "How Ayu stays safe",
    safety: [
      { title: "Rules decide", body: "Fixed rules pick the severity and the script. AI can only help understand speech, and can raise severity, never lower it." },
      { title: "No AI first aid", body: "Every first-aid step is fixed text from a file, with its sources listed." },
      { title: "Voice never cancels", body: "Only your own tap ends an SOS. Saying it was a mistake only offers the button." },
      { title: "Honest labels", body: "Simulated parts say so, and nothing claims a doctor's review." },
    ],
  },
};

const hi: SiteCopy = {
  nav: { home: "होम", sos: "आपातकाल", care: "रोज़ की देखभाल", hospital: "अस्पताल", voice: "आवाज़", why: "भारत क्यों", about: "परिचय" },
  menu: "मेनू",
  builtOn: "Gnani Prisma + Timbre पर बना",
  example: "उदाहरण",
  exampleNote: "केवल उदाहरण",
  listening: "सुन रहा है",
  speaking: "बोल रहा है",
  open: "खोलें",
  home: {
    line1: "स्वास्थ्य सहायता,",
    line2: "आपकी भाषा में।",
    lead: "हिंदी, हिंग्लिश या अंग्रेज़ी में बोलिए। आपात स्थिति हो या रोज़ की तकलीफ़, आयु आपको हर कदम बताता है। टाइप करने की ज़रूरत नहीं।",
    exploreTitle: "आयु क्या-क्या करता है",
    exploreLead: "सात छोटे पेज। कहीं से भी शुरू करें।",
    cards: {
      sos: "एक टैप से लोकेशन जाती है, फिर मदद पहुँचने तक आयु साथ रहता है।",
      care: "अपनी तकलीफ़ बताइए। सलाह से पहले ख़तरे के संकेत जाँचे जाते हैं।",
      hospital: "रास्ते में मौजूद टीम के लिए लाइव डैशबोर्ड और एक लाइन का सारांश।",
      voice: "Gnani के स्पीच मॉडल, शोर और मिली-जुली भाषा के साथ जाँचे गए।",
      why: "आयु के पीछे के आँकड़े, हर एक के स्रोत के साथ।",
      about: "इसे किसने बनाया, सुरक्षा के नियम, और आयु क्या नहीं है।",
    },
    ctaTitle: "मदद बस एक टैप दूर है।",
    ctaLead: "अभी आयु से बात करें, या SOS उस पल के लिए रखें जब ज़रूरत हो।",
  },
  sos: {
    line1: "एक टैप।",
    line2: "मदद रास्ते में।",
    lead: "उस पल के लिए जब कोई गिर पड़े। आयु पहले आपकी लोकेशन भेजता है, सवाल बाद में पूछता है।",
    stepsTitle: "SOS दबाने के बाद क्या होता है",
    steps: [
      { title: "3 सेकंड की गिनती", body: "गलती से दबा हो तो रद्द करने का समय। और कुछ नहीं करना है।" },
      { title: "पहले आपकी लोकेशन", body: "किसी सवाल से पहले GPS लोकेशन और एम्बुलेंस अनुरोध भेजा जाता है। एम्बुलेंस सिम्युलेटेड है।" },
      { title: "दो छोटे सवाल", body: "क्या वो जवाब दे रहे हैं? क्या वो सामान्य सांस ले रहे हैं? बोलकर या हाँ/ना दबाकर बताइए।" },
      { title: "तय प्राथमिक उपचार", body: "नियम सात तय स्क्रिप्ट में से एक चुनते हैं। प्राथमिक उपचार कोई AI नहीं लिखता।" },
      { title: "आयु साथ रहता है", body: "ज़रूरत हो तो CPR की ताल, इंतज़ार में काम की बातें, और हर 45 सेकंड में जाँच।" },
      { title: "मदद पहुँचने तक", body: "एम्बुलेंस की जानकारी बोलकर बताई जाती है। 60 सेकंड में पुष्टि न हो तो आयु 112 पर कॉल करने को कहता है।" },
    ],
    scriptsTitle: "सात प्राथमिक उपचार स्क्रिप्ट",
    scriptsLead: "प्रकाशित मार्गदर्शन से संक्षेप में, हर फ़ाइल में स्रोत के साथ। डॉक्टर ने जाँच नहीं की है।",
    ctaTitle: "इसे असली आपात स्थिति के लिए रखें।",
    ctaLead: "और 112 पर कॉल भी ज़रूर करें।",
  },
  care: {
    line1: "रोज़ की परेशानियाँ,",
    line2: "सावधानी से जवाब।",
    lead: "अपने शब्दों में तकलीफ़ बताइए। आयु पहले ख़तरे के संकेत पूछता है, फिर प्रकाशित मार्गदर्शन से घर पर देखभाल के आसान कदम बताता है।",
    how: [
      { title: "पहले ख़तरे के संकेत", body: "कुछ गंभीर लगे तो आयु SOS पर जाने को कहता है। वह ख़ुद नहीं बदलता।" },
      { title: "एक बार में एक सवाल", body: "ज़्यादा से ज़्यादा छह छोटे सवाल, आपकी भाषा में, बोलकर या लिखकर।" },
      { title: "अंदाज़े पर सलाह नहीं", body: "ख़तरे वाले सवाल पर साफ़ जवाब न मिले या चुप्पी हो, तो डॉक्टर को दिखाने की बात, घरेलू देखभाल नहीं।" },
      { title: "साझा करने लायक सारांश", body: "आपने क्या कहा, क्या करना है, और डॉक्टर को कब दिखाना है।" },
    ],
    topicsTitle: "रोज़ की आठ परेशानियाँ",
    topicsLead: "कोई दवा या खुराक नहीं। सलाह NHS जैसे मार्गदर्शन से है, और डॉक्टर ने इसकी जाँच नहीं की है।",
    ctaTitle: "आयु को बताइए क्या तकलीफ़ है।",
  },
  hospital: {
    line1: "अस्पताल सब कुछ",
    line2: "उसी पल देखता है।",
    lead: "हर SOS लाइव डैशबोर्ड पर दिखता है, बातचीत और एक लाइन के सारांश के साथ, जो सिर्फ़ कॉल करने वाले की कही बातों से बनता है।",
    cards: [
      { title: "मामलों की लाइव सूची", body: "गंभीरता, जगह, GPS की सटीकता और स्थिति, एक सेकंड के अंदर अपडेट।" },
      { title: "पहुँचने से पहले का सारांश", body: "रास्ते में मौजूद टीम के लिए एक लाइन। जो कहा नहीं गया, वह अज्ञात रहता है।" },
      { title: "बातचीत और समय-रेखा", body: "हर शब्द और हर कदम, क्रम में।" },
      { title: "ड्राइवर का पेज", body: "पता, पहचान, नक्शे का लिंक और सारांश, स्वीकार करने और पहुँचने के बटन के साथ।" },
    ],
    mockBrief: "वयस्क, गिर गए, जवाब: नहीं, सांस: नहीं। 8 मिनट में पहुँचेगी।",
    mockTimeline: ["SOS शुरू", "GPS मिला", "एम्बुलेंस अनुरोध (सिम्युलेटेड)", "प्रोटोकॉल चुना: CPR"],
    simulatedNote: "इस संस्करण में अस्पताल, एम्बुलेंस और ड्राइवर सिम्युलेटेड हैं। किसी असली एम्बुलेंस से कभी संपर्क नहीं होता।",
    dashboardLink: "डैशबोर्ड खोलें (टीम का पासवर्ड चाहिए)",
  },
  voice: {
    line1: "भारत जैसे बोलता है,",
    line2: "वैसे ही बना।",
    lead: "आयु Gnani.ai के स्पीच मॉडल पर चलता है। Prisma बोली को लिखाई में बदलता है, और Timbre आयु को आवाज़ देता है, हिंदी, हिंग्लिश और अंग्रेज़ी में।",
    pipeline: { prisma: "Prisma · बोली से लिखाई", rules: "नियम · जाँच", timbre: "Timbre · आवाज़" },
    rulesResult: "जवाब: नहीं · सांस: नहीं → CPR",
    resultsTitle: "शोर में जाँचा गया",
    resultsLead: "लाइव Prisma स्ट्रीम से 40 बनावटी कॉल: बनाई गई आवाज़ें, पंखे, सड़क और फ़ोन लाइन के शोर के साथ। असली कॉल इससे कठिन होंगी।",
    results: [
      { value: "39/40", label: "कॉल सही प्राथमिक उपचार तक पहुँचीं" },
      { value: "40/40", label: "पहचान की जगहें लिखाई में सही रहीं" },
      { value: "16/16", label: "छोटे हाँ और ना सही सुने गए" },
      { value: "~0.5 s", label: "बोलना ख़त्म होने के बाद Prisma का औसत समय" },
    ],
    resultsSource: "आयु स्ट्रीम स्कोरकार्ड, नवंबर 2026",
    features: [
      { title: "हिंग्लिश जो सही सुनाई दे", body: "हिंदी शब्द आवाज़ को देवनागरी में भेजे जाते हैं, ताकि 'दर्द' सही सुनाई दे।" },
      { title: "बीच में बोलिए", body: "आयु बोल रहा हो तब भी आप बोलें तो वह रुककर सुनता है, प्राथमिक उपचार के कदमों को छोड़कर।" },
      { title: "पहले शब्द तुरंत", body: "तय लाइनें पहले से रिकॉर्ड हैं, इसलिए SOS के पहले शब्द तुरंत बजते हैं।" },
      { title: "ख़राब नेटवर्क में भी", body: "कनेक्शन टूटे तो आयु वही कदम दोहराता है। नेटवर्क बिल्कुल न हो तो 112 पर कॉल करने को कहता है।" },
    ],
  },
  about: {
    safetyTitle: "आयु सुरक्षित कैसे रहता है",
    safety: [
      { title: "फ़ैसला नियम करते हैं", body: "तय नियम गंभीरता और स्क्रिप्ट चुनते हैं। AI सिर्फ़ बोली समझने में मदद करता है, और गंभीरता बढ़ा सकता है, कभी घटा नहीं सकता।" },
      { title: "AI प्राथमिक उपचार नहीं लिखता", body: "हर कदम फ़ाइल का तय पाठ है, जिसमें स्रोत लिखे हैं।" },
      { title: "आवाज़ से रद्द नहीं होता", body: "SOS सिर्फ़ आपके अपने टैप से ख़त्म होता है। 'गलती से हुआ' कहने पर सिर्फ़ बटन दिखता है।" },
      { title: "ईमानदार लेबल", body: "जो सिम्युलेटेड है, वह यह बताता है, और कहीं डॉक्टर की जाँच का दावा नहीं है।" },
    ],
  },
};

const hinglish: SiteCopy = {
  nav: { home: "Home", sos: "Emergency", care: "Roz ki care", hospital: "Hospital", voice: "Awaaz", why: "India kyun", about: "About" },
  menu: "Menu",
  builtOn: "Gnani Prisma + Timbre par bana",
  example: "Example",
  exampleNote: "sirf example",
  listening: "sun raha hai",
  speaking: "bol raha hai",
  open: "Kholein",
  home: {
    line1: "Health help,",
    line2: "aapki bhasha mein.",
    lead: "Hindi, Hinglish ya English mein boliye. Emergency ho ya roz ki takleef, Ayu har kadam batata hai. Type karne ki zaroorat nahi.",
    exploreTitle: "Ayu kya-kya karta hai",
    exploreLead: "Saat chhote pages. Kahin se bhi shuru karein.",
    cards: {
      sos: "Ek tap se location jaati hai, phir madad pahunchne tak Ayu saath rehta hai.",
      care: "Apni takleef batayein. Salah se pehle warning signs check hote hain.",
      hospital: "Raste mein team ke liye live dashboard aur ek line ka brief.",
      voice: "Gnani ke speech models, shor aur mili-juli bhasha ke saath test kiye gaye.",
      why: "Ayu ke peeche ke numbers, har ek ke source ke saath.",
      about: "Ise kisne banaya, safety ke rules, aur Ayu kya nahi hai.",
    },
    ctaTitle: "Madad bas ek tap door hai.",
    ctaLead: "Abhi Ayu se baat karein, ya SOS us pal ke liye rakhein jab zaroorat ho.",
  },
  sos: {
    line1: "Ek tap.",
    line2: "Madad raste mein.",
    lead: "Us pal ke liye jab koi gir pade. Ayu pehle aapki location bhejta hai, sawaal baad mein poochta hai.",
    stepsTitle: "SOS dabane ke baad kya hota hai",
    steps: [
      { title: "3 second ki ginti", body: "Galti se daba ho to cancel karne ka time. Aur kuch nahi karna hai." },
      { title: "Pehle aapki location", body: "Kisi sawaal se pehle GPS location aur ambulance request bheji jaati hai. Ambulance simulated hai." },
      { title: "Do chhote sawaal", body: "Kya woh jawab de rahe hain? Kya woh normal saans le rahe hain? Bolkar ya Haan/Nahi dabakar batayein." },
      { title: "Fixed first aid", body: "Rules saat fixed scripts mein se ek chunte hain. First aid koi AI nahi likhta." },
      { title: "Ayu saath rehta hai", body: "Zaroorat ho to CPR ki taal, intezaar mein kaam ki baatein, aur har 45 second mein check." },
      { title: "Madad pahunchne tak", body: "Ambulance ki updates bolkar batayi jaati hain. 60 second mein confirmation na ho to Ayu 112 par call karne ko kehta hai." },
    ],
    scriptsTitle: "Saat first aid scripts",
    scriptsLead: "Published guidance se chhota karke, har file mein source ke saath. Doctor ne check nahi kiya hai.",
    ctaTitle: "Ise asli emergency ke liye rakhein.",
    ctaLead: "Aur 112 par call bhi zaroor karein.",
  },
  care: {
    line1: "Roz ki pareshaniyan,",
    line2: "dhyan se jawab.",
    lead: "Apne shabdon mein takleef batayein. Ayu pehle warning signs poochta hai, phir published guidance se home care ke aasan steps batata hai.",
    how: [
      { title: "Pehle warning signs", body: "Kuch serious lage to Ayu SOS par jaane ko kehta hai. Woh khud nahi badalta." },
      { title: "Ek baar mein ek sawaal", body: "Zyada se zyada chhe chhote sawaal, aapki bhasha mein, bolkar ya likhkar." },
      { title: "Andaze par salah nahi", body: "Warning wale sawaal par saaf jawab na mile ya chuppi ho, to doctor ko dikhane ki baat, home care nahi." },
      { title: "Share karne layak summary", body: "Aapne kya kaha, kya karna hai, aur doctor ko kab dikhana hai." },
    ],
    topicsTitle: "Roz ki aath pareshaniyan",
    topicsLead: "Koi dawa ya dose nahi. Salah NHS jaisi guidance se hai, aur doctor ne iski jaanch nahi ki hai.",
    ctaTitle: "Ayu ko batayein kya takleef hai.",
  },
  hospital: {
    line1: "Hospital sab kuch",
    line2: "usi pal dekhta hai.",
    lead: "Har SOS live dashboard par dikhta hai, transcript aur ek line ke brief ke saath, jo sirf caller ki kahi baaton se banta hai.",
    cards: [
      { title: "Cases ki live list", body: "Severity, jagah, GPS accuracy aur status, ek second ke andar update." },
      { title: "Pahunchne se pehle ka brief", body: "Raste mein team ke liye ek line. Jo kaha nahi gaya, woh unknown rehta hai." },
      { title: "Transcript aur timeline", body: "Har shabd aur har kadam, order mein." },
      { title: "Driver ka page", body: "Address, landmark, map link aur brief, Accept aur Arrived buttons ke saath." },
    ],
    mockBrief: "Adult, gir gaye, responsive: no, breathing: no. 8 min mein pahunchegi.",
    mockTimeline: ["SOS shuru", "GPS mila", "Ambulance request (simulated)", "Protocol chuna: CPR"],
    simulatedNote: "Is version mein hospital, ambulance aur driver simulated hain. Kisi asli ambulance se kabhi contact nahi hota.",
    dashboardLink: "Dashboard kholein (team ka password chahiye)",
  },
  voice: {
    line1: "India jaise bolta hai,",
    line2: "waise hi bana.",
    lead: "Ayu Gnani.ai ke speech models par chalta hai. Prisma boli ko text mein badalta hai, aur Timbre Ayu ko awaaz deta hai, Hindi, Hinglish aur English mein.",
    pipeline: { prisma: "Prisma · speech se text", rules: "Rules · triage", timbre: "Timbre · awaaz" },
    rulesResult: "responsive: no · breathing: no → CPR",
    resultsTitle: "Shor mein test kiya gaya",
    resultsLead: "Live Prisma stream se 40 synthetic calls: banayi gayi awaazein, pankhe, sadak aur phone line ke shor ke saath. Asli calls isse mushkil hongi.",
    results: [
      { value: "39/40", label: "calls sahi first aid script tak pahunchin" },
      { value: "40/40", label: "landmarks transcript mein sahi rahe" },
      { value: "16/16", label: "chhote haan aur nahi sahi sune gaye" },
      { value: "~0.5 s", label: "bolna khatam hone ke baad Prisma ka median time" },
    ],
    resultsSource: "Ayu stream scorecard, November 2026",
    features: [
      { title: "Hinglish jo sahi sunayi de", body: "Hindi shabd awaaz ko Devanagari mein bheje jaate hain, taaki dard sahi sunayi de." },
      { title: "Beech mein boliye", body: "Ayu bol raha ho tab bhi aap bolein to woh rukkar sunta hai, first aid steps ko chhodkar." },
      { title: "Pehle shabd turant", body: "Fixed lines pehle se record hain, isliye SOS ke pehle shabd turant bajte hain." },
      { title: "Kharab network mein bhi", body: "Connection toote to Ayu wahi step dohrata hai. Network bilkul na ho to 112 par call karne ko kehta hai." },
    ],
  },
  about: {
    safetyTitle: "Ayu safe kaise rehta hai",
    safety: [
      { title: "Faisla rules karte hain", body: "Fixed rules severity aur script chunte hain. AI sirf boli samajhne mein madad karta hai, aur severity badha sakta hai, kabhi ghata nahi sakta." },
      { title: "AI first aid nahi likhta", body: "Har step file ka fixed text hai, jismein sources likhe hain." },
      { title: "Awaaz se cancel nahi hota", body: "SOS sirf aapke apne tap se khatam hota hai. Galti se hua kehne par sirf button dikhta hai." },
      { title: "Imaandaar labels", body: "Jo simulated hai, woh yeh batata hai, aur kahin doctor ki jaanch ka daawa nahi hai." },
    ],
  },
};

export const siteCopy: Record<Lang, SiteCopy> = { en, hi, hinglish };
