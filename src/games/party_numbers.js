// src/games/party_numbers.js
// Party Zahlen-Rush: Battle Royale Memory-Sequenz für 30 Spieler

import { escapeHtml } from '../utils.js';
import { showToast } from '../ui/toast.js';
import { getUserId } from '../auth.js';

export function renderPartyNumbers(container, onBack) {
    const partyData = window._partyData;
    if (!partyData) { onBack(); return; }
    const { channel, code, isHost, members } = partyData;
    const myId = getUserId();
    const uids = Object.keys(members).sort();

    let playerMap = {};
    uids.forEach(uid => { playerMap[uid] = { username: members[uid].username, alive: true }; });

    let currentSequence = [];
    let roundNum = 0;
    let timerInterval = null;
    let timeLeft = 0;

    container.innerHTML = `
        <div class="game-screen" style="max-width:700px;margin:0 auto;height:100vh;display:flex;flex-direction:column;">
            <div class="game-screen-header">
                <button class="btn btn-ghost btn-sm" id="pn-back">← Leave</button>
                <div class="game-screen-title">🔢 Party Zahlen-Rush <span class="game-screen-badge vs-player">${code}</span></div>
                ${isHost ? `<button class="btn btn-sm btn-ghost danger" id="pn-force-end" style="margin-left:auto;">🛑 End Match</button>` : ''}
            </div>

            <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;gap:24px;">

                <div id="pn-status" style="font-size:1.3rem;font-weight:700;text-align:center;color:var(--primary-color);">
                    Waiting for host...
                </div>

                <div id="pn-sequence-display" style="display:none;background:var(--bg-card);border-radius:16px;padding:32px;font-size:clamp(1.5rem,5vw,3.5rem);font-weight:900;letter-spacing:12px;color:var(--primary-color);text-align:center;width:100%;border:2px solid var(--border-color);">
                </div>

                <div id="pn-timer" style="font-size:2.5rem;font-weight:900;color:var(--accent-color);display:none;"></div>

                <div id="pn-input-area" style="display:none;width:100%;gap:12px;display:flex;flex-direction:column;align-items:center;">
                    <p style="color:var(--text-secondary);">Tippe die Zahlen in der richtigen Reihenfolge:</p>
                    <input type="number" id="pn-answer-input" class="input-field" style="font-size:2rem;text-align:center;letter-spacing:8px;max-width:400px;" placeholder="z.B. 453">
                    <button class="btn btn-accent" id="pn-answer-submit" style="font-size:1.2rem;padding:12px 32px;">Bestätigen</button>
                </div>

                <div id="pn-eliminated" style="display:none;font-size:1.1rem;color:var(--text-muted);text-align:center;">
                    💀 Du bist ausgeschieden. Beobachte weiter...
                </div>

                <div style="width:100%;background:var(--bg-card);border-radius:12px;padding:16px;">
                    <h4 style="margin-bottom:8px;">Spieler</h4>
                    <div id="pn-player-list" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
                </div>

                ${isHost ? `
                <button class="btn btn-primary" id="pn-start-btn" style="font-size:1.1rem;padding:12px 32px;">▶ Spiel starten</button>
                ` : ''}
            </div>
        </div>
    `;

    const backBtn = container.querySelector('#pn-back');
    const forceEndBtn = container.querySelector('#pn-force-end');
    const statusDiv = container.querySelector('#pn-status');
    const seqDisplay = container.querySelector('#pn-sequence-display');
    const timerDiv = container.querySelector('#pn-timer');
    const inputArea = container.querySelector('#pn-input-area');
    const answerInput = container.querySelector('#pn-answer-input');
    const submitBtn = container.querySelector('#pn-answer-submit');
    const eliminatedDiv = container.querySelector('#pn-eliminated');
    const startBtn = container.querySelector('#pn-start-btn');
    const playerListDiv = container.querySelector('#pn-player-list');

    backBtn.addEventListener('click', () => { if (timerInterval) clearInterval(timerInterval); onBack(); });
    if (forceEndBtn) {
        forceEndBtn.addEventListener('click', () => {
            if (confirm('End match for everyone?')) {
                channel.send({ type: 'broadcast', event: 'force_game_end' });
                if (timerInterval) clearInterval(timerInterval);
                onBack();
            }
        });
    }

    channel.on('broadcast', { event: 'force_game_end' }, () => {
        showToast('Host ended the match.', 'info');
        if (timerInterval) clearInterval(timerInterval);
        onBack();
    });

    startBtn?.addEventListener('click', () => {
        if (!isHost) return;
        broadcastNewRound(1);
    });

    function broadcastNewRound(length) {
        const seq = Array.from({ length }, () => Math.floor(Math.random() * 10));
        channel.send({ type: 'broadcast', event: 'num_round_start', payload: { sequence: seq } });
        startRound(seq);
    }

    channel.on('broadcast', { event: 'num_round_start' }, ({ payload }) => {
        startRound(payload.sequence);
    });

    function startRound(seq) {
        if (timerInterval) clearInterval(timerInterval);
        currentSequence = seq;
        roundNum++;
        statusDiv.textContent = `Runde ${roundNum} — Merke die Folge!`;

        seqDisplay.style.display = 'block';
        seqDisplay.textContent = seq.join('  ');
        inputArea.style.display = 'none';
        timerDiv.style.display = 'none';
        if (answerInput) answerInput.value = '';

        renderPlayers();

        // Show it for 3 seconds, then hide and give time to type
        setTimeout(() => {
            if (!playerMap[myId].alive) return;
            seqDisplay.textContent = '?  ?  ?';
            seqDisplay.style.color = 'var(--text-muted)';
            statusDiv.textContent = 'Tippe die Zahlenfolge!';
            inputArea.style.display = 'flex';
            timerDiv.style.display = 'block';
            timeLeft = Math.max(8, 15 - Math.floor(seq.length / 2));
            timerDiv.textContent = timeLeft;

            timerInterval = setInterval(() => {
                timeLeft--;
                timerDiv.textContent = timeLeft;
                if (timeLeft <= 3) timerDiv.style.color = 'var(--red-primary)';
                if (timeLeft <= 0) {
                    clearInterval(timerInterval);
                    // Auto-submit empty if not answered
                    if (playerMap[myId].alive) {
                        channel.send({ type: 'broadcast', event: 'num_answer', payload: { uid: myId, answer: '', correct: false } });
                        eliminateMe();
                    }
                }
            }, 1000);
        }, 3000);
    }

    submitBtn?.addEventListener('click', () => {
        if (!playerMap[myId].alive) return;
        clearInterval(timerInterval);
        const typed = (answerInput.value || '').toString().replace(/\s/g, '');
        const correct_str = currentSequence.join('');
        const isCorrect = typed === correct_str;
        channel.send({ type: 'broadcast', event: 'num_answer', payload: { uid: myId, answer: typed, correct: isCorrect } });
        if (!isCorrect) {
            eliminateMe();
        } else {
            inputArea.style.display = 'none';
            statusDiv.textContent = '✅ Richtig! Warte auf andere...';
        }
    });

    let answersThisRound = {};

    channel.on('broadcast', { event: 'num_answer' }, ({ payload }) => {
        answersThisRound[payload.uid] = payload.correct;
        if (!payload.correct && playerMap[payload.uid]) {
            playerMap[payload.uid].alive = false;
        }
        renderPlayers();

        if (isHost) {
            const alivePlayers = uids.filter(u => playerMap[u].alive);
            const allAnswered = uids.every(u => !playerMap[u].alive || answersThisRound[u] !== undefined);

            if (alivePlayers.length === 0) {
                // All eliminated, game over
                channel.send({ type: 'broadcast', event: 'num_game_over', payload: { winnerId: null } });
                endGame(null);
            } else if (alivePlayers.length === 1 && uids.length > 1) {
                channel.send({ type: 'broadcast', event: 'num_game_over', payload: { winnerId: alivePlayers[0] } });
                endGame(alivePlayers[0]);
            } else if (allAnswered) {
                // Everyone answered, next round with longer sequence
                setTimeout(() => {
                    answersThisRound = {};
                    broadcastNewRound(currentSequence.length + 1);
                }, 3000);
            }
        }
    });

    channel.on('broadcast', { event: 'num_game_over' }, ({ payload }) => {
        endGame(payload.winnerId);
    });

    function eliminateMe() {
        if (!playerMap[myId].alive) return;
        playerMap[myId].alive = false;
        inputArea.style.display = 'none';
        timerDiv.style.display = 'none';
        eliminatedDiv.style.display = 'block';
        showToast('Falsch! Du bist ausgeschieden 💀', 'error');
        import('../ui/animations.js').then(({ playSound }) => playSound('error'));
        renderPlayers();
    }

    function endGame(winnerId) {
        if (timerInterval) clearInterval(timerInterval);
        seqDisplay.style.display = 'none';
        inputArea.style.display = 'none';
        timerDiv.style.display = 'none';

        if (winnerId) {
            statusDiv.innerHTML = `<span style="font-size:2rem;color:var(--primary-color)">🏆 ${escapeHtml(playerMap[winnerId].username)} GEWINNT!</span>`;
            if (winnerId === myId) import('../ui/animations.js').then(({ triggerConfetti }) => triggerConfetti());
        } else {
            statusDiv.innerHTML = `<span style="font-size:2rem;color:var(--red-primary)">💀 Alle ausgeschieden!</span>`;
        }

        if (isHost && startBtn) {
            startBtn.style.display = 'inline-block';
            startBtn.textContent = '🔄 Neues Spiel';
        }
    }

    function renderPlayers() {
        playerListDiv.innerHTML = uids.map(uid => {
            const p = playerMap[uid];
            return `<div style="padding:4px 12px;border-radius:100px;background:var(--bg-elevated);opacity:${p.alive ? '1' : '0.3'};border:1px solid ${p.alive ? 'var(--primary-color)' : 'transparent'};font-size:0.85rem;">
                ${escapeHtml(p.username)} ${p.alive ? '🟢' : '💀'}
            </div>`;
        }).join('');
    }

    renderPlayers();
}
