// src/pages/party.js
import { UI_ICONS } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { ogClient } from '../supabase.js';
import { getUserId, getDisplayName } from '../auth.js';
import { escapeHtml } from '../utils.js';

let currentChannel = null;
let currentPartyCode = null;
let isHost = false;
let partyMembers = {}; // { id: { username, ... } }
let currentPartyLang = 'en';

export function renderPartyPage(container, callbacks) {
    const { onBack, onPlayChess, onPlayTrivia, onPlayNeonCards, onPlayDraw } = callbacks;

    container.innerHTML = `
    <div class="header">
      <button class="icon-btn" id="party-back" title="Back">${UI_ICONS.back}</button>
      <div class="logo">🎉 Party Lounge</div>
      <div style="width: 44px;"></div>
    </div>
    
    <div class="content" style="max-width:800px;margin: 0 auto;padding-bottom:100px;">
      
      <div id="party-setup-view">
        <div style="text-align:center;margin-bottom:40px;">
          <h2 style="font-size:2rem;margin-bottom:12px;">Create or Join a Party</h2>
          <p style="color:var(--text-secondary);">Play Mini-Games with up to 30 friends at once!</p>
        </div>
        
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:24px;">
          
          <!-- Create Party -->
          <div class="card" style="text-align:center;">
            <div style="font-size:3rem;margin-bottom:16px;">👑</div>
            <h3 style="margin-bottom:16px;">Host a Party</h3>
            <p style="color:var(--text-secondary);margin-bottom:20px;">Create a private lobby. Choose your language — it sets the games' words & questions.</p>
            <div style="display:flex;gap:8px;flex-direction:column;">
              <button class="btn btn-primary" id="btn-create-party-en" style="width:100%;min-height:44px;">🇬🇧 Create English Party</button>
              <button class="btn btn-secondary" id="btn-create-party-de" style="width:100%;min-height:44px;">🇩🇪 Create German Party</button>
            </div>
          </div>
          
          <!-- Join Party -->
          <div class="card" style="text-align:center;">
            <div style="font-size:3rem;margin-bottom:16px;">🎟️</div>
            <h3 style="margin-bottom:16px;">Join a Party</h3>
            <p style="color:var(--text-secondary);margin-bottom:24px;">Got a code from a friend? Enter it below to join their lobby.</p>
            <div style="display:flex;gap:8px;">
               <input type="text" id="join-code-input" class="input-field" placeholder="e.g. A7X9K" maxlength="5" style="text-transform:uppercase;text-align:center;letter-spacing:4px;font-size:1.2rem;" />
               <button class="btn btn-accent" id="btn-join-party" style="min-height:44px;">Join</button>
            </div>
          </div>
          
        </div>
      </div>
      
      <div id="party-lobby-view" class="hidden">
        <!-- Will be populated dynamically when inside a party -->
      </div>
      
    </div>
  `;

    // Bind initial buttons
    container.querySelector('#party-back').addEventListener('click', () => {
        leaveParty();
        onBack();
    });

    container.querySelector('#btn-create-party-en').addEventListener('click', () => {
        joinPartyRoom(generatePartyCode(), true, 'en');
    });
    container.querySelector('#btn-create-party-de').addEventListener('click', () => {
        joinPartyRoom(generatePartyCode(), true, 'de');
    });

    container.querySelector('#btn-join-party').addEventListener('click', () => {
        const val = container.querySelector('#join-code-input').value.trim().toUpperCase();
        if (val.length === 5) {
            joinPartyRoom(val, false, 'en'); // lang will be overridden by host's start_game payload
        } else {
            showToast('Please enter a valid 5-letter code', 'error');
        }
    });

    // --- Lobby Restoration ---
    if (currentChannel && currentPartyCode) {
        // We are already connected. Re-render the lobby UI quickly.
        const setupView = container.querySelector('#party-setup-view');
        const lobbyView = container.querySelector('#party-lobby-view');
        setupView.classList.add('hidden');
        lobbyView.classList.remove('hidden');
        renderLobbyScreen();
        updateLobbyUI();
    }

    function generatePartyCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // removed O,0,1,I for clarity
        let code = '';
        for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
        return code;
    }

    async function joinPartyRoom(code, asHost, lang = 'en') {
        if (currentChannel) leaveParty();

        currentPartyCode = code;
        isHost = asHost;
        partyMembers = {};
        currentPartyLang = lang;

        showToast(`Joining Party ${code}...`, 'info');

        // 1. Render Lobby UI
        renderLobbyScreen();
        const setupView = container.querySelector('#party-setup-view');
        const lobbyView = container.querySelector('#party-lobby-view');
        setupView.classList.add('hidden');
        lobbyView.classList.remove('hidden');

        // 2. Setup Supabase Channel
        currentChannel = ogClient.channel(`party-${code}`, {
            config: {
                presence: { key: getUserId() }
            }
        });

        currentChannel.on('presence', { event: 'sync' }, () => {
            const state = currentChannel.presenceState();
            partyMembers = {};
            Object.keys(state).forEach(key => {
                const presenceData = state[key][0];
                // Use the tracked user_id as the dominant key instead of the socket key
                if (presenceData && presenceData.user_id) {
                    partyMembers[presenceData.user_id] = presenceData;
                }
            });
            updateLobbyUI();
        });

        currentChannel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
            showToast(`${newPresences[0].username} joined the party!`);
        });

        currentChannel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            showToast(`${leftPresences[0].username} left.`);
        });

        // Chat Listeners
        currentChannel.on('broadcast', { event: 'party_chat' }, ({ payload }) => {
            appendChatMessage(payload.sender, payload.message);
        });

        // Game Listeners
        currentChannel.on('broadcast', { event: 'start_game' }, ({ payload }) => {
            const gameLang = payload.lang || 'en';
            window._partyData = {
                channel: currentChannel, code: currentPartyCode, isHost, members: partyMembers,
                lang: gameLang, matchCount: 0,
                forceHome: () => { leaveParty(); onBack(); }
            };
            if (payload.gameId === 'party_chess') {
                showToast('Host started Party Chess!', 'success');
                onPlayChess();
            } else if (payload.gameId === 'party_trivia') {
                showToast('Host started Party Trivia!', 'success');
                onPlayTrivia();
            } else if (payload.gameId === 'party_neoncards') {
                showToast('Host started Party Neon Cards!', 'success');
                onPlayNeonCards();
            } else if (payload.gameId === 'party_draw') {
                showToast('Host started Party Draw!', 'success');
                onPlayDraw();
            }
        });

        // Kick listener
        currentChannel.on('broadcast', { event: 'player_kicked' }, ({ payload }) => {
            if (payload.uid === getUserId()) {
                showToast('You have been kicked from the party.', 'error');
                leaveParty();
            }
        });

        currentChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                const statusObj = await currentChannel.track({
                    user_id: getUserId(),
                    username: getDisplayName(),
                    isHost: isHost
                });
                showToast('Connected to Party!', 'success');
            }
        });
    }

    function leaveParty() {
        if (currentChannel) {
            currentChannel.unsubscribe();
            currentChannel = null;
        }
        currentPartyCode = null;
        isHost = false;
        partyMembers = {};
        window._partyData = null;

        const setupView = container.querySelector('#party-setup-view');
        const lobbyView = container.querySelector('#party-lobby-view');
        if (setupView && lobbyView) {
            setupView.classList.remove('hidden');
            lobbyView.classList.add('hidden');
        }
    }

    function renderLobbyScreen() {
        const lobbyView = container.querySelector('#party-lobby-view');
        lobbyView.innerHTML = `
        <div style="background:var(--bg-card);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
            <p style="color:var(--text-secondary);font-size:0.9rem;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">Party Code</p>
            <h1 style="font-size:clamp(2rem,8vw,4rem);letter-spacing:8px;color:var(--primary-color);margin:0;user-select:all;">${currentPartyCode}</h1>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;">
            <!-- Player List -->
            <div class="card">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h3>Players (<span id="party-count">1</span>/30)</h3>
                </div>
                <div id="party-players" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;">
                    <!-- Players dynamically rendered here -->
                </div>
            </div>

            <!-- Host Controls -->
            <div class="card" id="party-host-controls" style="${isHost ? '' : 'display:none;'}">
                <h3 style="margin-bottom:16px;">Host Controls</h3>
                
                <h4 style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:8px;">Start Mini-Game</h4>
                <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px;">
                    <button class="btn btn-primary" id="start-trivia-btn" style="min-height:44px;">🧠 Party Trivia</button>
                    <button class="btn btn-accent" id="start-neon-btn" style="min-height:44px;">🃏 Party Neon Cards</button>
                    <button class="btn" style="background:linear-gradient(135deg,#FF6B6B,#845EC2);color:white;min-height:44px;" id="start-draw-btn">🎨 Party Draw</button>
                    <button class="btn btn-secondary" id="start-chess-btn" style="min-height:44px;">♟️ Party Chess</button>
                </div>

                <button class="btn btn-ghost danger" id="leave-party-btn" style="width:100%;min-height:44px;">Leave Party</button>
            </div>
            
            <!-- Guest Controls (only shown if not host) -->
             <div class="card" id="party-guest-controls" style="${!isHost ? '' : 'display:none;'}">
                <h3 style="margin-bottom:16px;">Waiting for Host</h3>
                <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:24px;">The host will select and start a game soon...</p>
                <button class="btn btn-ghost danger" id="guest-leave-party-btn" style="width:100%;min-height:44px;">Leave Party</button>
             </div>
        </div>

        <!-- Private Party Chat -->
        <div class="card" style="margin-top:24px;">
            <h3 style="margin-bottom:16px;">Private Party Chat</h3>
            <div id="party-chat-messages" style="height:180px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:8px;padding:12px;margin-bottom:12px;display:flex;flex-direction:column;gap:8px;">
                <div style="text-align:center;color:var(--text-muted);font-size:0.8rem;">Welcome to the private party chat!</div>
            </div>
            <div style="display:flex;gap:8px;">
                <input type="text" id="party-chat-input" class="input-field" placeholder="Chat with the party..." autocomplete="off" style="min-height:44px;">
                <button class="btn btn-primary" id="party-chat-send" style="min-height:44px;min-width:60px;">Send</button>
            </div>
        </div>
      `;
        bindLobbyButtons();
    }

    function bindLobbyButtons() {
        const lobbyView = container.querySelector('#party-lobby-view');
        if (!lobbyView) return;

        const startChess = lobbyView.querySelector('#start-chess-btn');
        const startTrivia = lobbyView.querySelector('#start-trivia-btn');
        const startNeon = lobbyView.querySelector('#start-neon-btn');
        const startDraw = lobbyView.querySelector('#start-draw-btn');
        const leaveHost = lobbyView.querySelector('#leave-party-btn');
        const leaveGuest = lobbyView.querySelector('#guest-leave-party-btn');
        const chatInput = lobbyView.querySelector('#party-chat-input');
        const chatSend = lobbyView.querySelector('#party-chat-send');

        startTrivia?.addEventListener('click', () => {
            if (!isHost || !currentChannel) return;
            currentChannel.send({ type: 'broadcast', event: 'start_game', payload: { gameId: 'party_trivia', lang: currentPartyLang } });
            window._partyData = { channel: currentChannel, code: currentPartyCode, isHost, members: partyMembers, lang: currentPartyLang, matchCount: 0, forceHome: () => { leaveParty(); onBack(); } };
            onPlayTrivia();
        });

        startNeon?.addEventListener('click', () => {
            if (!isHost || !currentChannel) return;
            currentChannel.send({ type: 'broadcast', event: 'start_game', payload: { gameId: 'party_neoncards', lang: currentPartyLang } });
            window._partyData = { channel: currentChannel, code: currentPartyCode, isHost, members: partyMembers, lang: currentPartyLang, matchCount: 0, forceHome: () => { leaveParty(); onBack(); } };
            onPlayNeonCards();
        });

        startChess?.addEventListener('click', () => {
            if (!isHost || !currentChannel) return;
            currentChannel.send({ type: 'broadcast', event: 'start_game', payload: { gameId: 'party_chess', lang: currentPartyLang } });
            window._partyData = { channel: currentChannel, code: currentPartyCode, isHost, members: partyMembers, lang: currentPartyLang, matchCount: 0, forceHome: () => { leaveParty(); onBack(); } };
            onPlayChess();
        });

        startDraw?.addEventListener('click', () => {
            if (!isHost || !currentChannel) return;
            currentChannel.send({ type: 'broadcast', event: 'start_game', payload: { gameId: 'party_draw', lang: currentPartyLang } });
            window._partyData = { channel: currentChannel, code: currentPartyCode, isHost, members: partyMembers, lang: currentPartyLang, matchCount: 0, forceHome: () => { leaveParty(); onBack(); } };
            onPlayDraw();
        });

        leaveHost?.addEventListener('click', () => { leaveParty(); onBack(); });
        leaveGuest?.addEventListener('click', () => { leaveParty(); onBack(); });

        chatSend?.addEventListener('click', () => sendPartyChat());
        chatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendPartyChat();
        });

        function sendPartyChat() {
            const msg = chatInput.value.trim();
            if (!msg || !currentChannel) return;

            currentChannel.send({
                type: 'broadcast',
                event: 'party_chat',
                payload: { sender: getDisplayName(), message: msg }
            });

            appendChatMessage('You', msg);
            chatInput.value = '';
        }
    }

    function appendChatMessage(sender, text) {
        const msgsDiv = container.querySelector('#party-chat-messages');
        if (!msgsDiv) return;
        const el = document.createElement('div');
        el.style.cssText = `background:rgba(255,255,255,0.05);padding:8px 12px;border-radius:8px;font-size:0.9rem;`;
        el.innerHTML = `<strong style="color:var(--primary-color)">${escapeHtml(sender)}:</strong> <span style="word-break:break-word;">${escapeHtml(text)}</span>`;
        msgsDiv.appendChild(el);
        msgsDiv.scrollTop = msgsDiv.scrollHeight;
    }

    function updateLobbyUI() {
        const playersDiv = container.querySelector('#party-players');
        const countSpan = container.querySelector('#party-count');
        if (!playersDiv || !countSpan) return;

        const keys = Object.keys(partyMembers);
        countSpan.textContent = keys.length;
        const myId = getUserId();

        playersDiv.innerHTML = keys.map(key => {
            const member = partyMembers[key];
            const isMe = key === myId;
            const canKick = isHost && !member.isHost && !isMe;
            return `
            <div style="background:var(--bg-elevated);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px;text-align:center;position:relative;">
                <div style="font-size:1.5rem;margin-bottom:4px;">${member.isHost ? '👑' : '👤'}</div>
                <div style="font-size:0.8rem;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">${escapeHtml(member.username)}</div>
                ${canKick ? `<button class="btn btn-sm" data-kick-uid="${escapeHtml(key)}" style="margin-top:6px;font-size:0.7rem;padding:2px 8px;background:rgba(255,59,48,0.2);color:#FF3B30;border:1px solid rgba(255,59,48,0.4);border-radius:8px;cursor:pointer;">Kick</button>` : ''}
            </div>
          `;
        }).join('');

        // Bind kick buttons
        playersDiv.querySelectorAll('[data-kick-uid]').forEach(btn => {
            btn.addEventListener('click', () => {
                const uid = btn.getAttribute('data-kick-uid');
                const name = partyMembers[uid]?.username || '?';
                if (!confirm(`Kick ${name} from the party?`)) return;
                currentChannel.send({ type: 'broadcast', event: 'player_kicked', payload: { uid } });
                showToast(`${escapeHtml(name)} was kicked.`, 'info');
            });
        });

        // Auto-assign host if original host leaves
        if (!isHost && !keys.some(k => partyMembers[k].isHost)) {
            keys.sort();
            if (keys[0] === getUserId()) {
                isHost = true;
                showToast('Host left. You are now the Host.', 'info');
                currentChannel.track({ user_id: getUserId(), username: getDisplayName(), isHost: true });
                container.querySelector('#party-host-controls')?.style.setProperty('display', 'block');
                container.querySelector('#party-guest-controls')?.style.setProperty('display', 'none');
            }
        }
    }

}
