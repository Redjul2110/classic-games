// src/games/party_highlow.js
// Party Higher or Lower — Battle Royale card game for up to 30 players

import { escapeHtml } from '../utils.js';
import { showToast } from '../ui/toast.js';
import { getUserId } from '../auth.js';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

function randomCard() {
    return { suit: SUITS[Math.floor(Math.random() * SUITS.length)], rank: RANKS[Math.floor(Math.random() * RANKS.length)] };
}
function cardValue(card) { return RANK_VALUES[card.rank]; }
function isRed(card) { return card.suit === '♥' || card.suit === '♦'; }

export function renderPartyHighLow(container, onBack) {
    const partyData = window._partyData;
    if (!partyData) { onBack(); return; }
    const { channel, code, isHost, members } = partyData;
    const myId = getUserId();
    const uids = Object.keys(members).sort();

    let playerMap = {};
    uids.forEach(uid => { playerMap[uid] = { username: members[uid].username, alive: true }; });

    let currentCard = null;
    let roundNum = 0;
    let myGuess = null;
    let timerInterval = null;
    let timeLeft = 0;
    let answersThisRound = {};
    let roundActive = false;

    container.innerHTML = `
        <div class="game-screen" style="max-width:700px;margin:0 auto;height:100vh;display:flex;flex-direction:column;">
            <div class="game-screen-header">
                <button class="btn btn-ghost btn-sm" id="hl-back">← Leave</button>
                <div class="game-screen-title">⬆️⬇️ Higher or Lower <span class="game-screen-badge vs-player">${code}</span></div>
                ${isHost ? `<button class="btn btn-sm btn-ghost danger" id="hl-force-end" style="margin-left:auto;">🛑 End Match</button>` : '<div style="margin-left:auto;"></div>'}
            </div>

            <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;gap:20px;">

                <div id="hl-status" style="font-size:1.3rem;font-weight:700;text-align:center;color:var(--primary-color);">
                    Waiting for host...
                </div>

                <div style="display:flex;align-items:center;gap:32px;">
                    <div id="hl-current-card" style="width:120px;height:170px;border-radius:16px;background:white;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 8px 32px rgba(0,0,0,0.4);font-size:2.5rem;font-weight:900;display:none;border:2px solid #ccc;"></div>
                    <div style="font-size:2rem;color:var(--text-muted);">→</div>
                    <div style="width:120px;height:170px;border-radius:16px;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 32px rgba(0,0,0,0.3);border:2px dashed var(--border-color);">
                        <span style="font-size:3rem;color:var(--text-muted);">?</span>
                    </div>
                </div>

                <div id="hl-timer" style="font-size:2.5rem;font-weight:900;color:var(--accent-color);display:none;">10</div>

                <div id="hl-guess-btns" style="gap:16px;display:none;">
                    <button class="btn btn-primary" id="hl-higher" style="font-size:1.2rem;padding:16px 32px;">⬆️ Higher</button>
                    <button class="btn btn-secondary" id="hl-lower" style="font-size:1.2rem;padding:16px 32px;">⬇️ Lower</button>
                </div>

                <div id="hl-waiting" style="display:none;color:var(--text-secondary);font-size:1rem;">⏳ Waiting for others...</div>

                <div id="hl-eliminated" style="display:none;color:var(--text-muted);text-align:center;font-size:1rem;">
                    💀 You've been eliminated! Keep watching...
                </div>

                <div style="width:100%;background:var(--bg-card);border-radius:12px;padding:16px;">
                    <h4 style="margin-bottom:8px;">Players</h4>
                    <div id="hl-player-list" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
                </div>

                ${isHost ? `<button class="btn btn-primary" id="hl-start-btn" style="font-size:1.1rem;padding:12px 32px;">▶ Start Game</button>` : ''}
            </div>
        </div>
    `;

    const backBtn = container.querySelector('#hl-back');
    const forceEndBtn = container.querySelector('#hl-force-end');
    const statusDiv = container.querySelector('#hl-status');
    const cardDiv = container.querySelector('#hl-current-card');
    const timerDiv = container.querySelector('#hl-timer');
    const guessBtns = container.querySelector('#hl-guess-btns');
    const higherBtn = container.querySelector('#hl-higher');
    const lowerBtn = container.querySelector('#hl-lower');
    const waitingDiv = container.querySelector('#hl-waiting');
    const eliminatedDiv = container.querySelector('#hl-eliminated');
    const startBtn = container.querySelector('#hl-start-btn');
    const playerListDiv = container.querySelector('#hl-player-list');

    backBtn.addEventListener('click', () => { stopTimer(); onBack(); });
    if (forceEndBtn) {
        forceEndBtn.addEventListener('click', () => {
            if (confirm('End match for everyone?')) {
                channel.send({ type: 'broadcast', event: 'force_game_end' });
                stopTimer(); onBack();
            }
        });
    }
    channel.on('broadcast', { event: 'force_game_end' }, () => {
        showToast('Host ended the match.', 'info');
        stopTimer(); onBack();
    });

    function stopTimer() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }

    startBtn?.addEventListener('click', () => {
        if (!isHost) return;
        startBtn.style.display = 'none';
        const card = randomCard();
        channel.send({ type: 'broadcast', event: 'hl_round_start', payload: { card } });
        startRound(card);
    });

    channel.on('broadcast', { event: 'hl_round_start' }, ({ payload }) => {
        if (startBtn) startBtn.style.display = 'none';
        startRound(payload.card);
    });

    function startRound(card) {
        stopTimer();
        currentCard = card;
        myGuess = null;
        answersThisRound = {};
        roundActive = true;
        roundNum++;

        renderCard(card);
        cardDiv.style.display = 'flex';
        statusDiv.textContent = `Round ${roundNum} — Higher or Lower?`;
        eliminatedDiv.style.display = 'none';

        if (playerMap[myId]?.alive) {
            guessBtns.style.display = 'flex';
            waitingDiv.style.display = 'none';
        }

        timerDiv.style.display = 'block';
        timerDiv.style.color = 'var(--accent-color)';
        timeLeft = 10;
        timerDiv.textContent = timeLeft;

        timerInterval = setInterval(() => {
            timeLeft--;
            timerDiv.textContent = timeLeft;
            if (timeLeft <= 3) timerDiv.style.color = '#FF3B30';
            if (timeLeft <= 0) {
                stopTimer();
                // if still alive and no guess, submit null (timeout)
                if (playerMap[myId]?.alive && myGuess === null) {
                    sendGuess(null);
                } else if (!playerMap[myId]?.alive) {
                    // already dead, host must still check if everyone answered
                    checkAllAnswered();
                }
            }
        }, 1000);

        renderPlayers();
    }

    function renderCard(card) {
        const red = isRed(card);
        cardDiv.style.color = red ? '#E74C3C' : '#2C3E50';
        cardDiv.innerHTML = `<div style="font-size:3rem;line-height:1;">${card.rank}</div><div style="font-size:1.5rem;">${card.suit}</div>`;
    }

    higherBtn?.addEventListener('click', () => { if (roundActive && playerMap[myId]?.alive && myGuess === null) sendGuess('higher'); });
    lowerBtn?.addEventListener('click', () => { if (roundActive && playerMap[myId]?.alive && myGuess === null) sendGuess('lower'); });

    function sendGuess(g) {
        if (myGuess !== null) return; // already sent
        myGuess = g;
        guessBtns.style.display = 'none';
        waitingDiv.style.display = 'block';
        channel.send({ type: 'broadcast', event: 'hl_guess', payload: { uid: myId, guess: g } });
    }

    channel.on('broadcast', { event: 'hl_guess' }, ({ payload }) => {
        answersThisRound[payload.uid] = payload.guess;
        checkAllAnswered();
    });

    function checkAllAnswered() {
        if (!isHost || !roundActive) return;
        const alivePlayers = uids.filter(u => playerMap[u]?.alive);
        // All alive players must have answered (or timed out = null)
        const allDone = alivePlayers.every(u => answersThisRound[u] !== undefined);
        if (allDone) {
            stopTimer();
            const next = randomCard();
            channel.send({ type: 'broadcast', event: 'hl_reveal', payload: { nextCard: next, answers: answersThisRound } });
            revealResult(next, answersThisRound);
        }
    }

    channel.on('broadcast', { event: 'hl_reveal' }, ({ payload }) => {
        revealResult(payload.nextCard, payload.answers);
    });

    function revealResult(next, answers) {
        stopTimer();
        roundActive = false;
        timerDiv.style.display = 'none';

        const currVal = cardValue(currentCard);
        const nextVal = cardValue(next);
        const correctGuess = nextVal > currVal ? 'higher' : (nextVal < currVal ? 'lower' : null);

        statusDiv.textContent = `Next card: ${next.rank}${next.suit} — ${correctGuess ? (correctGuess === 'higher' ? 'Higher! ⬆️' : 'Lower! ⬇️') : 'Same! 🤝'}`;

        uids.forEach(uid => {
            if (!playerMap[uid]?.alive) return;
            const g = answers[uid];
            // null = timed out or no answer => eliminated
            if (g === null || g === undefined || (correctGuess !== null && g !== correctGuess)) {
                playerMap[uid].alive = false;
            }
        });

        // Show if I'm eliminated
        if (!playerMap[myId]?.alive) {
            eliminatedDiv.style.display = 'block';
            guessBtns.style.display = 'none';
            waitingDiv.style.display = 'none';
        }

        renderPlayers();
        renderCard(next);

        const alive = uids.filter(u => playerMap[u]?.alive);

        setTimeout(() => {
            if (alive.length === 0) {
                channel.send({ type: 'broadcast', event: 'hl_game_over', payload: { winnerId: null } });
                endGame(null);
            } else if (alive.length === 1 && uids.length > 1) {
                channel.send({ type: 'broadcast', event: 'hl_game_over', payload: { winnerId: alive[0] } });
                endGame(alive[0]);
            } else if (isHost) {
                channel.send({ type: 'broadcast', event: 'hl_round_start', payload: { card: next } });
                startRound(next);
            }
        }, 3000);
    }

    channel.on('broadcast', { event: 'hl_game_over' }, ({ payload }) => { endGame(payload.winnerId); });

    function endGame(winnerId) {
        stopTimer();
        roundActive = false;
        guessBtns.style.display = 'none';
        timerDiv.style.display = 'none';
        waitingDiv.style.display = 'none';

        if (winnerId) {
            const name = escapeHtml(playerMap[winnerId]?.username || '?');
            statusDiv.innerHTML = `<span style="font-size:2rem;color:var(--primary-color)">🏆 ${name} WINS!</span>`;
            if (winnerId === myId) import('../ui/animations.js').then(({ triggerConfetti }) => triggerConfetti());
        } else {
            statusDiv.innerHTML = `<span style="font-size:2rem;color:#FF3B30">💀 Everyone eliminated!</span>`;
        }

        if (isHost && startBtn) {
            startBtn.style.display = 'inline-block';
            startBtn.textContent = '🔄 Play Again';
        }
    }

    function renderPlayers() {
        playerListDiv.innerHTML = uids.map(uid => {
            const p = playerMap[uid];
            return `<div style="padding:4px 12px;border-radius:100px;background:var(--bg-elevated);opacity:${p.alive ? '1' : '0.35'};border:1px solid ${p.alive ? 'var(--primary-color)' : 'transparent'};font-size:0.85rem;">
                ${escapeHtml(p.username)} ${p.alive ? '🟢' : '💀'}
            </div>`;
        }).join('');
    }

    renderPlayers();
}
