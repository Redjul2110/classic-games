// src/games/neoncards.js
// Neon Cards — UNO-style color-matching card game with neon visual theme
// Multiplayer: Host manages full state; guests send moves and receive state.

import { showToast } from '../ui/toast.js';
import { triggerConfetti } from '../ui/animations.js';
import { ogClient } from '../supabase.js';
import { getUserId, getDisplayName } from '../auth.js';
import { escapeHtml } from '../utils.js';

// ─── Card definitions ───
const COLORS = ['red', 'blue', 'green', 'yellow'];
const NEON = { red: '#ff2d55', blue: '#0af', green: '#0f0', yellow: '#ff0' };
const ACTIONS = ['skip', 'reverse', 'draw2'];
const WILDS = ['wild', 'wild4'];

function makeDeck() {
    const deck = [];
    for (const c of COLORS) {
        for (let n = 0; n <= 9; n++) deck.push({ color: c, val: String(n) });
        for (const a of ACTIONS) {
            deck.push({ color: c, val: a });
            deck.push({ color: c, val: a });
        }
    }
    for (const w of WILDS) {
        for (let i = 0; i < 4; i++) deck.push({ color: 'wild', val: w });
    }
    return deck;
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function cardLabel(c) {
    const m = { skip: '⊘', reverse: '↺', draw2: '+2', wild: '★', wild4: '★+4' };
    return m[c.val] ?? c.val;
}

function cardBg(c) {
    if (c.color === 'wild') return 'linear-gradient(135deg,#ff2d55,#0af,#0f0,#ff0)';
    return NEON[c.color] || '#333';
}

function cardText(c) {
    return (c.color === 'red' || c.color === 'yellow' || c.color === 'wild') ? '#111' : '#fff';
}

function canPlay(card, top, chosenColor) {
    if (card.color === 'wild') return true;
    const tc = chosenColor || top.color;
    return card.color === tc || card.val === top.val;
}

function aiPick(hand, top, chosenColor) {
    const valid = hand.filter(c => canPlay(c, top, chosenColor));
    if (!valid.length) return null;
    const action = valid.find(c => ACTIONS.includes(c.val) || WILDS.includes(c.val));
    return action || valid[0];
}

function aiChooseColor(hand) {
    const counts = {};
    for (const c of hand) if (c.color !== 'wild') counts[c.color] = (counts[c.color] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || COLORS[Math.floor(Math.random() * 4)];
}

// ─── Render ───
export function renderNeonCards(container, onBack, multiplayer) {
    const isMp = !!multiplayer;
    const isHost = isMp ? multiplayer.isHost : true;
    const myId = isMp ? getUserId() : 'player';

    // Multiplayer state
    let hands = {}; // playerId -> card[]
    let playerIds = [];
    let playerNames = {};
    let currentTurnIdx = 0;
    let direction = 1;

    // Shared game state
    let deck, discard, chosenColor, gameOver, scores, reversed, skipNext, drawPending, choosingColor;
    let aiLock = false;
    let channel = null;

    function syncHostState() {
        if (isMp && isHost && channel) {
            channel.send({
                type: 'broadcast', event: 'init_state',
                payload: { deck, hands, playerIds, playerNames, discard, chosenColor, currentTurnIdx, direction, reversed, skipNext, drawPending }
            });
        }
    }

    function broadcastMove(moveData) {
        if (isMp && channel) {
            channel.send({ type: 'broadcast', event: 'move', payload: moveData });
        }
    }

    if (isMp) {
        channel = ogClient.channel('game-' + multiplayer.lobby.id);
        channel.on('broadcast', { event: 'init_state' }, (payload) => {
            const p = payload.payload;
            if (!isHost) {
                deck = p.deck; hands = p.hands; playerIds = p.playerIds;
                playerNames = p.playerNames; discard = p.discard;
                chosenColor = p.chosenColor; currentTurnIdx = p.currentTurnIdx;
                direction = p.direction; reversed = p.reversed;
                skipNext = p.skipNext; drawPending = p.drawPending;
                gameOver = false;
                render();
            }
        }).on('broadcast', { event: 'request_state' }, () => {
            if (isHost && hands && Object.keys(hands).length > 0) syncHostState();
        }).on('broadcast', { event: 'move' }, (payload) => {
            const p = payload.payload;
            applyMove(p);
        }).on('broadcast', { event: 'new_game' }, () => {
            if (isHost) { init(true); }
        }).subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                showToast('Connected to lobby! 🃏', 'success');
                if (isHost) {
                    setTimeout(() => syncHostState(), 400);
                } else {
                    const reqInt = setInterval(() => {
                        if (!deck) channel.send({ type: 'broadcast', event: 'request_state' });
                        else clearInterval(reqInt);
                    }, 1000);
                }
            }
        });
    }

    function applyMove(move) {
        if (isHost && move.type === 'action') {
            // Host executes guest's action
            if (move.action === 'play') {
                handlePlayCard(move.idx, true); // true = force execute as host
            } else if (move.action === 'drawPile') {
                handleDrawPile(true);
            } else if (move.action === 'color') {
                handleColorPick(move.color, true);
            }
        } else if (!isHost && move.type === 'sync_state') {
            // Guest blind-copies host state
            deck = move.deck; hands = move.hands; discard = move.discard;
            chosenColor = move.chosenColor; currentTurnIdx = move.currentTurnIdx;
            direction = move.direction; reversed = move.reversed;
            skipNext = move.skipNext; drawPending = move.drawPending;
            gameOver = move.gameOver || false;
            choosingColor = move.choosingColor || false;
            render();
        }
    }

    function pushStateToAll() {
        if (isMp && isHost && channel) {
            channel.send({
                type: 'broadcast', event: 'move',
                payload: {
                    type: 'sync_state',
                    deck, hands, discard, chosenColor, currentTurnIdx,
                    direction, reversed, skipNext, drawPending, gameOver, choosingColor
                }
            });
        }
    }

    function getTop() { return discard[discard.length - 1]; }

    function drawCard() {
        if (!deck.length) {
            const top = discard.pop();
            deck.push(...shuffle(discard));
            discard.length = 0;
            discard.push(top);
        }
        return deck.pop();
    }

    function advanceTurn(steps = 1) {
        const n = playerIds.length;
        for (let i = 0; i < steps; i++) {
            currentTurnIdx = ((currentTurnIdx + direction) % n + n) % n;
        }
    }

    function init(broadcastAfter = false) {
        deck = shuffle(makeDeck());
        discard = [];
        chosenColor = null;
        gameOver = false;
        reversed = false;
        skipNext = false;
        drawPending = 0;
        choosingColor = false;
        if (!scores) scores = { player: 0, ai: 0 };

        if (isMp) {
            playerIds = multiplayer.lobby.players.map(p => p.id);
            hands = {};
            playerNames = {};
            multiplayer.lobby.players.forEach(p => {
                playerNames[p.id] = p.name || 'Player';
                if (isHost) {
                    hands[p.id] = [];
                    for (let i = 0; i < 7; i++) hands[p.id].push(drawCard());
                }
            });
            currentTurnIdx = 0;
            direction = 1;
        } else {
            playerIds = ['player', 'ai'];
            playerNames = { player: 'You', ai: '🤖 AI' };
            hands = { player: [], ai: [] };
            for (let i = 0; i < 7; i++) { hands.player.push(drawCard()); hands.ai.push(drawCard()); }
            currentTurnIdx = 0;
            direction = 1;
        }

        let starter;
        do { starter = drawCard(); if (starter.color === 'wild') deck.unshift(starter); }
        while (starter.color === 'wild');
        discard.push(starter);
        chosenColor = starter.color;

        if (broadcastAfter) pushStateToAll();
        render();
    }

    function render() {
        const top = getTop();
        const tc = chosenColor || top.color;
        const activeId = playerIds[currentTurnIdx];
        const isMyTurn = !isMp ? activeId === 'player' : activeId === myId;
        const myHand = hands[isMp ? myId : 'player'] || [];
        const validCards = myHand.filter(c => canPlay(c, top, tc));

        const others = playerIds.filter(id => id !== (isMp ? myId : 'player'));

        container.innerHTML = `
      <div class="game-screen" style="background:linear-gradient(160deg,#0a0a0f,#130a1a,#0a0a0f);">
        <div class="game-screen-header">
          <button class="btn btn-ghost btn-sm" id="back-btn">← Back</button>
          <div class="game-screen-title">Neon Cards <span class="game-screen-badge ${isMp ? 'vs-player' : 'vs-ai'}">${isMp ? 'Multiplayer' : 'VS AI'}</span></div>
          ${!isMp ? `<button class="btn btn-ghost btn-sm" id="new-game-btn">New</button>` : ''}
        </div>

        <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px;overflow-y:auto;">

          <!-- Scorecard -->
          <div class="score-board">
            <div class="score-item"><div class="score-value player-score">${scores.player}</div><div class="score-label">You</div></div>
            <div class="score-divider"> — </div>
            <div class="score-item"><div class="score-value ai-score">${scores.ai}</div><div class="score-label">${isMp ? 'Opp' : '🤖 AI'}</div></div>
          </div>

          <!-- Other players (face-down) -->
          <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
            ${others.map(id => {
            const h = hands[id] || [];
            const isActive = id === activeId;
            return `<div style="text-align:center;">
                <div style="font-size:0.75rem;color:${isActive ? '#0af' : '#666'};margin-bottom:4px;">${escapeHtml(playerNames[id] || id)}${isActive ? ' 🔄' : ''}</div>
                <div style="display:flex;gap:2px;justify-content:center;">
                  ${h.map(() => `<div style="width:24px;height:36px;border-radius:4px;background:linear-gradient(135deg,#222,#1a0a2e);border:1px solid rgba(255,255,255,0.1);"></div>`).join('')}
                </div>
                <div style="font-size:0.7rem;color:#555;margin-top:2px;">${h.length} cards</div>
              </div>`;
        }).join('')}
          </div>

          <!-- Turn status -->
          <div style="font-size:0.88rem;font-weight:700;color:${isMyTurn ? '#0af' : '#ff2d55'};">
            ${gameOver ? 'Game Over' : isMyTurn ? '▶ Your turn' : (isMp ? `⏳ ${escapeHtml(playerNames[activeId] || '')}'s turn…` : '⚡ AI thinking…')}
            ${drawPending > 0 ? ` — Draw ${drawPending} cards first!` : ''}
          </div>

          <!-- Discard + Deck -->
          <div style="display:flex;gap:24px;align-items:center;">
            <div style="text-align:center;">
              <div style="font-size:0.7rem;color:#666;margin-bottom:4px;">DECK (${deck.length})</div>
              <div id="draw-pile" style="width:64px;height:92px;border-radius:10px;background:linear-gradient(135deg,#1a0a2e,#2a0a3e);border:2px solid rgba(138,43,226,0.5);cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1.4rem;color:#8e44ad;">NC</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:0.7rem;color:#666;margin-bottom:4px;">TOP CARD</div>
              <div style="width:64px;height:92px;border-radius:10px;background:${cardBg(top)};border:2px solid rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1.6rem;color:${cardText(top)};${tc !== top.color ? `outline:3px solid ${NEON[tc]};` : ''}">
                ${cardLabel(top)}
              </div>
              ${chosenColor && chosenColor !== top.color ? `<div style="font-size:0.75rem;margin-top:4px;color:${NEON[chosenColor]};">Color: ${chosenColor}</div>` : ''}
            </div>
          </div>

          <!-- Color picker for wild -->
          ${choosingColor && isMyTurn ? `
          <div style="background:rgba(255,255,255,0.05);padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);">
            <div style="font-size:0.85rem;font-weight:700;color:#ccc;margin-bottom:10px;text-align:center;">Choose a color</div>
            <div style="display:flex;gap:10px;justify-content:center;">
              ${COLORS.map(col => `<button id="pick-${col}" style="width:44px;height:44px;border-radius:50%;background:${NEON[col]};border:3px solid transparent;cursor:pointer;font-size:1.2rem;color:${col === 'yellow' || col === 'green' ? '#111' : '#fff'};" title="${col}"></button>`).join('')}
            </div>
          </div>` : ''}

          <!-- My hand -->
          <div style="background:rgba(255,255,255,0.03);border-radius:14px;padding:12px;border:1px solid rgba(255,255,255,0.06);width:100%;max-width:560px;">
            <div style="font-size:0.75rem;color:#666;margin-bottom:8px;text-align:center;">YOUR HAND (${myHand.length} cards)</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;">
              ${myHand.map((card, idx) => {
            const valid = validCards.includes(card) && isMyTurn && !choosingColor && !gameOver;
            return `<div class="nc-card ${valid ? 'nc-valid' : ''}" data-idx="${idx}" style="width:52px;height:76px;border-radius:8px;background:${cardBg(card)};border:2px solid ${valid ? '#fff' : 'rgba(255,255,255,0.15)'};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1.1rem;color:${cardText(card)};cursor:${valid ? 'pointer' : 'not-allowed'};opacity:${valid ? 1 : 0.45};transition:all 0.15s;box-shadow:${valid ? `0 0 12px ${cardBg(card)}88` : 'none'};">${cardLabel(card)}</div>`;
        }).join('')}
            </div>
          </div>

        </div>
      </div>
    `;

        container.querySelector('#back-btn').addEventListener('click', () => {
            if (channel) { channel.unsubscribe(); ogClient.removeChannel(channel); }
            onBack();
        });
        container.querySelector('#new-game-btn')?.addEventListener('click', () => {
            if (isMp && isHost) { channel.send({ type: 'broadcast', event: 'new_game' }); }
            init(isMp && isHost);
        });

        if (!choosingColor && isMyTurn) {
            container.querySelector('#draw-pile')?.addEventListener('click', handleDrawPile);
        }

        container.querySelectorAll('.nc-card.nc-valid').forEach(el => {
            el.addEventListener('mouseenter', () => el.style.transform = 'translateY(-8px)');
            el.addEventListener('mouseleave', () => el.style.transform = 'translateY(0)');
            el.addEventListener('click', () => handlePlayCard(parseInt(el.dataset.idx)));
        });

        COLORS.forEach(col => {
            container.querySelector(`#pick-${col}`)?.addEventListener('click', () => handleColorPick(col));
        });

        // AI turn (VS AI only)
        if (!isMp && activeId === 'ai' && !gameOver && !choosingColor && !aiLock) {
            aiLock = true;
            setTimeout(() => { aiLock = false; aiTurn(); }, 900);
        }
    }

    function handlePlayCard(idx, isHostExec = false) {
        const activeId = playerIds[currentTurnIdx];
        const isMyTurn = !isMp ? activeId === 'player' : activeId === myId;

        // If it's not our turn and this isn't the host blindly executing a guest command, abort
        if ((!isMyTurn && !isHostExec) || gameOver || choosingColor) return;

        // If we are a guest, just send the action to the host
        if (isMp && !isHost && !isHostExec) {
            channel.send({ type: 'broadcast', event: 'move', payload: { type: 'action', action: 'play', idx } });
            return;
        }

        const handToModify = hands[activeId]; // apply to active player's hand
        const card = handToModify[idx];
        const top = getTop();
        const tc = chosenColor || top.color;
        if (!canPlay(card, top, tc)) return;

        handToModify.splice(idx, 1);
        discard.push(card);
        chosenColor = null;

        if (card.color === 'wild') {
            choosingColor = true;
            if (isMp && isHost) pushStateToAll();
            render();
            return;
        }

        applyEffect(card);
        if (!handToModify.length) return endGame(activeId);

        advanceTurn();
        if (isMp && isHost) pushStateToAll();
        render();
    }

    function handleColorPick(color, isHostExec = false) {
        const activeId = playerIds[currentTurnIdx];
        const isMyTurn = !isMp ? activeId === 'player' : activeId === myId;

        if ((!isMyTurn && !isHostExec) || gameOver) return;

        if (isMp && !isHost && !isHostExec) {
            channel.send({ type: 'broadcast', event: 'move', payload: { type: 'action', action: 'color', color } });
            return;
        }

        const handToModify = hands[activeId];
        chosenColor = color;
        choosingColor = false;
        if (!handToModify.length) return endGame(activeId);
        advanceTurn();
        if (isMp && isHost) pushStateToAll();
        render();
    }

    function handleDrawPile(isHostExec = false) {
        const activeId = playerIds[currentTurnIdx];
        const isMyTurn = !isMp ? activeId === 'player' : activeId === myId;

        if ((!isMyTurn && !isHostExec) || gameOver || choosingColor) return;

        if (isMp && !isHost && !isHostExec) {
            channel.send({ type: 'broadcast', event: 'move', payload: { type: 'action', action: 'drawPile' } });
            return;
        }

        const handToModify = hands[activeId];

        if (drawPending > 0) {
            for (let i = 0; i < drawPending; i++) handToModify.push(drawCard());
            drawPending = 0;
            advanceTurn();
            if (isMp && isHost) pushStateToAll();
            render();
            return;
        }

        const drawn = drawCard();
        handToModify.push(drawn);
        if (!isHostExec || isMyTurn) showToast('Drew a card', 'info'); // Don't show host toast for guest
        const top = getTop();
        const tc = chosenColor || top.color;
        const valid = handToModify.filter(c => canPlay(c, top, tc));
        if (!valid.length) { advanceTurn(); }
        if (isMp && isHost) pushStateToAll();
        render();
    }

    function applyEffect(card) {
        const n = playerIds.length;
        if (card.val === 'skip') { advanceTurn(); }
        if (card.val === 'reverse') {
            direction *= -1;
            if (n === 2) advanceTurn(); // Reverse = Skip in 2-player
        }
        if (card.val === 'draw2') { drawPending = 2; }
        if (card.val === 'wild4') { drawPending = 4; }
    }

    function aiTurn() {
        const activeId = playerIds[currentTurnIdx];
        if (activeId !== 'ai' || gameOver) return;
        const aiHand = hands['ai'];

        if (drawPending > 0) {
            for (let i = 0; i < drawPending; i++) aiHand.push(drawCard());
            drawPending = 0;
            advanceTurn();
            render(); return;
        }

        if (skipNext) { skipNext = false; advanceTurn(); render(); return; }

        const top = getTop();
        const tc = chosenColor || top.color;
        const card = aiPick(aiHand, top, tc);

        if (!card) {
            aiHand.push(drawCard());
            advanceTurn();
            render(); return;
        }

        aiHand.splice(aiHand.indexOf(card), 1);
        discard.push(card);

        if (card.color === 'wild') { chosenColor = aiChooseColor(aiHand); }
        else { chosenColor = null; }

        applyEffect(card);
        if (!aiHand.length) return endGame('ai');

        advanceTurn();
        render();
    }

    function endGame(winnerId) {
        gameOver = true;
        const isMe = winnerId === (isMp ? myId : 'player') || winnerId === 'player';
        if (isMe) { scores.player++; triggerConfetti(); showToast('🎉 You win!', 'success'); }
        else { scores.ai++; showToast(`${isMp ? (escapeHtml(playerNames[winnerId] || '')) || 'Opponent' : '🤖 AI'} wins!`, 'error'); }
        if (isMp && isHost) pushStateToAll();
        render();

        setTimeout(() => {
            const div = document.createElement('div');
            div.innerHTML = `<div style="position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:100;">
            <div style="text-align:center;padding:40px;">
              <div style="font-size:3rem;margin-bottom:12px;">${isMe ? '🎉' : '💀'}</div>
              <div style="font-size:2rem;font-weight:900;margin-bottom:16px;">${isMe ? 'You Win!' : `${isMp ? (escapeHtml(playerNames[winnerId] || '')) || 'Opponent' : '🤖 AI'} Wins!`}</div>
              <div style="display:flex;gap:12px;justify-content:center;">
                ${(!isMp || isHost) ? `<button class="btn btn-primary" id="nc-rematch">Play Again</button>` : `<div style="color:var(--text-muted)">Waiting for host...</div>`}
                <button class="btn btn-ghost" id="nc-exit">Exit</button>
              </div>
            </div></div>`;
            document.body.appendChild(div);
            div.querySelector('#nc-rematch')?.addEventListener('click', () => {
                div.remove();
                if (isMp) channel.send({ type: 'broadcast', event: 'new_game' });
                init(isMp && isHost);
            });
            div.querySelector('#nc-exit').addEventListener('click', () => { div.remove(); onBack(); });
        }, 800);
    }

    // Boot
    if (!isMp || isHost) {
        init(false);
    } else {
        container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted);">🃏 Waiting for host to deal cards...</div>`;
    }
}
