import { useEffect, useState } from "react";
import type { Lang } from "../../../server/src/types/voice";
import { unlockAudio } from "./audio/voiceClient";
import { strings, type StringKey } from "./i18n/strings";
import { Dashboard } from "./pages/Dashboard";
import { Driver } from "./pages/Driver";
import { MedicalIdPage, type MedicalId } from "./pages/MedicalId";
import { Normal } from "./pages/Normal";
import { Sos } from "./pages/Sos";
import { VoiceCheck } from "./pages/VoiceCheck";

const LANGS: { id: Lang; label: string }[] = [
  { id: "hi", label: "हिन्दी" },
  { id: "hinglish", label: "Hinglish" },
  { id: "en", label: "English" },
];

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows may block storage; the app works without it.
  }
}

function LanguageToggle({ lang, onChange, label }: { lang: Lang; onChange(lang: Lang): void; label: string }) {
  return (
    <div className="lang-toggle" role="group" aria-label={label}>
      {LANGS.map((option) => (
        <button key={option.id} aria-pressed={lang === option.id} onClick={() => onChange(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PhoneApp() {
  const [lang, setLang] = useState<Lang>((readStored("ayu.lang") as Lang | null) ?? "hinglish");
  const [consented, setConsented] = useState(readStored("ayu.consentAt") !== null);
  const [sosAudio, setSosAudio] = useState<AudioContext | null>(null);
  const [talkAudio, setTalkAudio] = useState<AudioContext | null>(null);
  const [voiceLab, setVoiceLab] = useState(false);
  const [medicalOpen, setMedicalOpen] = useState(false);
  const [medicalId, setMedicalId] = useState<MedicalId | null>(() => {
    try {
      return JSON.parse(readStored("ayu.medicalId") ?? "null") as MedicalId | null;
    } catch {
      return null;
    }
  });
  const t = (key: StringKey) => strings[lang][key];

  useEffect(() => {
    writeStored("ayu.lang", lang);
    document.documentElement.lang = lang === "hi" ? "hi" : "en";
  }, [lang]);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((health: { voiceLab: boolean }) => setVoiceLab(health.voiceLab))
      .catch(() => undefined);
  }, []);

  const accept = () => {
    writeStored("ayu.consentAt", new Date().toISOString());
    setConsented(true);
  };

  const saveMedicalId = (value: MedicalId | null) => {
    setMedicalId(value);
    writeStored("ayu.medicalId", JSON.stringify(value));
  };

  if (!consented) {
    return (
      <div className="paper">
        <main className="screen">
          <div className="topbar">
            <span className="wordmark">{t("brand")}</span>
            <LanguageToggle lang={lang} onChange={setLang} label={t("chooseLanguage")} />
          </div>
          <div className="hero">
            <section className="card">
              <h2>{t("consentTitle")}</h2>
              <p>{t("consentBody")}</p>
            </section>
          </div>
          <button className="button ink" onClick={accept}>{t("consentAccept")}</button>
        </main>
      </div>
    );
  }

  if (sosAudio) return <Sos lang={lang} t={t} audio={sosAudio} medicalId={medicalId} onExit={() => setSosAudio(null)} />;
  if (medicalOpen) return <MedicalIdPage t={t} value={medicalId} onSave={saveMedicalId} onBack={() => setMedicalOpen(false)} />;
  if (talkAudio) {
    return (
      <Normal
        lang={lang}
        t={t}
        audio={talkAudio}
        onBack={() => setTalkAudio(null)}
        onSwitchToSos={() => {
          setTalkAudio(null);
          setSosAudio(unlockAudio());
        }}
      />
    );
  }
  if (voiceLab && location.pathname === "/voice-check") return <VoiceCheck lang={lang} t={t} onBack={() => location.assign("/")} />;

  return (
    <div className="paper">
      <main className="screen">
        <div className="topbar">
          <span className="wordmark">{t("brand")}</span>
          <LanguageToggle lang={lang} onChange={setLang} label={t("chooseLanguage")} />
        </div>
        <div className="hero">
          <h1>{t("headline")}</h1>
          <p>{t("subline")}</p>
        </div>
        <div className="actions">
          <button className="button ink" onClick={() => setTalkAudio(unlockAudio())}>{t("talk")}</button>
          <button className="button sos" onClick={() => setSosAudio(unlockAudio())}>{t("sos")}</button>
          <button className="text-link" onClick={() => setMedicalOpen(true)}>{t(medicalId ? "medicalEdit" : "medicalAdd")}</button>
          <p className="mono">{t("disclaimer")}</p>
        </div>
      </main>
    </div>
  );
}

export function App() {
  if (location.pathname === "/dashboard") return <Dashboard />;
  if (location.pathname === "/driver") return <Driver />;
  return <PhoneApp />;
}
