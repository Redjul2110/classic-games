// src/ui/icons.js — ALL plain unicode/text icons, no SVGs, no emoji

// ─── Game letter badges ───
const GAME_ABBR = {
  chess: 'CH',
  checkers: 'DM',
  tictactoe: 'TTT',
  connectfour: 'C4',
  battleship: 'BS',
  minesweeper: 'MS',
  wordguess: 'WG',
  rockpaperscissors: 'RPS',
  trivia: 'TQ',
};

export function getGameIcon(gameId, size = 52, color = '#c0392b') {
  const abbr = GAME_ABBR[gameId] || '??';
  const fontSize = abbr.length >= 3 ? Math.round(size * 0.28) : Math.round(size * 0.35);
  return `<div style="
    width:${size}px;height:${size}px;
    background:${color};
    border-radius:10px;
    display:flex;align-items:center;justify-content:center;
    font-family:'Rajdhani','Outfit',sans-serif;
    font-weight:900;font-size:${fontSize}px;
    color:#fff;letter-spacing:0.5px;flex-shrink:0;user-select:none;
  ">${abbr}</div>`;
}

// Backward compat proxy
export const GAME_ICONS = new Proxy({}, {
  get: (_, id) => getGameIcon(id, 52, '#c0392b'),
});

// ─── ALL UI icons as Lucide SVGs ───
// Used everywhere: navbar, sidebar, buttons, modals
// Make sure to call lucide.createIcons() after injecting these into DOM
export const UI_ICONS = {
  home: '<i data-lucide="home"></i>',
  games: '<i data-lucide="gamepad-2"></i>',
  chat: '<i data-lucide="message-square"></i>',
  profile: '<i data-lucide="user"></i>',
  settings: '<i data-lucide="settings"></i>',
  signout: '<i data-lucide="log-out"></i>',
  robot: '<i data-lucide="bot"></i>',    // used for VS AI buttons
  question: '<i data-lucide="help-circle"></i>',
  play: '<i data-lucide="play"></i>',
  close: '<i data-lucide="x"></i>',
  menu: '<i data-lucide="menu"></i>',
  chevron: '<i data-lucide="chevron-right"></i>',
  info: '<i data-lucide="info"></i>',
  party: '<i data-lucide="party-popper"></i>',
  back: '<i data-lucide="arrow-left"></i>',
  check: '<i data-lucide="check"></i>',
  star: '<i data-lucide="star"></i>',
  lock: '<i data-lucide="lock"></i>',
  globe: '<i data-lucide="globe"></i>',
};
