import { useState, type FormEvent } from "react";
import type { Case } from "../../../../server/src/types/case";
import type { StringKey } from "../i18n/strings";

export type MedicalId = NonNullable<Case["medicalId"]>;

const FIELDS: { key: keyof MedicalId; label: StringKey }[] = [
  { key: "allergies", label: "medicalAllergies" },
  { key: "conditions", label: "medicalConditions" },
  { key: "medicines", label: "medicalMedicines" },
];

interface Props {
  t: (key: StringKey) => string;
  value: MedicalId | null;
  onSave(value: MedicalId | null): void;
  onBack(): void;
}

export function MedicalIdPage({ t, value, onSave, onBack }: Props) {
  const [draft, setDraft] = useState<MedicalId>(value ?? {});

  const save = (event: FormEvent) => {
    event.preventDefault();
    const filled = Object.fromEntries(Object.entries(draft).map(([key, text]) => [key, text.trim()]).filter(([, text]) => text));
    onSave(Object.keys(filled).length ? filled : null);
    onBack();
  };

  const clear = () => {
    onSave(null);
    onBack();
  };

  return (
    <div className="paper">
      <main className="screen">
        <div className="topbar">
          <button className="button plain small" onClick={onBack}>{t("back")}</button>
          <span className="wordmark">{t("brand")}</span>
        </div>
        <section className="card medical">
          <h2>{t("medicalTitle")}</h2>
          <p>{t("medicalIntro")}</p>
          <form onSubmit={save}>
            {FIELDS.map(({ key, label }) => (
              <label key={key}>
                {t(label)}
                <input
                  maxLength={200}
                  value={draft[key] ?? ""}
                  onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                />
              </label>
            ))}
            <button className="button ink">{t("medicalSave")}</button>
          </form>
          {value && <button className="button plain small" onClick={clear}>{t("medicalClear")}</button>}
        </section>
      </main>
    </div>
  );
}
