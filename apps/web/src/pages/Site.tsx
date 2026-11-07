import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { Lang } from "../../../../server/src/types/voice";
import { Icon, type IconName } from "../components/Icon";
import { LanguageToggle } from "../components/LanguageToggle";
import { siteCopy, type PageId } from "../i18n/site";
import type { StringKey } from "../i18n/strings";

// Titles come straight from the protocol and home-care files, so these pages can never drift from them.
type Titles = Record<Lang, string>;
const scriptTitles = import.meta.glob<Titles>("../../../../server/src/protocols/*.json", { eager: true, import: "title" });
const careTitles = import.meta.glob<Titles>("../../../../server/src/homecare/*.json", { eager: true, import: "title" });
const byFile = (files: Record<string, Titles>) =>
  Object.fromEntries(Object.entries(files).map(([file, title]) => [file.split("/").pop()!.replace(".json", ""), title]));
const SCRIPTS = byFile(scriptTitles);
const CARE = byFile(careTitles);
const SCRIPT_ORDER = ["cpr", "chest_pain_conscious", "stroke", "recovery_stroke_collapse", "choking", "severe_bleeding", "general"];
const CARE_ORDER = ["acidity", "heat_headache", "mild_fever", "cold_cough", "sore_throat", "loose_motions", "vomiting", "constipation"];

const SOURCES = {
  road: { label: "Ministry of Road Transport and Highways, via PTI, 2025", url: "https://www.dtnext.in/news/national/172-lakh-people-died-in-480-lakh-road-accidents-in-2023-road-ministry-report-844831" },
  heart: { label: "India State-Level Disease Burden Initiative, The Lancet Global Health, 2018", url: "https://doi.org/10.1016/S2214-109X(18)30407-8" },
  cpr: { label: "Bhat R et al., Indian Heart Journal, 2021", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8424282/" },
  hindi: { label: "Census of India 2011, as tabulated on Wikipedia", url: "https://en.wikipedia.org/wiki/List_of_languages_by_number_of_native_speakers_in_India" },
  emergency: { label: "Ministry of Home Affairs", url: "https://www.mha.gov.in/emergency-response-support-system-erss" },
  scorecard: { label: "", url: "https://github.com/Pragya-rays/ayu/blob/main/eval/results/scorecard-stream.md" },
};

const STATS: { value: string; label: StringKey; note?: StringKey; source: keyof typeof SOURCES }[] = [
  { value: "20", label: "stat1Label", note: "stat1Note", source: "road" },
  { value: "28.1%", label: "stat2Label", source: "heart" },
  { value: "9.8%", label: "stat3Label", source: "cpr" },
  { value: "43.6%", label: "stat4Label", source: "hindi" },
];

const PAGES: { id: PageId; path: string; icon: IconName; tone: string }[] = [
  { id: "home", path: "/", icon: "logo", tone: "indigo" },
  { id: "sos", path: "/sos", icon: "siren", tone: "red" },
  { id: "care", path: "/care", icon: "heart", tone: "pink" },
  { id: "hospital", path: "/hospital", icon: "hospital", tone: "teal" },
  { id: "voice", path: "/voice", icon: "wave", tone: "amber" },
  { id: "why", path: "/why", icon: "chart", tone: "violet" },
  { id: "about", path: "/about", icon: "info", tone: "sky" },
];

export const SITE_PATHS = PAGES.map((page) => page.path);
export type SitePath = string;

interface Props {
  path: SitePath;
  lang: Lang;
  t: (key: StringKey) => string;
  hasMedicalId: boolean;
  navigate(path: SitePath): void;
  onLang(lang: Lang): void;
  onTalk(): void;
  onSos(): void;
  onMedical(): void;
}

type PageProps = Props & { onSosVisible(visible: boolean): void };

function Source({ id, label }: { id: keyof typeof SOURCES; label?: string }) {
  return <a className="source" href={SOURCES[id].url} target="_blank" rel="noreferrer">{label ?? SOURCES[id].label}</a>;
}

/** A real link that also opens in a new tab, but changes page in place on a normal click. */
function PageLink({ to, navigate, className, current, children, label }: { to: SitePath; navigate: Props["navigate"]; className?: string; current?: boolean; children: ReactNode; label?: string }) {
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(to);
  };
  return <a className={className} href={to} onClick={click} aria-current={current ? "page" : undefined} aria-label={label}>{children}</a>;
}

