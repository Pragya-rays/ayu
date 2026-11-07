/** Faint glows and outline shapes behind every page. The glass panes show them through. */
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <span className="glow glow-indigo" />
      <span className="glow glow-violet" />
      <span className="glow glow-pink" />
      <svg className="shapes" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none">
        <g stroke="currentColor" strokeWidth="1.2">
          <path d="M205 84 L332 157 L332 303 L205 376 L78 303 L78 157 Z" />
          <path d="M132 560 L180 588 L180 644 L132 672 L84 644 L84 588 Z" />
          <path d="M718 352 L762 377 L762 428 L718 453 L674 428 L674 377 Z" />
          <circle cx="1195" cy="360" r="118" />
          <circle cx="1178" cy="634" r="38" />
          <path d="M1276 732 L1318 812 L1228 806 Z" />
          <rect x="146" y="442" width="138" height="96" rx="20" />
          <path d="M310 780 L332 758 L354 780 L332 802 Z" />
          <path d="M0 640 H96 L122 586 L156 702 L188 640 H244 L262 614 L280 640 H420" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    </div>
  );
}
