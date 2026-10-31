import type { Lang } from "../types/voice.js";

// Fixed spoken lines. Copy is from Dev Guide 12.8; Hindi and Hinglish await native-speaker review.
// Never say "dispatched" here: that is reserved for after acceptance (Phase 4).
export const SOS_OPENING: Record<Lang, string> = {
  en: "Help is being sent. I'm with you.",
  hi: "मदद भेजी जा रही है। मैं आपके साथ हूँ।",
  hinglish: "Madad bheji ja rahi hai. Main aapke saath hoon.",
};
