// Inline SVG icons, stroke-based so they follow currentColor.
const s = (body, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  runway: s('<rect x="7" y="2.5" width="10" height="19" rx="1.5"/><path d="M12 6v2.5M12 11v2.5M12 16v2.5"/>'),
  taxiway: s('<path d="M4 20V12a4 4 0 0 1 4-4h12"/><path d="M4 16v-1M4 12.5v0M11 8h1.5M16 8h1.5" stroke-dasharray="0"/>'),
  stand: s('<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M12 20.5V9"/><path d="M8.5 7h7"/>'),
  gate: s('<rect x="3.5" y="9" width="17" height="11.5" rx="2.2"/><path d="M12 20.5V13"/><path d="M5 9V5.5h5V9"/><path d="M10 5.5h3.5l2 3.5"/>'),
  terminal: s('<path d="M3 20.5h18"/><path d="M4.5 20.5V10l7.5-4 7.5 4v10.5"/><path d="M9 20.5v-5h6v5"/><path d="M8 11.5h8"/>'),
  checkin: s('<rect x="3" y="12" width="18" height="8.5" rx="1.6"/><path d="M8 12V8.5a4 4 0 0 1 8 0V12"/><path d="M7 16h4"/>'),
  security: s('<path d="M5 21V7a7 7 0 0 1 14 0v14"/><path d="M9 21V9.5a3 3 0 0 1 6 0V21"/>'),
  lounge: s('<path d="M4 13v-2.5a2 2 0 0 1 4 0V13"/><path d="M3 13h18v3.5H3z"/><path d="M5 16.5V20M19 16.5V20"/><path d="M16 13v-2.5a2 2 0 0 1 4 0"/><path d="M8 13h8"/>'),
  bulldoze: s('<path d="M3 17h11l3-6h-6l-1.5 3H3z"/><circle cx="6.5" cy="19" r="1.6"/><circle cx="12" cy="19" r="1.6"/><path d="M17 11l4 1.5V17h-3"/>'),
  pause: s('<path d="M9 5v14M15 5v14"/>'),
  play: s('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),
  radar: s('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6.5-6.5"/><circle cx="16" cy="9" r="0.9" fill="currentColor"/>'),
  menu: s('<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>'),
  plane: s('<path d="M21 15.5l-8-4.5V5.2a1.6 1.6 0 0 0-3.2 0V11l-7.8 4.5v2l7.8-2.2v3.7L7.5 20.5V22l4.1-1 4.1 1v-1.5l-2.3-1.5v-3.7L21 17.5z" fill="currentColor" stroke="none"/>', '0 0 24 24'),
  board: s('<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 9.5h18M8 4.5v15"/>'),
  contract: s('<path d="M6 3.5h9l3.5 3.5v13.5H6z"/><path d="M15 3.5V7h3.5M9 12h6M9 15.5h6"/>'),
  close: s('<path d="M6 6l12 12M18 6L6 18"/>'),
  grip: s('<circle cx="9" cy="7" r="1" fill="currentColor"/><circle cx="15" cy="7" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="17" r="1" fill="currentColor"/><circle cx="15" cy="17" r="1" fill="currentColor"/>'),
  rotate: s('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4.5h-4.5"/>'),
  fuel: s('<path d="M5 20.5V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 14 5v15.5"/><path d="M3.5 20.5h12"/><path d="M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3"/><path d="M7.5 7.5h4"/>'),
  people: s('<circle cx="9" cy="7.5" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="8.5" r="2.4"/><path d="M15.5 13.6A4.6 4.6 0 0 1 21 18"/>'),
  coin: s('<circle cx="12" cy="12" r="8.5"/><path d="M14.5 8.8a3 3 0 0 0-5 1.7v5.6M8.5 13h4.5M8.5 16.1h6.5"/>'),
  clock: s('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
};

export function star(fillPct = 100, size = 18) {
  const id = 'g' + Math.random().toString(36).slice(2, 8);
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="${id}"><stop offset="${fillPct}%" stop-color="currentColor"/><stop offset="${fillPct}%" stop-color="currentColor" stop-opacity="0.18"/></linearGradient></defs><path d="M12 2.8l2.75 5.6 6.15.9-4.45 4.33 1.05 6.12L12 16.87l-5.5 2.88 1.05-6.12L3.1 9.3l6.15-.9z" fill="url(#${id})"/></svg>`;
}
