// src/pages/chat.js
// Community Chat Page + Floating Drawer

import {
  loadChatMessages, sendChatMessage, deleteChatMessage,
  subscribeChatRealtime, unsubscribeChat, clearUnread, getChatMessages
} from '../chat.js';
import { getUserId, getDisplayName, isGuest } from '../auth.js';
import { renderNavbar } from '../ui/navbar.js';
import { showToast } from '../ui/toast.js';

// ─── Render the full-page chat view ───
export function renderChatPage(container, { onBack, onProfileClick, onChatClick, onSignOut }) {
  container.innerHTML = `
    <div class="chat-page">
      <div id="chat-navbar"></div>
      <div class="chat-container">
        <div class="chat-header-bar">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <div class="chat-title">
              <div class="chat-online-dot"></div>
              Community Chat
            </div>
            <button class="btn btn-ghost btn-sm" id="chat-back-btn">← Back</button>
          </div>
        </div>
        <div class="chat-messages" id="chat-messages-list">
          <div class="chat-system-msg">Loading messages…</div>
        </div>
        ${isGuest() ? `
        <div class="chat-input-area" style="justify-content:center;padding:14px;">
          <div style="color:var(--text-muted);font-size:0.9rem;text-align:center;">
            ✕ Guests cannot send messages — <strong style="color:var(--red-light);">Sign in</strong> to chat.
          </div>
        </div>` : `
        <div class="chat-input-area">
          <textarea class="chat-textarea" id="chat-input" rows="1"
            placeholder="Say something friendly… (Enter to send)"
            maxlength="500"></textarea>
          <button class="chat-send-btn" id="chat-send-btn" title="Send">➤</button>
        </div>`}
      </div>
    </div>
  `;

  renderNavbar(container.querySelector('#chat-navbar'), { onProfileClick, onChatClick, onSignOut });
  container.querySelector('#chat-back-btn').addEventListener('click', onBack);

  const list = container.querySelector('#chat-messages-list');
  const input = container.querySelector('#chat-input');
  const sendBtn = container.querySelector('#chat-send-btn');

  // Load messages
  loadChatMessages().then(msgs => {
    renderMessageList(list, msgs);
    scrollToBottom(list);
  });

  // Realtime updates
  subscribeChatRealtime((newMsg, allMsgs) => {
    renderMessageList(list, allMsgs);
    scrollToBottom(list);
    clearUnread();
  }, null);

  // Send (only for authenticated users — guests are blocked in sendChatMessage too)
  if (input && sendBtn) {
    async function trySend() {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      try { await sendChatMessage(text); } catch (err) { showToast('Send failed: ' + err.message, 'error'); }
    }
    sendBtn.addEventListener('click', trySend);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); trySend(); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
  }
}

function renderMessageList(container, messages) {
  const myId = getUserId();
  if (!messages || messages.length === 0) {
    container.innerHTML = `<div class="chat-system-msg">No messages yet. Be the first! 🎮</div>`;
    return;
  }
  container.innerHTML = messages.map(m => {
    const isSelf = m.user_id === myId;
    const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const initial = (m.username || 'P').charAt(0).toUpperCase();

    // Adding msg-own class for aligning your own messages to the right
    return `
      <div class="chat-msg ${isSelf ? 'msg-own' : ''}" data-msg-id="${m.id}">
        <div class="msg-avatar">${initial}</div>
        <div class="msg-content-wrapper">
          <div class="msg-header">
            <span class="msg-username ${isSelf ? 'is-self' : ''}">${escapeHtml(m.username || 'Player')}</span>
            <span class="msg-time">${time}</span>
            ${isSelf ? `<button class="msg-delete-btn" data-id="${m.id}" title="Delete Message"><i data-lucide="trash-2"></i></button>` : ''}
          </div>
          <div class="msg-text">${escapeHtml(m.message || '')}</div>
        </div>
      </div>
    `;
  }).join('');

  // Delete buttons
  container.querySelectorAll('.msg-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await deleteChatMessage(parseInt(btn.dataset.id));
        showToast('Message deleted.', 'success');
      } catch (err) {
        showToast('Delete failed: ' + err.message, 'error');
      }
    });
  });

  if (window.lucide) {
    setTimeout(() => lucide.createIcons({ root: container }), 10);
  }
}

