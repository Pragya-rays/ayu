// Simple line icons, drawn for Ayu. Decorative: the text beside each one carries the meaning.
const PATHS = {
  siren: "M7 18v-6a5 5 0 0 1 10 0v6 M5 21h14 M12 3v1 M4.2 6.2l.7.7 M19.8 6.2l-.7.7 M3 12h1 M20 12h1",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  hospital: "M4 21V7l8-4 8 4v14 M9 21v-5h6v5 M12 8v5 M9.5 10.5h5",
  wave: "M3 12h2 M7 8v8 M11 5v14 M15 9v6 M19 11v2 M21 12h0",
  chart: "M4 20V10 M10 20V4 M16 20v-7 M3 20h18",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8h.01",
  pin: "M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z M12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  pulse: "M3 12h4l2-5 4 10 2-5h6",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z M19 11a7 7 0 0 1-14 0 M12 18v3",
  speaker: "M4 10v4h4l5 4V6l-5 4H4z M16 9a4 4 0 0 1 0 6 M18.5 6.5a7.5 7.5 0 0 1 0 11",
  shield: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z M9 12l2 2 4-4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2",
  list: "M9 6h11 M9 12h11 M9 18h11 M4 6h.01 M4 12h.01 M4 18h.01",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z",
  wifi: "M2 9a15 15 0 0 1 20 0 M5 12.5a10 10 0 0 1 14 0 M8.5 16a5 5 0 0 1 7 0 M12 19.5h.01",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  menu: "M4 7h16 M4 12h16 M4 17h16",
  close: "M6 6l12 12 M18 6L6 18",
  logo: "M12 3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M12 8v4 M6 16a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M18 16a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M6 16v-2h12v2",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
