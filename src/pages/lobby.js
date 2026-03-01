// src/pages/lobby.js
// In-Lobby "Ready" screen - shows players, lobby code, wait for game start

import { subscribeLobby, stopRealtimeSubscription, leaveLobby } from '../lobby.js';
import { getUserId, getDisplayName } from '../auth.js';
import { renderNavbar } from '../ui/navbar.js';
import { showToast } from '../ui/toast.js';
import { ogClient } from '../supabase.js';

let unsubscribe = null;

export function renderLobbyPage(container, lobby, game, isHost, {
  onBack, onGameStart, onProfileClick, onChatClick, onSignOut
}) {
  let currentLobby = { ...lobby };

  function render() {
    const players = currentLobby.players || [];
    const maxPlayers = currentLobby.max_players || 2;
    const code = currentLobby.lobby_code;
    const myId = getUserId();

    container.innerHTML = `
      <div class="lobby-ready-page">
        <div id="lobby-navbar"></div>
        <div class="lobby-content">
          <button class="btn btn-ghost btn-sm mb-2" id="leave-btn">← Leave Lobby</button>
          <div class="lobby-header-section">
            <h1 style="font-size:1.8rem; font-weight:800;">${game.icon} ${game.name}</h1>
            <p style="color:var(--text-secondary); margin-top:6px;">
              ${isHost ? 'You are the host. Start when ready!' : 'Waiting for host to start…'}
            </p>
            ${code ? `
            <div class="lobby-code-display">
              <span style="color:var(--text-muted); font-size:0.8rem; font-weight:600;">LOBBY CODE</span>
              <span class="lobby-code-value">${code}</span>
              <button class="copy-btn" id="copy-code-btn" title="Copy code">📋</button>
            </div>` : ''}
          </div>

          <div class="players-grid">
            <div class="players-list-header" style="grid-column: 1 / -1;">
              <span class="players-list-title"><i data-lucide="users"></i> Players</span>
              <span class="players-count">${players.length} / ${maxPlayers}</span>
            </div>
            ${players.map((p, i) => `
              <div class="player-card ${p.id === myId ? 'is-self' : ''}">
                <div class="player-avatar-lg">${(p.name || 'P').charAt(0).toUpperCase()}</div>
                <div class="player-info">
                  <span class="player-name">${p.name || 'Player'}</span>
                  <div class="player-tags">
                    ${i === 0 ? '<span class="badge badge-host">HOST</span>' : ''}
                    ${p.id === myId ? '<span class="badge badge-user">YOU</span>' : '<span class="badge badge-guest">PLAYER</span>'}
                  </div>
                </div>
                ${isHost && i !== 0 ? `<button class="btn btn-ghost btn-sm kick-btn" data-id="${p.id}" title="Kick Player"><i data-lucide="user-x"></i></button>` : ''}
              </div>
            `).join('')}
            ${Array.from({ length: maxPlayers - players.length }, (_, i) => `
              <div class="player-card empty-slot">
                <div class="slot-ring"><i data-lucide="user-plus"></i></div>
                <span class="slot-text">Waiting...</span>
              </div>
            `).join('')}
          </div>

          <div class="lobby-actions">
            ${isHost ? `
              <button class="btn start-btn btn-lg"
                id="start-btn"
                ${players.length < 2 ? 'disabled' : ''}>
                ${players.length < 2 ? 'Waiting for Players…' : '▶ Start Game'}
              </button>
            ` : `
              <div class="status-banner">
                <span class="status-icon searching-pulse">⏳</span>
                <span class="status-text">Waiting for host to start the game…</span>
              </div>
            `}
            <button class="btn btn-danger" id="leave-lobby-btn">Leave</button>
          </div>
        </div>
      </div>
    `;

    renderNavbar(container.querySelector('#lobby-navbar'), { onProfileClick, onChatClick, onSignOut });

    // Leave handlers
    [container.querySelector('#leave-btn'), container.querySelector('#leave-lobby-btn')].forEach(btn => {
      btn?.addEventListener('click', async () => {
        stopRealtimeSubscription();
        await leaveLobby(currentLobby.id);
        showToast('Left the lobby.', 'info');
        onBack();
      });
    });

    // Copy code
    container.querySelector('#copy-code-btn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(code).then(() => showToast('Lobby code copied!', 'success'));
    });

    // Kick handler
    if (isHost) {
      container.querySelectorAll('.kick-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const targetId = e.target.dataset.id;
          const newPlayers = currentLobby.players.filter(p => p.id !== targetId);
          try {
            await ogClient.from('game_sessions').update({ players: newPlayers }).eq('id', currentLobby.id);
            showToast('Player kicked.', 'info');
          } catch (err) {
            showToast('Failed to kick player.', 'error');
          }
        });
      });
    }

    // Start game (host only)
    container.querySelector('#start-btn')?.addEventListener('click', () => {
      stopRealtimeSubscription();
      onGameStart(currentLobby, game);
    });

    if (window.lucide) {
      setTimeout(() => lucide.createIcons({ root: container }), 10);
    }
  }

  // Initial render
  render();

  // Subscribe to realtime updates
  subscribeLobby(lobby.id, (update) => {
    if (update.deleted) {
      showToast('The lobby was closed by the host.', 'error');
      stopRealtimeSubscription();
      onBack();
      return;
    }

    // Host clicked Start → status changes to 'playing'
    if (update.status === 'playing') {
      showToast('Game is starting! [GAME]', 'success');
      stopRealtimeSubscription();
      onGameStart(update, game);
      return;
    }

    // Check if we were kicked (our ID is no longer in the players list, and we are not host)
    const activeIds = update.players ? update.players.map(p => p.id) : [];
    if (!isHost && !activeIds.includes(getUserId())) {
      showToast('You were removed from the lobby.', 'error');
      stopRealtimeSubscription();
      onBack();
      return;
    }

    currentLobby = { ...currentLobby, ...update };
    render();
    // Re-attach navbar after re-render
    renderNavbar(container.querySelector('#lobby-navbar'), { onProfileClick, onChatClick, onSignOut });
  });
}