function Tile({ icon, tone }: { icon: IconName; tone: string }) {
  return <span className="tile" data-tone={tone}><Icon name={icon} /></span>;
}

function PageHero({ line1, line2, lead, children }: { line1: string; line2: string; lead: string; children?: ReactNode }) {
  return (
    <header className="page-hero">
      <h1>{line1} <span className="grad">{line2}</span></h1>
      <p className="lead">{lead}</p>
      {children}
    </header>
  );
}

function PhoneMock({ lang, t }: { lang: Lang; t: Props["t"] }) {
  const copy = siteCopy[lang];
  return (
    <div className="phone-wrap" aria-label={copy.example}>
      <div className="float-chip chip-top">
        <Tile icon="mic" tone="amber" />
        <span><small>Gnani Prisma</small><b>{copy.listening}</b></span>
      </div>
      <div className="phone">
        <div className="phone-head">
          <Tile icon="logo" tone="indigo" />
          <span><b>Ayu</b><small><i className="dot" /> SOS · {t("simulated")}</small></span>
        </div>
        <p className="bubble ayu">{t("sosOpening")}</p>
        <p className="bubble you">{t("heroExYou1")}</p>
        <p className="bubble ayu">{t("heroExAyu1")}</p>
        <p className="bubble you">{t("heroExYou2")}</p>
        <p className="bubble ayu step">{t("heroExAyu2")}<span className="beat-chip"><Icon name="pulse" size={16} /> CPR · 110/min</span></p>
        <p className="phone-note">{copy.example} · {copy.exampleNote}</p>
      </div>
      <div className="float-chip chip-bottom">
        <Tile icon="speaker" tone="violet" />
        <span><small>Gnani Timbre</small><b>{copy.speaking}</b></span>
      </div>
    </div>
  );
}

function HomePage({ lang, t, hasMedicalId, navigate, onTalk, onSos, onMedical, onSosVisible }: PageProps) {
  const copy = siteCopy[lang];
  const heroActions = useRef<HTMLDivElement>(null);

  // SOS moves to the navbar once this one scrolls away, so it is never a scroll from the caller.
  useEffect(() => {
    if (!heroActions.current || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => onSosVisible(entry!.isIntersecting));
    observer.observe(heroActions.current);
    return () => observer.disconnect();
  }, [onSosVisible]);

  return (
    <>
      <section className="hero-band">
        <div className="hero-copy">
          <p className="pill-chip"><i className="dot" /> {copy.builtOn}</p>
          <h1>{copy.home.line1} <span className="grad">{copy.home.line2}</span></h1>
          <p className="lead">{copy.home.lead}</p>
          <div className="actions" ref={heroActions}>
            <button className="button ink" onClick={onTalk}><Icon name="mic" /> {t("talk")}</button>
            <button className="button sos" onClick={onSos}>{t("sos")}</button>
          </div>
          <button className="text-link" onClick={onMedical}>{t(hasMedicalId ? "medicalEdit" : "medicalAdd")}</button>
          <p className="mono">{t("disclaimer")}</p>
        </div>
        <PhoneMock lang={lang} t={t} />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>{copy.home.exploreTitle}</h2>
          <p>{copy.home.exploreLead}</p>
        </div>
        <div className="grid-3">
          {PAGES.filter((page) => page.id !== "home").map(({ id, path, icon, tone }) => (
            <PageLink key={id} to={path} navigate={navigate} className="card link-card">
              <Tile icon={icon} tone={tone} />
              <h3>{copy.nav[id]}</h3>
              <p>{copy.home.cards[id as Exclude<PageId, "home">]}</p>
              <span className="more">{copy.open} <Icon name="arrow" size={18} /></span>
            </PageLink>
          ))}
        </div>
      </section>

      <section className="cta">
        <Tile icon="logo" tone="indigo" />
        <h2>{copy.home.ctaTitle}</h2>
        <p>{copy.home.ctaLead}</p>
        <div className="cta-actions">
          <button className="button ink" onClick={onTalk}><Icon name="mic" /> {t("talk")}</button>
          <a className="button plain" href="tel:112"><Icon name="phone" /> {t("call112")}</a>
        </div>
      </section>
    </>
  );
}

