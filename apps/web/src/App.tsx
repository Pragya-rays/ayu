import { useEffect, useState } from "react";
import type { Lang } from "../../../server/src/types/voice";
import { unlockAudio } from "./audio/voiceClient";
import { Backdrop } from "./components/Backdrop";
import { LanguageToggle } from "./components/LanguageToggle";
import { strings, type StringKey } from "./i18n/strings";
import { Dashboard } from "./pages/Dashboard";
import { Driver } from "./pages/Driver";
import { Site, SITE_PATHS, type SitePath } from "./pages/Site";
import { MedicalIdPage, type MedicalId } from "./pages/MedicalId";
import { Normal } from "./pages/Normal";
import { Sos } from "./pages/Sos";
import { VoiceCheck } from "./pages/VoiceCheck";

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

const sitePath = (): SitePath => {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  return SITE_PATHS.includes(path) ? path : "/";
};

function PhoneApp() {
  const [path, setPath] = useState<SitePath>(sitePath);
  const [lang, setLang] = useState<Lang>((readStored("ayu.lang") as Lang | null) ?? "hinglish");
  const [consented, setConsented] = useState(readStored("ayu.consent.v2") !== null);
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

  // Pages without a router: the address bar, back button and shared links all work.
  useEffect(() => {
    const onPop = () => setPath(sitePath());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const navigate = (to: SitePath) => {
    if (to !== location.pathname) history.pushState(null, "", to);
    setPath(to);
    scrollTo({ top: 0 });
  };

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((health: { voiceLab: boolean }) => setVoiceLab(health.voiceLab))
      .catch(() => undefined);
  }, []);

  const accept = () => {
    writeStored("ayu.consent.v2", new Date().toISOString());
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

  if (sosAudio) {
    return (
      <Sos
        lang={lang}
        t={t}
        audio={sosAudio}
        medicalId={medicalId}
        onExit={() => setSosAudio(null)}
        onTalk={(audio) => {
          setSosAudio(null);
          setTalkAudio(audio);
        }}
      />
    );
  }
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
    <Site
      path={path}
      navigate={navigate}
      lang={lang}
      t={t}
      hasMedicalId={Boolean(medicalId)}
      onLang={setLang}
      onTalk={() => setTalkAudio(unlockAudio())}
      onSos={() => setSosAudio(unlockAudio())}
      onMedical={() => setMedicalOpen(true)}
    />
  );
}

function Page() {
  if (location.pathname === "/dashboard") return <Dashboard />;
  if (location.pathname === "/driver") return <Driver />;
  return <PhoneApp />;
}

export function App() {
  return (
    <>
      <Backdrop />
      <Page />
    </>
  );
}
