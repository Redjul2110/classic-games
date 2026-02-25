// src/games/cardclash.js  
// Card Clash (UNO-style) – smart rule-based AI

import { showToast } from '../ui/toast.js';
import { getDisplayName, getUserId } from '../auth.js';
import { ogClient } from '../supabase.js';
import { escapeHtml } from '../utils.js';

const COLORS = ['red', 'blue', 'green', 'yellow'];
const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Skip', 'Reverse', 'Draw2'];
const WILDS = ['Wild', 'Wild4'];

function buildDeck() {
  const deck = [];
  for (const color of COLORS) {
    for (const val of VALUES) {
      deck.push({ color, value: val });
      if (val !== '0') deck.push({ color, value: val });
    }
  }
  for (const wild of WILDS) {
    for (let i = 0; i < 4; i++) deck.push({ color: 'wild', value: wild });
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

function cardCSSClass(card) {
  const map = { red: 'red-card', blue: 'blue-card', green: 'green-card', yellow: 'yellow-card', wild: 'wild-card' };
  return map[card.color] || 'wild-card';
}

function cardLabel(card) {
  const icons = { Wild: '[WILD]', Wild4: '[WILD]+4', Skip: '⊘', Reverse: '⇄', Draw2: '+2' };
  return icons[card.value] || card.value;
}

export function renderCardClash(container, onBack, multiplayer) {
  const isMp = !!multiplayer;
  const isHost = isMp ? multiplayer.isHost : true;

  let deck = [];
  let hands = {}; // ownerId -> array of cards
  let playerIds = []; // ordered list of player IDs
  let playerNames = {}; // ownerId -> display name
  let discardPile = [];
  let currentColor = '';
  let gameOver = false;

  let currentTurnIdx = 0; // index into playerIds
  let direction = 1; // 1 = clockwise, -1 = reverse

  let skipAI = false;
  let aiMovePending = false;

  let channel = null;
  const myId = isMp ? getUserId() : 'player';

  function initGame(broadcast = false) {
    deck = shuffle(buildDeck());
    const draw1 = () => deck.length > 0 ? deck.pop() : { color: 'red', value: '0' };

    hands = {};
    playerNames = {};

    if (isMp) {
      playerIds = multiplayer.lobby.players.map(p => p.id);
      multiplayer.lobby.players.forEach(p => {
        playerNames[p.id] = p.name || 'Player';
      });
      if (isHost) {
        playerIds.forEach(id => {
          hands[id] = [draw1(), draw1(), draw1(), draw1(), draw1(), draw1(), draw1()];
        });
        currentTurnIdx = 0;
        direction = 1;

        let firstCard;
        do { firstCard = draw1(); } while (firstCard.color === 'wild');
        discardPile = [firstCard];
        currentColor = firstCard.color;

        if (broadcast) syncHostState();
      }
    } else {
      playerIds = ['player', 'ai'];
      playerNames = { 'player': 'You', 'ai': 'AI' };
      hands['player'] = [draw1(), draw1(), draw1(), draw1(), draw1(), draw1(), draw1()];
      hands['ai'] = [draw1(), draw1(), draw1(), draw1(), draw1(), draw1(), draw1()];
      currentTurnIdx = 0;
      direction = 1;

      let firstCard;
      do { firstCard = draw1(); } while (firstCard.color === 'wild');
      discardPile = [firstCard];
      currentColor = firstCard.color;
    }

    gameOver = false;
    aiMovePending = false;
  }

  function syncHostState() {
    if (isMp && isHost && channel) {
      channel.send({
        type: 'broadcast',
        event: 'init_state',
        payload: { deck, hands, playerIds, playerNames, discardPile, currentColor, currentTurnIdx, direction }
      });
    }
  }

  if (isMp) {
    channel = ogClient.channel('game-' + multiplayer.lobby.id);
    channel.on('broadcast', { event: 'init_state' }, (payload) => {
      if (!isHost) {
        const p = payload.payload;
        deck = p.deck;
        hands = p.hands;
        playerIds = p.playerIds;
        playerNames = p.playerNames;
        discardPile = p.discardPile;
        currentColor = p.currentColor;
        currentTurnIdx = p.currentTurnIdx;
        direction = p.direction;
        gameOver = false;
        render();
      }
    }).on('broadcast', { event: 'request_state' }, () => {
      // A new guest is asking for state – host responds immediately
      if (isHost && hands && Object.keys(hands).length > 0) {
        syncHostState();
      }
    }).on('broadcast', { event: 'move' }, (payload) => {
      const { action, cardIdx, colorChosen, whoId } = payload.payload;
      if (whoId === myId) return; // Prevent double execution of perfectly synced local moves
      if (action === 'draw') {
        executeDraw(whoId);
      } else if (action === 'play') {
        executePlay(cardIdx, whoId, colorChosen);
      }
    }).on('broadcast', { event: 'new_game' }, () => {
      if (isHost) {
        initGame(true);
        render();
      }
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        showToast('Connected to lobby! 🃏', 'success');
        if (isHost) {
          // Host initialises and sends state with a small delay so all guests are connected
          setTimeout(() => syncHostState(), 400);
        } else {
          // Guest: request state from host in case they missed the initial broadcast
          setTimeout(() => {
            channel.send({ type: 'broadcast', event: 'request_state' });
          }, 600);
        }
      }
    });
  }

  const draw1 = () => deck.length > 0 ? deck.pop() : { color: 'red', value: '0' };

  function topCard() { return discardPile[discardPile.length - 1]; }

  function canPlay(card) {
    const top = topCard();
    if (card.color === 'wild') return true;
    return card.color === currentColor || card.value === top.value;
  }

  function handleExit() {
    if (channel) { channel.unsubscribe(); ogClient.removeChannel(channel); }
    onBack();
  }

  function render() {
    if (!discardPile.length) {
      container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted);">Waiting for host to deal cards...</div>`;
      return;
    }
    const top = topCard();

    // Determine whose turn it is
    const activeId = playerIds[currentTurnIdx];
    const isMyTurn = activeId === myId;
    const activeName = playerNames[activeId];

    // Other players
    const others = playerIds.filter(id => id !== myId);

    container.innerHTML = `
      <div class="game-screen">
        <div class="game-screen-header">
          <button class="btn btn-ghost btn-sm" id="back-btn">← Back</button>
          <div class="game-screen-title">Card Clash <span class="game-screen-badge ${isMp ? 'vs-player' : 'vs-ai'}">${isMp ? 'Multiplayer' : 'VS AI'}</span></div>
        </div>
        <div class="card-game-area" style="position:relative;">
          
          <div style="display:flex;gap:12px;overflow-x:auto;width:100%;justify-content:center;margin-bottom:10px;padding:8px 0;">
            ${others.map(id => `
                <div style="background:var(--bg-card);padding:8px 16px;border-radius:12px;border:1px solid ${id === activeId ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)'};text-align:center;min-width:100px;">
                    <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:4px;">${escapeHtml(playerNames[id] || '')} ${id === activeId ? '🔄' : ''}</div>
                    <div style="font-size:1.1rem;font-weight:700;">${hands[id].length} 🃏</div>
                </div>
            `).join('')}
          </div>

          <div class="card-pile-area" style="margin: 20px 0;">
            <div class="playing-card card-back" style="user-select:none;">🂠</div>
            <div class="playing-card ${cardCSSClass(top)}" style="cursor:default;">
              ${cardLabel(top)}
            </div>
            <div style="text-align:center;">
              <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">Color</div>
              <div style="width:28px;height:28px;border-radius:50%;background:${currentColor === 'wild' ? '#8e44ad' : currentColor};margin:0 auto;border:2px solid rgba(255,255,255,0.3);"></div>
            </div>
          </div>
          
          <div style="font-size:0.88rem;font-weight:700;color:${isMyTurn ? 'var(--primary-color)' : 'var(--text-secondary)'};margin-bottom:12px;text-align:center;">
            ${isMyTurn ? '👤 Your turn — play or draw' : `⏳ ${escapeHtml(activeName)} is playing… (${direction === 1 ? '▶' : '◀'})`}
          </div>
          
          <div class="player-hand" id="player-hand">
            ${(hands[myId] || []).map((card, i) => {
      const playable = canPlay(card) && isMyTurn && !gameOver;
      return `<div class="playing-card in-hand ${cardCSSClass(card)} ${!playable ? 'opacity-50' : ''}"
                        style="${!playable ? 'opacity:0.35;' : ''}"
                        data-idx="${i}" title="${card.color} ${card.value}">
                        ${cardLabel(card)}
                      </div>`;
    }).join('')}
            ${isMyTurn ? `<div class="playing-card card-back" id="draw-card-btn" title="Draw a card" style="opacity:0.7;font-size:0.7rem;display:flex;align-items:center;justify-content:center;">Draw</div>` : ''}
          </div>
          
          <div style="color:var(--text-muted);font-size:0.75rem;margin-top:10px;text-align:center;">
            Your cards: ${(hands[myId] || []).length} | Deck: ${deck.length}
          </div>
        </div>
      </div>
    `;

    container.querySelector('#back-btn').addEventListener('click', handleExit);

    // Draw card
    container.querySelector('#draw-card-btn')?.addEventListener('click', () => {
      if (isMp && channel) { channel.send({ type: 'broadcast', event: 'move', payload: { action: 'draw', whoId: myId } }); }
      executeDraw(myId);
    });

    // Play card
    container.querySelectorAll('#player-hand [data-idx]').forEach(btn => {
      const idx = parseInt(btn.dataset.idx);
      const card = hands[myId][idx];
      if (canPlay(card) && isMyTurn && !gameOver) {
        btn.addEventListener('click', () => {
          let colorChosen = null;
          if (card.color === 'wild') {
            const colorCounts = {};
            hands[myId].forEach(c => { if (c.color !== 'wild') colorCounts[c.color] = (colorCounts[c.color] || 0) + 1; });
            colorChosen = Object.entries(colorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || COLORS[Math.floor(Math.random() * 4)];
          }
          if (isMp && channel) { channel.send({ type: 'broadcast', event: 'move', payload: { action: 'play', cardIdx: idx, colorChosen, whoId: myId } }); }
          executePlay(idx, myId, colorChosen);
        });
      }
    });
  }

  function advanceTurn(skipAmount = 1) {
    for (let i = 0; i < skipAmount; i++) {
      currentTurnIdx = (currentTurnIdx + direction + playerIds.length) % playerIds.length;
    }
  }

  function executeDraw(whoId) {
    if (gameOver) return;
    hands[whoId].push(draw1());

    advanceTurn(1);

    render();
    if (!isMp && playerIds[currentTurnIdx] === 'ai') {
      aiMovePending = true;
      setTimeout(() => { aiMovePending = false; aiTurn(); }, 900);
    }
  }

  function executePlay(idx, whoId, colorChosen = null) {
    if (gameOver) return;
    const card = hands[whoId].splice(idx, 1)[0];

    discardPile.push(card);
    if (card.color !== 'wild') currentColor = card.color;
    else if (colorChosen) currentColor = colorChosen;
    else currentColor = COLORS[Math.floor(Math.random() * 4)];

    let skipCount = 1; // normally advance by 1

    if (card.value === 'Reverse') {
      if (playerIds.length === 2) {
        skipCount = 2; // In 2-player, reverse acts as a skip
      } else {
        direction *= -1; // change rotation
        skipCount = 1;
      }
    }

    if (card.value === 'Skip') { skipCount = 2; }

    // Process draws BEFORE turn advancement so the next player gets them
    let nextPlayerIdx = (currentTurnIdx + direction * skipCount + playerIds.length) % playerIds.length;
    let nextPlayerId = playerIds[nextPlayerIdx];

    if (card.value === 'Draw2') {
      for (let i = 0; i < 2; i++) hands[nextPlayerId].push(draw1());
      skipCount = 2; // Also skip their turn after drawing!
    }
    if (card.value === 'Wild4') {
      for (let i = 0; i < 4; i++) hands[nextPlayerId].push(draw1());
      skipCount = 2;
    }

    if (hands[whoId].length === 1) showToast(`${playerNames[whoId]} has 1 card left! [CARD]`, whoId === myId ? 'info' : 'error');

    if (hands[whoId].length === 0) return endGame(whoId);

    advanceTurn(skipCount);
    render();

    if (!isMp && playerIds[currentTurnIdx] === 'ai') {
      aiMovePending = true;
      setTimeout(() => { aiMovePending = false; aiTurn(); }, 1000);
    }
  }

  function aiTurn() {
    if (gameOver || isMp || playerIds[currentTurnIdx] !== 'ai') return;
    const playable = hands['ai'].filter(c => canPlay(c));
    let chosen = null;

    if (playable.length > 0) {
      const actionCards = playable.filter(c => ['Skip', 'Reverse', 'Draw2', 'Wild4'].includes(c.value));
      const colorMatch = playable.filter(c => c.color === currentColor && c.color !== 'wild');
      const wilds = playable.filter(c => c.color === 'wild');

      if (actionCards.length > 0) chosen = actionCards[0];
      else if (colorMatch.length > 0) chosen = colorMatch[Math.floor(Math.random() * colorMatch.length)];
      else chosen = wilds[0] || playable[0];

      const idx = hands['ai'].indexOf(chosen);
      let colorChosen = null;
      if (chosen.color === 'wild') {
        const colorCounts = {};
        hands['ai'].forEach(c => { if (c.color !== 'wild') colorCounts[c.color] = (colorCounts[c.color] || 0) + 1; });
        colorChosen = Object.entries(colorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || COLORS[Math.floor(Math.random() * 4)];
      }

      executePlay(idx, 'ai', colorChosen);
    } else {
      executeDraw('ai');
    }
  }

  function endGame(winnerId) {
    gameOver = true;
    render();
    const isMe = winnerId === myId;
    const msg = isMe ? 'You win! ★' : `${escapeHtml(playerNames[winnerId] || '')} wins! 🏆`;
    if (isMe) import('../ui/animations.js').then(({ triggerConfetti }) => triggerConfetti());
    showToast(msg, isMe ? 'success' : 'error');
    setTimeout(() => {
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:100;">
          <div style="text-align:center;padding:40px;">
            <div style="font-size:3rem;margin-bottom:12px;">${isMe ? '★' : '😔'}</div>
            <div style="font-size:2rem;font-weight:900;margin-bottom:16px;">${msg}</div>
            <div style="display:flex;gap:12px;justify-content:center;">
              ${(!isMp || isHost) ? `<button class="btn btn-primary" id="restart-cc">Play Again</button>` : `<div style="color:var(--text-muted)">Waiting for host...</div>`}
              <button class="btn btn-ghost" id="exit-cc">Exit</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(el);
      const resBtn = el.querySelector('#restart-cc');
      if (resBtn) {
        resBtn.addEventListener('click', () => {
          el.remove();
          if (isMp && channel) channel.send({ type: 'broadcast', event: 'new_game' });
          initGame(true);
          render();
        });
      }
      el.querySelector('#exit-cc').addEventListener('click', () => { el.remove(); handleExit(); });
    }, 1000);
  }

  // Only host initializes — guest waits for init_state broadcast
  if (!isMp || isHost) {
    initGame(false); // host deals, waits for SUBSCRIBED before broadcasting
    render();
  } else {
    // Guests see a loading screen until the host sends init_state
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted);">🃏 Waiting for host to deal cards...</div>`;
  }
}