function scrollToBottom(el) {
  setTimeout(() => { el.scrollTop = el.scrollHeight; }, 50);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Floating Chat Drawer (accessible from any page) ───
let drawerInitialized = false;

export function initChatDrawer() {
  if (drawerInitialized) return;
  drawerInitialized = true;

  const myId = getUserId();

  // FAB Button
  const fab = document.createElement('button');
  fab.className = 'chat-fab';
  fab.id = 'chat-fab';
  fab.innerHTML = '💬 <span class="unread-badge hidden" id="chat-unread">0</span>';
  fab.title = 'Community Chat';
  document.body.appendChild(fab);

  // Drawer
  const drawer = document.createElement('div');
  drawer.className = 'chat-drawer';
  drawer.id = 'chat-drawer';
  drawer.innerHTML = `
    <div class="chat-drawer-header" id="chat-drawer-toggle">
      <div class="chat-drawer-title">
        <div class="chat-online-dot"></div>
        Community Chat
      </div>
      <button class="chat-drawer-close" id="chat-drawer-close">✕</button>
    </div>
    <div class="chat-drawer-messages" id="drawer-messages"></div>
    <div class="chat-drawer-input">
      ${isGuest() ? `
        <div style="flex:1;color:var(--text-muted);font-size:0.8rem;text-align:center;padding:6px;">
          Sign in to send messages
        </div>` : `
      <textarea class="chat-drawer-textarea" id="drawer-input"
        placeholder="Message…" rows="1" maxlength="500"></textarea>
      <button class="chat-drawer-send" id="drawer-send">➤</button>`}
    </div>
  `;
  document.body.appendChild(drawer);

  // Unread badge
  fab.addEventListener('click', () => {
    const isOpen = drawer.classList.contains('open');
    if (isOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });

  document.querySelector('#chat-drawer-close').addEventListener('click', closeDrawer);

  function openDrawer() {
    drawer.classList.add('open');
    clearUnread();
    updateUnreadBadge(0);
    loadAndRenderDrawer();
  }
  function closeDrawer() { drawer.classList.remove('open'); }

  async function loadAndRenderDrawer() {
    const msgs = await loadChatMessages(40);
    renderDrawerMessages(msgs);
    const msgEl = document.querySelector('#drawer-messages');
    setTimeout(() => { msgEl.scrollTop = msgEl.scrollHeight; }, 50);
  }

  subscribeChatRealtime((newMsg, allMsgs) => {
    if (drawer.classList.contains('open')) {
      renderDrawerMessages(allMsgs.slice(-40));
      const msgEl = document.querySelector('#drawer-messages');
      setTimeout(() => { msgEl.scrollTop = msgEl.scrollHeight; }, 50);
      clearUnread();
    } else {
      const badge = document.querySelector('#chat-unread');
      if (badge) {
        const current = parseInt(badge.textContent) || 0;
        updateUnreadBadge(current + 1);
      }
    }
  }, updateUnreadBadge);

  function renderDrawerMessages(messages) {
    const container = document.querySelector('#drawer-messages');
    if (!container) return;
    if (!messages || messages.length === 0) {
      container.innerHTML = `<div class="chat-system-msg">No messages yet.</div>`;
      return;
    }
    container.innerHTML = messages.map(m => {
      const isSelf = m.user_id === myId;
      const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="chat-msg" style="padding:6px 8px;">
          <div class="msg-header">
            <span class="msg-username ${isSelf ? 'is-self' : ''}" style="font-size:0.82rem;">
              ${escapeHtml(m.username || 'Player')}
            </span>
            <span class="msg-time">${time}</span>
          </div>
          <div class="msg-text" style="font-size:0.85rem;">${escapeHtml(m.message || '')}</div>
        </div>
      `;
    }).join('');
  }

  function updateUnreadBadge(count) {
    const badge = document.querySelector('#chat-unread');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // Send from drawer
  const drawerInput = document.querySelector('#drawer-input');
  document.querySelector('#drawer-send').addEventListener('click', async () => {
    const text = drawerInput.value.trim();
    if (!text) return;
    drawerInput.value = '';
    try { await sendChatMessage(text); } catch (err) { showToast('Send failed.', 'error'); }
  });

  drawerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.querySelector('#drawer-send').click();
    }
  });
}
