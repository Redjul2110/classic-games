// src/ui/sidebar.js — fixed hamburger using plain text ☰

import { getDisplayName, getAvatarInitial, isGuest } from '../auth.js';
import { UI_ICONS } from './icons.js';

let sidebarEl = null;
let overlayEl = null;
let toggleBtn = null;
let isOpen = false;
let _navigateFn = null;
let _signOutFn = null;

export function initSidebar(navigateFn, onSignOutFn) {
  // Destroy old instance first so re-init works after sign-out
  destroySidebar();

  _navigateFn = navigateFn;
  _signOutFn = onSignOutFn;

  // Sidebar panel
  sidebarEl = document.createElement('div');
  sidebarEl.id = 'sidebar-root';
  sidebarEl.className = 'sidebar';
  sidebarEl.innerHTML = buildSidebarHTML();
  document.body.appendChild(sidebarEl);

  if (window.lucide) {
    setTimeout(() => lucide.createIcons({ root: sidebarEl }), 10);
  }

  // Dark overlay
  overlayEl = document.createElement('div');
  overlayEl.id = 'sidebar-overlay';
  overlayEl.className = 'sidebar-overlay';
  document.body.appendChild(overlayEl);

  // ─── Hamburger toggle button ───
  // Uses plain text "☰" so it always renders without icon loading issues
  toggleBtn = document.createElement('button');
  toggleBtn.id = 'sidebar-toggle';
  toggleBtn.setAttribute('aria-label', 'Open menu');
  toggleBtn.setAttribute('title', 'Menu');
  toggleBtn.style.cssText = `
        position: fixed;
        top: 12px;
        left: 14px;
        z-index: 700;
        width: 36px;
        height: 36px;
        background: rgba(18, 18, 18, 0.92);
        border: 1px solid rgba(192,57,43,0.35);
        border-radius: 8px;
        color: #f0f0f0;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(10px);
        transition: background 0.2s, border-color 0.2s;
    `;
  toggleBtn.textContent = '☰';
  toggleBtn.addEventListener('mouseenter', () => toggleBtn.style.borderColor = 'rgba(192,57,43,0.8)');
  toggleBtn.addEventListener('mouseleave', () => toggleBtn.style.borderColor = 'rgba(192,57,43,0.35)');
  document.body.appendChild(toggleBtn);

  // Events
  toggleBtn.addEventListener('click', toggleSidebar);
  overlayEl.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) closeSidebar(); });

  // Nav links
  bindNavLinks();
}

function bindNavLinks() {
  sidebarEl.querySelector('#sb-home')?.addEventListener('click', () => { closeSidebar(); _navigateFn?.('hub'); });
  sidebarEl.querySelector('#sb-chat')?.addEventListener('click', () => { closeSidebar(); _navigateFn?.('chat'); });
  sidebarEl.querySelector('#sb-party')?.addEventListener('click', () => { closeSidebar(); _navigateFn?.('party'); });
  sidebarEl.querySelector('#sb-profile')?.addEventListener('click', () => { closeSidebar(); _navigateFn?.('profile'); });
  sidebarEl.querySelector('#sb-settings')?.addEventListener('click', () => { closeSidebar(); _navigateFn?.('settings'); });
  sidebarEl.querySelector('#sb-signout')?.addEventListener('click', () => { closeSidebar(); _signOutFn?.(); });
  sidebarEl.querySelector('#sidebar-close')?.addEventListener('click', closeSidebar);
}

function buildSidebarHTML() {
  const name = getDisplayName() || 'Player';
  const init = getAvatarInitial() || '?';
  const guest = isGuest();
  return `
    <div class="sidebar-header">
      <div class="sidebar-brand">
        <span style="color:var(--red-primary)">RedJGames</span>
      </div>
      <button class="sidebar-close-btn" id="sidebar-close" title="Close">${UI_ICONS.close}</button>
    </div>

    <div class="sidebar-user">
      <div class="sidebar-avatar">${init}</div>
      <div class="sidebar-user-info">
        <div class="sidebar-username">${name}</div>
        <div class="sidebar-user-tag ${guest ? 'guest' : 'member'}">${guest ? 'Guest' : 'Member'}</div>
      </div>
    </div>

    <div class="sidebar-divider"></div>

    <nav class="sidebar-nav">
      <button class="sidebar-nav-item" id="sb-home">
        <span class="sb-icon">${UI_ICONS.home}</span>
        <span class="sb-label">Home</span>
        <span class="sb-arrow">${UI_ICONS.chevron}</span>
      </button>
      <button class="sidebar-nav-item" id="sb-chat">
        <span class="sb-icon">${UI_ICONS.chat}</span>
        <span class="sb-label">Community Chat</span>
        <span class="sb-arrow">${UI_ICONS.chevron}</span>
      </button>
      <button class="sidebar-nav-item" id="sb-party">
        <span class="sb-icon">${UI_ICONS.party}</span>
        <span class="sb-label">Party (30 Players)</span>
        <span class="sb-arrow">${UI_ICONS.chevron}</span>
      </button>
      <button class="sidebar-nav-item" id="sb-profile">
        <span class="sb-icon">${UI_ICONS.profile}</span>
        <span class="sb-label">Profile</span>
        <span class="sb-arrow">${UI_ICONS.chevron}</span>
      </button>
      <button class="sidebar-nav-item" id="sb-settings">
        <span class="sb-icon">${UI_ICONS.settings}</span>
        <span class="sb-label">Settings</span>
        <span class="sb-arrow">${UI_ICONS.chevron}</span>
      </button>
    </nav>

    <div class="sidebar-divider"></div>

    <div class="sidebar-bottom">
      <button class="sidebar-nav-item danger" id="sb-signout">
        <span class="sb-icon">${UI_ICONS.signout}</span>
        <span class="sb-label">Sign Out</span>
      </button>
    </div>

    <div class="sidebar-footer">
      <span style="color:var(--text-muted);font-size:0.72rem;font-weight:600;letter-spacing:2px;">v2.1.0 • CLASSIC</span>
    </div>
  `;
}

export function openSidebar() { if (!sidebarEl) return; isOpen = true; sidebarEl.classList.add('open'); overlayEl.classList.add('visible'); toggleBtn?.classList.add('hidden'); }
export function closeSidebar() { if (!sidebarEl) return; isOpen = false; sidebarEl.classList.remove('open'); overlayEl.classList.remove('visible'); toggleBtn?.classList.remove('hidden'); }
export function toggleSidebar() { if (isOpen) closeSidebar(); else openSidebar(); }

export function updateSidebarUser() {
  if (!sidebarEl) return;
  sidebarEl.innerHTML = buildSidebarHTML();
  bindNavLinks();
}

export function destroySidebar() {
  document.getElementById('sidebar-root')?.remove();
  document.getElementById('sidebar-overlay')?.remove();
  document.getElementById('sidebar-toggle')?.remove();
  sidebarEl = null; overlayEl = null; toggleBtn = null; isOpen = false;
}
