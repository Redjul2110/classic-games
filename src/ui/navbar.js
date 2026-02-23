// src/ui/navbar.js — uses plain text icons

import { getDisplayName, getAvatarInitial, isGuest } from '../auth.js';

export function renderNavbar(container, { onProfileClick, onChatClick, onSignOut }) {
  const name = getDisplayName() || 'Player';
  const init = getAvatarInitial() || '?';
  const guest = isGuest();

  container.innerHTML = `
    <nav class="navbar">
      <div class="navbar-brand" style="padding-left:44px">
        <span class="brand-red">RedJGames</span>
        <span class="brand-classic">CLASSIC</span>
      </div>
      <div class="navbar-actions">
        <span class="badge ${guest ? 'badge-guest' : 'badge-user'}">${guest ? 'Guest' : name}</span>
        <button class="btn btn-ghost btn-sm" id="nav-chat-btn" title="Chat">✉ Chat</button>
        <div class="nav-avatar" id="nav-avatar-btn" title="Profile" role="button" tabindex="0">${init}</div>
        <button class="btn btn-ghost btn-sm" id="nav-signout-btn">↩ Out</button>
      </div>
    </nav>
  `;

  container.querySelector('#nav-chat-btn').addEventListener('click', onChatClick);
  container.querySelector('#nav-avatar-btn').addEventListener('click', onProfileClick);
  container.querySelector('#nav-signout-btn').addEventListener('click', onSignOut);
}
