// src/pages/matchmaking.js
// Matchmaking Page - host/join public/private lobbies

import { GAMES, APP_CONFIG } from '../config.js';
import {
  createLobby, joinPublicLobby, joinPrivateLobby, leaveLobby
} from '../lobby.js';
import { renderNavbar } from '../ui/navbar.js';
import { showToast } from '../ui/toast.js';

export function renderMatchmakingPage(container, game, {
  onBack, onLobbyJoined, onProfileClick, onChatClick, onSignOut
}) {
  const maxPlayers = game.maxPlayers;
  let selectedCount = Math.min(2, maxPlayers);

  function render() {
    container.innerHTML = `
      <div class="matchmaking-page">
        <div id="mm-navbar"></div>
        <div class="matchmaking-content">
          <button class="btn btn-ghost btn-sm mb-2" id="back-btn">← Back to Games</button>
          <h1 class="matchmaking-title">Find a Match</h1>
          <div class="matchmaking-game-badge">
            <span>${game.icon}</span> ${game.name}
          </div>

          <div id="mm-status-banner" class="hidden"></div>

          <div class="mm-options">
            <div class="mm-option-card" id="host-public-btn" role="button" tabindex="0">
              <div class="mm-option-icon">🌐</div>
              <div class="mm-option-title">Host Public</div>
              <div class="mm-option-desc">Open lobby – anyone can join</div>
            </div>
            <div class="mm-option-card" id="host-private-btn" role="button" tabindex="0">
              <div class="mm-option-icon">🔒</div>
              <div class="mm-option-title">Host Private</div>
              <div class="mm-option-desc">Share a code with friends</div>
            </div>
            <div class="mm-option-card" id="join-random-btn" role="button" tabindex="0">
              <div class="mm-option-icon">🎲</div>
              <div class="mm-option-title">Join Random</div>
              <div class="mm-option-desc">Jump into a public lobby</div>
            </div>
            <div class="mm-option-card" id="join-private-btn" role="button" tabindex="0">
              <div class="mm-option-icon">🔑</div>
              <div class="mm-option-title">Join Private</div>
              <div class="mm-option-desc">Enter a lobby code</div>
            </div>
          </div>

          <div id="join-code-section" class="hidden card">
            <div class="player-count-label" style="margin-bottom:12px">Enter Lobby Code</div>
            <div class="join-code-form">
              <input type="text" class="lobby-code-input" id="lobby-code-input"
                placeholder="XXXXX" maxlength="5" autocomplete="off" />
              <button class="btn btn-secondary" id="submit-code-btn">Join</button>
            </div>
          </div>
        </div>
      </div>
    `;

    renderNavbar(container.querySelector('#mm-navbar'), { onProfileClick, onChatClick, onSignOut });

    // Back button
    container.querySelector('#back-btn').addEventListener('click', onBack);

    // Host Public
    container.querySelector('#host-public-btn').addEventListener('click', async () => {
      setLoading(true, '🌐 Creating public lobby…');
      try {
        const lobby = await createLobby(game.id, selectedCount, true);
        showToast('Public lobby created!', 'success');
        onLobbyJoined(lobby, game, true);
      } catch (err) {
        showToast('Failed to create lobby: ' + err.message, 'error');
      } finally { setLoading(false); }
    });

    // Host Private
    container.querySelector('#host-private-btn').addEventListener('click', async () => {
      setLoading(true, '🔒 Creating private lobby…');
      try {
        const lobby = await createLobby(game.id, selectedCount, false);
        showToast(`Private lobby created! Code: ${lobby.lobby_code}`, 'success');
        onLobbyJoined(lobby, game, true);
      } catch (err) {
        showToast('Failed to create lobby: ' + err.message, 'error');
      } finally { setLoading(false); }
    });

    // Join Random
    container.querySelector('#join-random-btn').addEventListener('click', async () => {
      setLoading(true, '🎲 Searching for a public lobby…');
      try {
        const lobby = await joinPublicLobby(game.id);
        if (lobby) {
          showToast('Found a lobby!', 'success');
          onLobbyJoined(lobby, game, false);
        } else {
          showToast('No public lobbies found. Host one!', 'info');
        }
      } catch (err) {
        showToast('Search failed: ' + err.message, 'error');
      } finally { setLoading(false); }
    });

    // Join Private - show code input
    container.querySelector('#join-private-btn').addEventListener('click', () => {
      const section = container.querySelector('#join-code-section');
      section.classList.toggle('hidden');
      if (!section.classList.contains('hidden')) {
        section.querySelector('#lobby-code-input').focus();
      }
    });

    // Submit private code
    container.querySelector('#submit-code-btn').addEventListener('click', async () => {
      const code = container.querySelector('#lobby-code-input').value.trim().toUpperCase();
      if (code.length !== 5) {
        showToast('Lobby code must be 5 characters.', 'error');
        return;
      }
      setLoading(true, `🔑 Joining lobby ${code}…`);
      try {
        const lobby = await joinPrivateLobby(code);
        showToast('Joined private lobby!', 'success');
        onLobbyJoined(lobby, game, false);
      } catch (err) {
        showToast('Could not join: ' + err.message, 'error');
      } finally { setLoading(false); }
    });

    // Enter key for code input
    container.querySelector('#lobby-code-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') container.querySelector('#submit-code-btn').click();
    });
  }

  function setLoading(loading, message = '') {
    const banner = container.querySelector('#mm-status-banner');
    if (loading) {
      banner.innerHTML = `
        <div class="status-banner searching">
          <span class="status-icon">⏳</span>
          <span class="status-text"><strong>${message}</strong></span>
        </div>`;
      banner.classList.remove('hidden');
      container.querySelectorAll('.mm-option-card').forEach(c => {
        c.style.opacity = '0.5'; c.style.pointerEvents = 'none';
      });
    } else {
      banner.classList.add('hidden');
      banner.innerHTML = '';
      container.querySelectorAll('.mm-option-card').forEach(c => {
        c.style.opacity = ''; c.style.pointerEvents = '';
      });
    }
  }

  render();
}
