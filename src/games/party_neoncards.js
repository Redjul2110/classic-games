// src/games/party_neoncards.js
// Uno-Style game for up to 30 players with infinite deck

import { escapeHtml } from '../utils.js';
import { showToast } from '../ui/toast.js';
import { getUserId } from '../auth.js';

const COLORS = ['Red', 'Blue', 'Green', 'Yellow'];
const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Skip', 'Reverse', '+2'];
const WILDS = ['Wild', 'Wild+4']; // no color initially

export function renderPartyNeonCards(container, onBack) {
    const partyData = window._partyData;
    if (!partyData) {
        onBack();
        return;
    }

    const { channel, code, isHost, members } = partyData;
    const myId = getUserId();
    const uids = Object.keys(members).sort();

    // Game state (Host drives, broadcasts to everyone)
    let state = 'waiting';
    let playerMap = {}; // { uid: { username, hand: [], cardCount: 0 } }
    let topDiscard = null;
    let currentTurnIndex = 0;
    let direction = 1; // 1 = forward, -1 = reverse
    let activeColor = null; // Important for wilds
    let winnerId = null;

    let modalOpen = false; // color picker
    let pendingWildCard = null; // temporary hold for wild card to ask for color

    container.innerHTML = `
        <div class="game-screen" style="max-width:1000px;margin:0 auto;height:100vh;display:flex;flex-direction:column;">
            <div class="game-screen-header">
                <button class="btn btn-ghost btn-sm" id="pnc-back">← Leave</button>
                <div class="game-screen-title">Party Neon Cards <span class="game-screen-badge vs-player">${uids.length} Players</span></div>
                 ${isHost ? `<button class="btn btn-sm btn-ghost danger" id="pnc-force-end" style="margin-left:auto;">🛑 End Match</button>` : '<div style="margin-left:auto;"></div>'}
            </div>
            
            <div style="flex:1;display:flex;flex-direction:column;padding:8px;gap:8px;overflow:hidden;">
                
                <div id="pnc-status" style="font-size:clamp(0.9rem,3vw,1.2rem);font-weight:700;text-align:center;color:var(--primary-color);">
                    Waiting for host to deal cards...
                </div>
                
                <div id="pnc-host-controls" style="${isHost ? 'text-align:center;' : 'display:none;'}">
                    <button class="btn btn-accent" id="pnc-start-btn" style="padding:12px 24px;min-height:48px;">Deal Cards!</button>
                </div>

                <!-- Opponents Strip (Horizontally scrollable) -->
                <div id="pnc-opponents" style="display:none;gap:8px;overflow-x:auto;padding-bottom:8px;min-height:70px;white-space:nowrap;-webkit-overflow-scrolling:touch;"></div>

                <!-- Center Play Area -->
                <div id="pnc-play-area" style="display:none;flex:1;flex-direction:column;align-items:center;justify-content:center;background:var(--bg-card);border-radius:12px;border:1px solid rgba(255,255,255,0.1);padding:clamp(8px,3vw,24px);position:relative;min-height:0;">
                    
                    <div style="display:flex;gap:clamp(12px,4vw,24px);align-items:center;">
                        <!-- Draw Pile -->
                        <div id="pnc-draw-pile" style="width:clamp(64px,15vw,100px);height:clamp(90px,21vw,140px);background:linear-gradient(135deg,#333,#111);border:4px solid #444;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#666;font-weight:bold;cursor:pointer;box-shadow:0 10px 20px rgba(0,0,0,0.5);transition:all 0.2s;font-size:clamp(0.7rem,2vw,1rem);text-align:center;">
                            DRAW
                        </div>
                        
                        <!-- Discard Pile -->
                        <div id="pnc-discard-pile" style="width:clamp(64px,15vw,100px);height:clamp(90px,21vw,140px);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:clamp(1rem,3.5vw,1.5rem);font-weight:900;box-shadow:0 10px 20px rgba(0,0,0,0.5);text-align:center;line-height:1.2;position:relative;">
                           <!-- Top Card Here -->
                        </div>
                    </div>

                    <div id="pnc-active-color-indicator" style="margin-top:12px;font-weight:bold;text-transform:uppercase;letter-spacing:2px;display:none;padding:4px 12px;border-radius:100px;font-size:0.85rem;"></div>

                </div>

                <!-- My Hand -->
                <div id="pnc-hand-area" style="display:none;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);">
                    <div style="margin-bottom:6px;font-weight:bold;font-size:0.9rem;">Your Hand (<span id="pnc-my-count">0</span>)</div>
                    <div id="pnc-my-cards" style="display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;-webkit-overflow-scrolling:touch;"></div>
                </div>

            </div>
        </div>

        <!-- Color Picker Modal -->
        <div id="pnc-color-modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:100;align-items:center;justify-content:center;">
            <div style="background:var(--bg-elevated);padding:clamp(16px,5vw,32px);border-radius:16px;text-align:center;margin:16px;">
                <h3 style="margin-bottom:16px;">Choose Color</h3>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <button class="btn color-btn" style="background:#FF3B30;color:white;min-height:52px;" data-color="Red">Red</button>
                    <button class="btn color-btn" style="background:#34C759;color:white;min-height:52px;" data-color="Green">Green</button>
                    <button class="btn color-btn" style="background:#007AFF;color:white;min-height:52px;" data-color="Blue">Blue</button>
                    <button class="btn color-btn" style="background:#FFCC00;color:black;min-height:52px;" data-color="Yellow">Yellow</button>
                </div>
            </div>
        </div>
    `;

    const backBtn = container.querySelector('#pnc-back');
    const forceEndBtn = container.querySelector('#pnc-force-end');
    const startBtn = container.querySelector('#pnc-start-btn');
    const statusDiv = container.querySelector('#pnc-status');
    const oppsDiv = container.querySelector('#pnc-opponents');
    const playArea = container.querySelector('#pnc-play-area');
    const drawPile = container.querySelector('#pnc-draw-pile');
    const discardPile = container.querySelector('#pnc-discard-pile');
    const handArea = container.querySelector('#pnc-hand-area');
    const myCardsDiv = container.querySelector('#pnc-my-cards');
    const colorIndicator = container.querySelector('#pnc-active-color-indicator');
    const colorModal = container.querySelector('#pnc-color-modal');
    const colorBtns = container.querySelectorAll('.color-btn');

    backBtn.addEventListener('click', () => onBack());

    if (forceEndBtn) {
        forceEndBtn.addEventListener('click', () => {
            if (confirm("End match for everyone?")) {
                channel.send({ type: 'broadcast', event: 'force_game_end' });
                onBack();
            }
        });
    }

    // ─── INIT DATA ───
    uids.forEach(uid => {
        playerMap[uid] = { username: members[uid].username, hand: [], cardCount: 0 };
    });

    startBtn.addEventListener('click', () => {
        if (isHost) {
            startBtn.style.display = 'none';
            // Host initializes the game state
            uids.forEach(uid => { playerMap[uid].hand = Array.from({ length: 7 }, () => getRandomCard()); });
            topDiscard = getRandomCard(false); // First card cannot be wild to simplify
            activeColor = topDiscard.color;
            currentTurnIndex = 0;
            direction = 1;

            broadcastState('Game Started!');
        }
    });

    drawPile.addEventListener('click', () => {
        if (state !== 'playing') return;
        if (uids[currentTurnIndex] !== myId) return; // Not my turn

        requestDraw(1);
    });

    colorBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (!pendingWildCard) return;
            const chosenColor = e.target.dataset.color;
            colorModal.style.display = 'none';
            modalOpen = false;

            pendingWildCard.color = chosenColor; // Temporary assign for display
            executePlayCard(pendingWildCard, chosenColor);
            pendingWildCard = null;
        });
    });

    // ─── INTERNAL LOGIC (HOST) / P2P EVENTS ───
    // Instead of Host verifying everything, we let clients broadcast their actions 
    // and everyone updates their local state to match. "Trusting" client architecture.

    channel.on('broadcast', { event: 'force_game_end' }, () => {
        showToast('Host ended the match.', 'info');
        onBack();
    });

    channel.on('broadcast', { event: 'nc_state' }, ({ payload }) => {
        // Full state sync from anyone who makes an action
        state = 'playing';
        playerMap = payload.playerMap;
        topDiscard = payload.topDiscard;
        currentTurnIndex = payload.turnIndex;
        direction = payload.direction;
        activeColor = payload.activeColor;
        winnerId = payload.winnerId;

        if (payload.msg) showToast(payload.msg, 'info');

        if (winnerId) {
            state = 'over';
            import('../ui/animations.js').then(({ triggerConfetti }) => triggerConfetti());
        }

        renderAll();
    });

    // ─── ACTIONS ───
    function getRandomCard(allowWild = true) {
        if (allowWild && Math.random() < 0.1) {
            return { color: 'Black', value: WILDS[Math.floor(Math.random() * WILDS.length)] };
        }
        return {
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            value: VALUES[Math.floor(Math.random() * VALUES.length)]
        };
    }

    function isPlayable(card) {
        if (card.color === 'Black') return true; // Wilds always playable
        if (card.color === activeColor) return true;
        if (card.value === topDiscard.value) return true;
        return false;
    }

    function attemptPlayCard(cardIdx) {
        if (uids[currentTurnIndex] !== myId || modalOpen) return;

        const card = playerMap[myId].hand[cardIdx];
        if (!isPlayable(card)) {
            showToast("You can't play that card.", "error");
            // shake card anim
            const el = myCardsDiv.children[cardIdx];
            el.className = 'card-item error-shake';
            setTimeout(() => el.className = 'card-item', 500);
            return;
        }

        // Remove from hand immediately
        const playedCard = playerMap[myId].hand.splice(cardIdx, 1)[0];

        if (playedCard.color === 'Black') {
            // Need to ask for color
            pendingWildCard = playedCard;
            modalOpen = true;
            colorModal.style.display = 'flex';
        } else {
            executePlayCard(playedCard, playedCard.color);
        }
    }

    function requestDraw(amount) {
        for (let i = 0; i < amount; i++) playerMap[myId].hand.push(getRandomCard());

        // Pass turn if drawing manually without playing
        passTurn();
        broadcastState(`${escapeHtml(playerMap[myId].username)} drew ${amount} card(s).`);
    }

    function executePlayCard(card, newColor) {
        topDiscard = card;
        activeColor = newColor;

        let drawAmount = 0;
        let passCounter = 1; // normally passes to next player

        // Apply effects
        if (card.value === 'Skip') passCounter = 2;
        if (card.value === 'Reverse') {
            direction *= -1;
            // If only 2 players, reverse acts like a skip
            if (uids.length === 2) passCounter = 2;
        }
        if (card.value === '+2') drawAmount = 2;
        if (card.value === 'Wild+4') drawAmount = 4;

        // Check Winner
        if (playerMap[myId].hand.length === 0) {
            winnerId = myId;
            broadcastState(`🏆 ${playerMap[myId].username} WON THE GAME!`);
            return;
        }

        // Apply Draw penalties to target
        if (drawAmount > 0) {
            let targetIdx = getNextIndex(currentTurnIndex, 1);
            const targetUid = uids[targetIdx];
            for (let i = 0; i < drawAmount; i++) playerMap[targetUid].hand.push(getRandomCard());
            passCounter = 2; // target loses turn
            showToast(`${playerMap[targetUid].username} draws ${drawAmount}!`, 'error');
        }

        currentTurnIndex = getNextIndex(currentTurnIndex, passCounter);
        broadcastState(`${escapeHtml(playerMap[myId].username)} played ${card.color} ${card.value}`);
        import('../ui/animations.js').then(({ playSound }) => playSound('place'));
    }

    function passTurn() {
        currentTurnIndex = getNextIndex(currentTurnIndex, 1);
    }

    function getNextIndex(startIdx, steps) {
        let n = startIdx + (steps * direction);
        while (n < 0) n += uids.length;
        return n % uids.length;
    }

    function broadcastState(msg) {
        // Update all client card counts based on actual hands
        uids.forEach(uid => { playerMap[uid].cardCount = playerMap[uid].hand.length; });

        channel.send({
            type: 'broadcast',
            event: 'nc_state',
            payload: {
                playerMap, topDiscard, turnIndex: currentTurnIndex,
                direction, activeColor, winnerId, msg
            }
        });

        // local update
        if (msg) showToast(msg, 'info');
        if (winnerId) state = 'over';
        renderAll();
    }

    // ─── RENDER ───
    function renderAll() {
        startBtn.style.display = 'none';
        statusDiv.style.display = 'none';
        oppsDiv.style.display = 'flex';
        playArea.style.display = 'flex';
        handArea.style.display = 'block';

        renderOpponents();
        renderPlayArea();
        renderMyHand();

        if (winnerId) {
            statusDiv.style.display = 'block';
            statusDiv.innerHTML = `<span style="font-size:2rem;color:var(--primary-color)">🏆 ${escapeHtml(playerMap[winnerId].username)} WINS!</span>`;
            statusDiv.className = 'fade-in';
            playArea.style.opacity = '0.5';
            playArea.style.pointerEvents = 'none';
        }

        renderTurnIndicator();
    }

    function getColorsForCard(colorStr) {
        switch (colorStr) {
            case 'Red': return { bg: '#FF3B30', txt: '#FFF' };
            case 'Green': return { bg: '#34C759', txt: '#FFF' };
            case 'Blue': return { bg: '#007AFF', txt: '#FFF' };
            case 'Yellow': return { bg: '#FFCC00', txt: '#000' };
            case 'Black': return { bg: '#222', txt: '#FFF' };
            default: return { bg: '#555', txt: '#FFF' };
        }
    }

    function renderOpponents() {
        // Render everyone except me
        const others = uids.filter(u => u !== myId);

        oppsDiv.innerHTML = others.map(uid => {
            const isTurn = uids[currentTurnIndex] === uid;
            const p = playerMap[uid];
            return `
                <div style="display:inline-block;padding:8px 16px;background:var(--bg-elevated);border-radius:12px;border:2px solid ${isTurn ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)'};text-align:center;min-width:100px;opacity:${p.cardCount === 0 ? '0.3' : '1'};">
                    <div style="font-weight:${isTurn ? 'bold' : 'normal'};color:${isTurn ? 'var(--primary-color)' : 'var(--text-primary)'};margin-bottom:4px;">${escapeHtml(p.username)}</div>
                    <div style="font-size:1.5rem;font-weight:900;">${p.cardCount} <span style="font-size:0.8rem">🃏</span></div>
                </div>
            `;
        }).join('');
    }

    function renderPlayArea() {
        if (!topDiscard) return;

        const cTheme = getColorsForCard(topDiscard.color);

        discardPile.style.background = cTheme.bg;
        discardPile.style.color = cTheme.txt;
        discardPile.innerHTML = `
           <div style="position:absolute;top:4px;left:4px;font-size:0.8rem;">${topDiscard.value}</div>
           <div>${topDiscard.value.replace('+', '<br>+')}</div>
           <div style="position:absolute;bottom:4px;right:4px;font-size:0.8rem;transform:rotate(180deg);">${topDiscard.value}</div>
        `;

        // Indicate arrows
        const arr = direction === 1 ? '▶▶▶' : '◀◀◀';
        drawPile.innerText = `DRAW\n\n${arr}`;

        // Color indicator for wilds
        if (activeColor && activeColor !== 'Black') {
            const aTheme = getColorsForCard(activeColor);
            colorIndicator.style.display = 'block';
            colorIndicator.style.background = aTheme.bg;
            colorIndicator.style.color = aTheme.txt;
            colorIndicator.textContent = `Color is ${activeColor}`;
        } else {
            colorIndicator.style.display = 'none';
        }
    }

    function renderMyHand() {
        const hand = playerMap[myId].hand;
        const myTurn = uids[currentTurnIndex] === myId && !winnerId;

        container.querySelector('#pnc-my-count').textContent = hand.length;

        drawPile.style.opacity = myTurn ? '1' : '0.5';
        drawPile.style.borderColor = myTurn ? 'var(--primary-color)' : '#444';

        if (hand.length === 0) {
            myCardsDiv.innerHTML = '<div style="color:var(--text-muted);font-style:italic;">No cards left!</div>';
            return;
        }

        myCardsDiv.innerHTML = hand.map((card, idx) => {
            const playable = myTurn && isPlayable(card);
            const cTheme = getColorsForCard(card.color);

            return `
                <div class="card-item" data-idx="${idx}" style="min-width:70px;height:100px;background:${cTheme.bg};color:${cTheme.txt};border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1.2rem;cursor:${playable ? 'pointer' : 'not-allowed'};opacity:${playable ? '1' : '0.5'};transform:${playable ? 'translateY(-10px)' : 'none'};transition:all 0.2s;position:relative;flex-shrink:0;">
                    <div style="position:absolute;top:4px;left:4px;font-size:0.6rem;">${card.value}</div>
                    <div>${card.value === 'Skip' ? '⊘' : card.value === 'Reverse' ? '🔁' : card.value}</div>
                </div>
            `;
        }).join('');

        // Re-attach listeners directly to DOM elements avoiding complex map-closure leaks if not careful
        Array.from(myCardsDiv.children).forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.idx);
                attemptPlayCard(idx);
            });
        });
    }

    function renderTurnIndicator() {
        if (winnerId) return;
        const isMe = uids[currentTurnIndex] === myId;
        statusDiv.style.display = 'block';
        if (isMe) {
            statusDiv.innerHTML = `<span style="color:var(--accent-color);font-size:1.5rem;">▶ YOUR TURN!</span>`;
            import('../ui/animations.js').then(({ playSound }) => playSound('pop'));
        } else {
            statusDiv.innerHTML = `<span style="color:var(--text-muted);font-size:1rem;">⏳ ${escapeHtml(playerMap[uids[currentTurnIndex]].username)} is thinking...</span>`;
        }
    }
}