function SosPage({ lang, t, onSos }: PageProps) {
  const copy = siteCopy[lang].sos;
  const icons: IconName[] = ["clock", "pin", "list", "shield", "pulse", "hospital"];
  return (
    <>
      <PageHero line1={copy.line1} line2={copy.line2} lead={copy.lead}>
        <p className="pill-chip warn"><Icon name="info" size={16} /> {siteCopy[lang].hospital.simulatedNote}</p>
      </PageHero>
      <section className="section">
        <h2 className="section-title">{copy.stepsTitle}</h2>
        <ol className="steps grid-3">
          {copy.steps.map((step, index) => (
            <li className="card step-card" key={step.title}>
              <span className="step-number">{index + 1}</span>
              <Tile icon={icons[index]!} tone={index === 0 ? "red" : "indigo"} />
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="section">
        <div className="section-head">
          <h2>{copy.scriptsTitle}</h2>
          <p>{copy.scriptsLead}</p>
        </div>
        <ul className="chips-grid">
          {SCRIPT_ORDER.filter((id) => SCRIPTS[id]).map((id) => (
            <li className="card chip-card" key={id}><Tile icon="pulse" tone="red" /><span>{SCRIPTS[id]![lang]}</span></li>
          ))}
        </ul>
      </section>
      <section className="cta">
        <h2>{copy.ctaTitle}</h2>
        <p>{copy.ctaLead}</p>
        <div className="cta-actions">
          <button className="button sos" onClick={onSos}>{t("sos")}</button>
          <a className="button plain" href="tel:112"><Icon name="phone" /> {t("call112")}</a>
        </div>
      </section>
    </>
  );
}

function CarePage({ lang, t, onTalk }: PageProps) {
  const copy = siteCopy[lang].care;
  const icons: IconName[] = ["shield", "list", "info", "heart"];
  return (
    <>
      <PageHero line1={copy.line1} line2={copy.line2} lead={copy.lead} />
      <section className="grid-2">
        {copy.how.map((card, index) => (
          <article className="card feature" key={card.title}>
            <Tile icon={icons[index]!} tone={index === 0 ? "red" : "pink"} />
            <div><h3>{card.title}</h3><p>{card.body}</p></div>
          </article>
        ))}
      </section>
      <section className="section">
        <div className="section-head">
          <h2>{copy.topicsTitle}</h2>
          <p>{copy.topicsLead}</p>
        </div>
        <ul className="chips-grid">
          {CARE_ORDER.filter((id) => CARE[id]).map((id) => (
            <li className="card chip-card" key={id}><Tile icon="heart" tone="pink" /><span>{CARE[id]![lang]}</span></li>
          ))}
        </ul>
      </section>
      <section className="cta">
        <h2>{copy.ctaTitle}</h2>
        <div className="cta-actions">
          <button className="button ink" onClick={onTalk}><Icon name="mic" /> {t("talk")}</button>
        </div>
      </section>
    </>
  );
}

function HospitalPage({ lang, t }: PageProps) {
  const copy = siteCopy[lang].hospital;
  const icons: IconName[] = ["list", "info", "clock", "pin"];
  return (
    <>
      <PageHero line1={copy.line1} line2={copy.line2} lead={copy.lead} />
      <section className="split">
        <div className="card mock-dash" aria-label={siteCopy[lang].example}>
          <p className="eyebrow">{siteCopy[lang].example} · {t("simulated")}</p>
          <div className="mock-case">
            <span className="chip" data-severity="RED">RED</span>
            <b>Hazratganj, Lucknow</b>
            <span className="mono">±30 m</span>
          </div>
          <p className="brief">{copy.mockBrief}</p>
          <ul className="mock-timeline">
            {copy.mockTimeline.map((line, index) => <li key={line}><span className="mono">12:0{index}</span>{line}</li>)}
          </ul>
        </div>
        <div className="stack">
          {copy.cards.map((card, index) => (
            <article className="card feature" key={card.title}>
              <Tile icon={icons[index]!} tone="teal" />
              <div><h3>{card.title}</h3><p>{card.body}</p></div>
            </article>
          ))}
        </div>
      </section>
      <p className="pill-chip warn centered"><Icon name="info" size={16} /> {copy.simulatedNote}</p>
      <p className="centered"><a className="text-link" href="/dashboard">{copy.dashboardLink}</a></p>
    </>
  );
}

function VoicePage({ lang, t }: PageProps) {
  const copy = siteCopy[lang].voice;
  const icons: IconName[] = ["speaker", "mic", "clock", "wifi"];
  return (
    <>
      <PageHero line1={copy.line1} line2={copy.line2} lead={copy.lead} />
      <section className="split">
        <div className="pipeline">
          <div className="pipe-row"><Tile icon="mic" tone="amber" /><b>{copy.pipeline.prisma}</b></div>
          <p className="pipe-box">“मेरे पापा गिर गए हैं, Gomti Nagar में petrol pump के पास हैं।”</p>
          <div className="pipe-row"><Tile icon="shield" tone="indigo" /><b>{copy.pipeline.rules}</b></div>
          <p className="pipe-box code">{copy.rulesResult}</p>
          <div className="pipe-row"><Tile icon="speaker" tone="violet" /><b>{copy.pipeline.timbre}</b></div>
          <p className="pipe-box">“{t("heroExAyu2")}”</p>
        </div>
        <div className="stack">
          {copy.features.map((card, index) => (
            <article className="card feature" key={card.title}>
              <Tile icon={icons[index]!} tone="violet" />
              <div><h3>{card.title}</h3><p>{card.body}</p></div>
            </article>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section-head">
          <h2>{copy.resultsTitle}</h2>
          <p>{copy.resultsLead}</p>
        </div>
        <div className="grid-4">
          {copy.results.map((result) => (
            <article className="card stat" key={result.label}>
              <p className="stat-value">{result.value}</p>
              <p>{result.label}</p>
            </article>
          ))}
        </div>
        <p className="centered"><Source id="scorecard" label={copy.resultsSource} /></p>
      </section>
    </>
  );
}

function WhyPage({ t }: PageProps) {
  return (
    <>
      <header className="page-hero">
        <h1><span className="grad">{t("whyTitle")}</span></h1>
        <p className="lead">{t("whyLead")}</p>
        <Source id="cpr" />
      </header>
      <div className="grid-4">
        {STATS.map(({ value, label, note, source }) => (
          <article className="card stat" key={label}>
            <p className="stat-value">{value}</p>
            <p>{t(label)}</p>
            {note && <p className="stat-note">{t(note)}</p>}
            <Source id={source} />
          </article>
        ))}
      </div>
      <p className="mono centered">{t("whyNote")}</p>
    </>
  );
}

function AboutPage({ lang, t }: PageProps) {
  const copy = siteCopy[lang].about;
  const icons: IconName[] = ["list", "shield", "siren", "info"];
  return (
    <>
      <section className="split">
        <div className="card about-text">
          <h1><span className="grad">{t("aboutTitle")}</span></h1>
          <p>{t("aboutBody1")}</p>
          <p>{t("aboutBody2")}</p>
        </div>
        <div className="card about-know">
          <h2>{t("aboutKnowTitle")}</h2>
          <ul>
            <li>{t("aboutKnow1")}</li>
            <li>{t("aboutKnow2")} <Source id="emergency" /></li>
            <li>{t("aboutKnow3")}</li>
            <li>{t("aboutKnow4")}</li>
          </ul>
        </div>
      </section>
      <section className="section">
        <h2 className="section-title">{copy.safetyTitle}</h2>
        <div className="grid-2">
          {copy.safety.map((card, index) => (
            <article className="card feature" key={card.title}>
              <Tile icon={icons[index]!} tone="sky" />
              <div><h3>{card.title}</h3><p>{card.body}</p></div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

const CONTENT: Record<PageId, (props: PageProps) => ReactNode> = {
  home: HomePage, sos: SosPage, care: CarePage, hospital: HospitalPage, voice: VoicePage, why: WhyPage, about: AboutPage,
};

export function Site(props: Props) {
  const { path, lang, t, navigate, onLang, onSos } = props;
  const copy = siteCopy[lang];
  const page = PAGES.find((item) => item.path === path) ?? PAGES[0]!;
  const [heroSosVisible, setHeroSosVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  // On Home the big SOS button is in view at first; every other page keeps SOS within reach.
  const showNavSos = page.id !== "home" || !heroSosVisible;
  const Content = CONTENT[page.id];

  useEffect(() => {
    document.title = page.id === "home" ? "Ayu" : `${copy.nav[page.id]} · Ayu`;
    setMenuOpen(false);
    if (page.id !== "home") setHeroSosVisible(true);
  }, [page.id, copy]);

  const go = (to: SitePath) => {
    setMenuOpen(false);
    navigate(to);
  };

  return (
    <div className="site">
      <div className="site-top">
        <header className="topbar">
          <PageLink to="/" navigate={go} className="brand" label="Ayu">
            <Tile icon="logo" tone="indigo" />
            <span className="wordmark">{t("brand")}</span>
          </PageLink>
          <nav className="site-links" aria-label={t("navLabel")}>
            {PAGES.filter((item) => item.id !== "home").map((item) => (
              <PageLink key={item.id} to={item.path} navigate={go} current={item.id === page.id}>{copy.nav[item.id]}</PageLink>
            ))}
          </nav>
          <div className="topbar-end">
            <LanguageToggle lang={lang} onChange={onLang} label={t("chooseLanguage")} />
            {showNavSos && <button className="nav-sos" onClick={onSos}>{t("sos")}</button>}
            <button className="menu-button" aria-expanded={menuOpen} aria-controls="site-menu" aria-label={copy.menu} onClick={() => setMenuOpen(!menuOpen)}>
              <Icon name={menuOpen ? "close" : "menu"} />
            </button>
          </div>
        </header>
        {menuOpen && (
          <nav id="site-menu" className="menu-panel" aria-label={t("navLabel")}>
            {PAGES.map((item) => (
              <PageLink key={item.id} to={item.path} navigate={go} current={item.id === page.id}>
                <Tile icon={item.icon} tone={item.tone} /> {copy.nav[item.id]}
              </PageLink>
            ))}
          </nav>
        )}
      </div>

      <main className={`site-main page-${page.id}`}>
        <Content {...props} onSosVisible={setHeroSosVisible} />
      </main>

      {showNavSos && <button className="fab-sos" onClick={onSos}>{t("sos")}</button>}

      <footer className="site-footer">
        <div className="footer-links">
          {PAGES.map((item) => <PageLink key={item.id} to={item.path} navigate={go}>{copy.nav[item.id]}</PageLink>)}
        </div>
        <a className="call-link" href="tel:112">{t("call112")}</a>
        <p className="mono">{t("disclaimer")}</p>
        <p className="mono footer-mark">© 2026 Ayu · {copy.builtOn}</p>
      </footer>
    </div>
  );
}
