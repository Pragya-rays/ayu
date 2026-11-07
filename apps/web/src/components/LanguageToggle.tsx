import type { Lang } from "../../../../server/src/types/voice";

const LANGS: { id: Lang; label: string }[] = [
  { id: "hi", label: "हिन्दी" },
  { id: "hinglish", label: "Hinglish" },
  { id: "en", label: "English" },
];

export function LanguageToggle({ lang, onChange, label }: { lang: Lang; onChange(lang: Lang): void; label: string }) {
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
