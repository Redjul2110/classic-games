// src/pages/hub.js
// Game Hub - Homepage with 10 games grid, emoji icons, VS AI buttons, ? help

import { GAMES } from '../config.js';
import { getDisplayName, getAvatarInitial, isGuest, signOut } from '../auth.js';
import { UI_ICONS, getGameIcon } from '../ui/icons.js';
import { renderNavbar } from '../ui/navbar.js';
import { showToast } from '../ui/toast.js';
import { GAME_HELP } from '../games/gameHelp.js';

export function renderHubPage(container, onGameSelect, onGameAI, onProfileClick, onChatClick) {
  container.innerHTML = `
    <div style="min-height:100vh; display:flex; flex-direction:column;" class="with-sidebar-toggle">
      <div id="hub-navbar"></div>

      <div class="hub-header">
        <h1 class="hub-title">Game Library</h1>
        <p class="hub-subtitle">Choose your battle — multiplayer or vs AI</p>
      </div>

      <div class="games-grid">
        ${GAMES.map(game => buildGameCard(game)).join('')}
      </div>
    </div>
  `;

  // Render navbar
  renderNavbar(
    container.querySelector('#hub-navbar'),
    {
      onProfileClick,
      onChatClick,
      onSignOut: async () => { await signOut(); showToast('Signed out.', 'info'); },
    }
  );

  // Multiplayer play buttons
  container.querySelectorAll('.play-btn-multi').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const gameId = btn.dataset.gameId;
      const game = GAMES.find(g => g.id === gameId);
      if (game) onGameSelect(game);
    });
  });

  // VS AI buttons
  container.querySelectorAll('.play-btn-ai').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const gameId = btn.dataset.gameId;
      const game = GAMES.find(g => g.id === gameId);
      if (game) onGameAI(game);
    });
  });

  // ? Help buttons
  container.querySelectorAll('.game-help-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const gameId = btn.dataset.gameId;
      const game = GAMES.find(g => g.id === gameId);
      if (game) showHelpModal(game);
    });
  });
}

function buildGameCard(game) {
  const iconEl = getGameIcon(game.id, 52, game.color);
  return `
    <div class="game-card" role="article" aria-label="${game.name}">
      <div class="game-card-header">
        <div class="game-card-icon-wrap">${iconEl}</div>
        <div class="game-card-actions">
          <button class="game-help-btn" data-game-id="${game.id}" title="How to play ${game.name}" aria-label="Help for ${game.name}">
            ${UI_ICONS.question}
          </button>
        </div>
      </div>
      <div>
        <div class="game-name">${game.name}</div>
        <div class="game-description">${game.description}</div>
      </div>
      <div class="game-meta">
        <span class="game-players">👥 ${game.minPlayers}–${game.maxPlayers} players</span>
      </div>
      <div class="game-card-btns">
        <button class="play-btn-multi" data-game-id="${game.id}">
          ${UI_ICONS.play} Multiplayer
        </button>
        <button class="play-btn-ai" data-game-id="${game.id}">
          ${UI_ICONS.robot} VS AI
        </button>
      </div>
    </div>
  `;
}

// ─── Help Modal ───
function showHelpModal(game) {
  const help = GAME_HELP[game.id];
  if (!help) return;

  // Remove existing
  document.getElementById('help-modal-overlay')?.remove();

  const iconEl = getGameIcon(game.id, 44, game.color);
  const overlay = document.createElement('div');
  overlay.id = 'help-modal-overlay';
  overlay.className = 'help-modal-overlay';
  overlay.innerHTML = `
    <div class="help-modal" role="dialog" aria-label="${game.name} rules" aria-modal="true">
      <div class="help-modal-header">
        <div class="help-modal-icon">${iconEl}</div>
        <div>
          <div class="help-modal-title">${game.name}</div>
          <div class="help-modal-sub">${help.tagline}</div>
        </div>
        <button class="help-modal-close" id="help-modal-close" title="Close" aria-label="Close help">${UI_ICONS.close}</button>
      </div>

      <div class="help-modal-body">
        <div class="help-section">
          <div class="help-section-title">[HIT] Objective</div>
          <p>${help.objective}</p>
        </div>

        <div class="help-section">
          <div class="help-section-title">📖 How to Play</div>
          <ul class="help-rules-list">
            ${help.rules.map(r => `<li>${r}</li>`).join('')}
          </ul>
        </div>

        ${help.tip ? `
        <div class="help-tip">
          <span class="help-tip-icon">💡</span>
          <p>${help.tip}</p>
        </div>` : ''}

        ${help.aiInfo ? `
        <div class="help-section" style="margin-top:20px;">
          <div class="help-section-title">[AI] VS AI Mode</div>
          <p>${help.aiInfo}</p>
        </div>` : ''}
      </div>

      <div class="help-modal-footer">
        <button class="btn btn-primary" style="flex:1;" id="help-play-multi">Multiplayer</button>
        <button class="btn btn-secondary" style="flex:1;" id="help-play-ai">VS AI</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Close
  const close = () => overlay.remove();
  overlay.querySelector('#help-modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  // Play buttons in footer - dispatch to parent
  overlay.querySelector('#help-play-multi').addEventListener('click', () => {
    close();
    // Trigger multiplayer for this game via hub buttons
    document.querySelector(`.play-btn-multi[data-game-id="${game.id}"]`)?.click();
  });
  overlay.querySelector('#help-play-ai').addEventListener('click', () => {
    close();
    document.querySelector(`.play-btn-ai[data-game-id="${game.id}"]`)?.click();
  });
}
