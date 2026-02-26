// src/games/party_draw.js
// Party Draw (Pictionary) for up to 30 players

import { escapeHtml } from '../utils.js';
import { showToast } from '../ui/toast.js';
import { getUserId } from '../auth.js';

const WORDS = [
    'Cat', 'Dog', 'Pizza', 'Car', 'Airplane', 'Tree', 'House', 'Bicycle', 'Fish', 'Bird',
    'Book', 'Glasses', 'Computer', 'Phone', 'Guitar', 'Camera', 'Banana', 'Apple', 'Sun', 'Moon',
    'Scissors', 'Pencil', 'Hat', 'Shoe', 'Ball', 'Candle', 'Key', 'Lamp', 'Clock', 'Mirror',
    'Rocket', 'Kite', 'Rainbow', 'Lightning', 'Wave', 'Mountain', 'Bridge', 'Lighthouse', 'Tent', 'Fire',
    'Monkey', 'Elephant', 'Penguin', 'Crocodile', 'Horse', 'Owl', 'Shark', 'Bear', 'Frog', 'Butterfly'
];

export function renderPartyDraw(container, onBack) {
    const partyData = window._partyData;
    if (!partyData) { onBack(); return; }
    const { channel, code, isHost, members } = partyData;
    const myId = getUserId();
    const uids = Object.keys(members).sort();

    let drawerIndex = 0;
    let drawerId = uids[0];
    let currentWord = '';
    let roundTimer = null;
    let timeLeft = 60;
    let roundScores = {};
    let totalScores = {};
    let roundNum = 0;
    let isDrawingPhase = false;
    let isDrawing = false;
    let lastX = 0, lastY = 0;
    let allWords = [];

    uids.forEach(uid => { totalScores[uid] = 0; });

    container.innerHTML = `
        <div class="game-screen" style="max-width:960px;margin:0 auto;display:flex;flex-direction:column;height:100vh;">
            <div class="game-screen-header">
                <button class="btn btn-ghost btn-sm" id="pd-back">← Leave</button>
                <div class="game-screen-title">🎨 Party Draw <span class="game-screen-badge vs-player">${code}</span></div>
                ${isHost ? `<button class="btn btn-sm btn-ghost danger" id="pd-force-end" style="margin-left:auto;">🛑 End Match</button>` : '<div style="margin-left:auto;"></div>'}
            </div>

            <div style="flex:1;display:flex;flex-wrap:wrap;gap:12px;padding:12px;overflow:auto;align-items:flex-start;">

                <!-- Canvas + tools (main area) -->
                <div style="flex:1;min-width:min(100%,300px);display:flex;flex-direction:column;gap:8px;">
                    <div id="pd-status" style="font-size:1rem;font-weight:700;text-align:center;">Waiting for host to start...</div>
                    <div id="pd-timer" style="font-size:1.8rem;font-weight:900;color:var(--accent-color);text-align:center;min-height:2rem;"></div>
                    <div id="pd-word-display" style="text-align:center;font-size:1rem;font-weight:bold;min-height:1.4rem;"></div>
                    <div style="position:relative;width:100%;aspect-ratio:4/3;min-height:200px;">
                        <canvas id="pd-canvas" style="width:100%;height:100%;border:2px solid var(--border-color);border-radius:8px;background:white;touch-action:none;display:block;"></canvas>
                    </div>
                    <div id="pd-tools" style="display:none;gap:8px;flex-wrap:wrap;align-items:center;justify-content:center;">
                        <input type="color" id="pd-colorpicker" value="#000000" style="width:40px;height:40px;border:none;border-radius:4px;cursor:pointer;">
                        <input type="range" id="pd-brushsize" min="2" max="30" value="6" style="width:100px;height:24px;">
                        <button class="btn btn-sm btn-secondary" id="pd-eraser" style="min-height:40px;">🧹 Eraser</button>
                        <button class="btn btn-sm btn-secondary" id="pd-clear" style="min-height:40px;">🗑️ Clear</button>
                    </div>
                    <div id="pd-guess-area" style="display:none;gap:8px;">
                        <input type="text" id="pd-guess-input" class="input-field" placeholder="Type your guess..." autocomplete="off" style="flex:1;min-height:44px;">
                        <button class="btn btn-primary" id="pd-guess-send" style="min-height:44px;min-width:72px;">Guess!</button>
                    </div>
                </div>

                <!-- Side panel: scores + guesses + start -->
                <div style="width:min(100%,220px);display:flex;flex-direction:column;gap:8px;">
                    <div style="background:var(--bg-card);border-radius:12px;padding:12px;border:1px solid rgba(255,255,255,0.1);">
                        <h4 style="margin-bottom:8px;">Scores</h4>
                        <div id="pd-scores" style="display:flex;flex-direction:column;gap:4px;"></div>
                    </div>
                    <div style="background:var(--bg-card);border-radius:12px;padding:12px;border:1px solid rgba(255,255,255,0.1);flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:120px;">
                        <h4 style="margin-bottom:8px;">Guesses</h4>
                        <div id="pd-guesses" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:4px;font-size:0.85rem;"></div>
                    </div>
                    ${isHost ? `<button class="btn btn-accent" id="pd-start-btn" style="min-height:44px;">▶ Start Game</button>` : ''}
                </div>
            </div>
        </div>
    `;

    const backBtn = container.querySelector('#pd-back');
    const forceEndBtn = container.querySelector('#pd-force-end');
    const canvas = container.querySelector('#pd-canvas');
    const ctx = canvas.getContext('2d');
    const statusDiv = container.querySelector('#pd-status');
    const timerDiv = container.querySelector('#pd-timer');
    const wordDisplay = container.querySelector('#pd-word-display');
    const toolsDiv = container.querySelector('#pd-tools');
    const guessArea = container.querySelector('#pd-guess-area');
    const guessInput = container.querySelector('#pd-guess-input');
    const guessSend = container.querySelector('#pd-guess-send');
    const guessesDiv = container.querySelector('#pd-guesses');
    const scoresDiv = container.querySelector('#pd-scores');
    const startBtn = container.querySelector('#pd-start-btn');
    const colorPicker = container.querySelector('#pd-colorpicker');
    const brushSizeSlider = container.querySelector('#pd-brushsize');
    const eraserBtn = container.querySelector('#pd-eraser');
    const clearBtn = container.querySelector('#pd-clear');

    backBtn.addEventListener('click', () => { if (roundTimer) clearInterval(roundTimer); onBack(); });

    if (forceEndBtn) {
        forceEndBtn.addEventListener('click', () => {
            if (confirm('End match for everyone?')) {
                channel.send({ type: 'broadcast', event: 'force_game_end' });
                if (roundTimer) clearInterval(roundTimer);
                onBack();
            }
        });
    }

    channel.on('broadcast', { event: 'force_game_end' }, () => {
        showToast('Host ended the match.', 'info');
        if (roundTimer) clearInterval(roundTimer);
        onBack();
    });

    // ─── Canvas Setup ───
    function resizeCanvas() {
        const rect = canvas.parentElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        // Save current drawing
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        canvas.width = rect.width;
        canvas.height = rect.height;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        try { ctx.putImageData(img, 0, 0); } catch (e) { }
    }
    // Set initial size after layout
    setTimeout(resizeCanvas, 100);
    const ro = new ResizeObserver(() => setTimeout(resizeCanvas, 50));
    ro.observe(canvas.parentElement);

    let activeColor = '#000000';
    let activeBrush = 6;
    let erasing = false;

    colorPicker?.addEventListener('input', (e) => { activeColor = e.target.value; erasing = false; eraserBtn.textContent = '🧹 Eraser'; });
    brushSizeSlider?.addEventListener('input', (e) => { activeBrush = parseInt(e.target.value); });
    eraserBtn?.addEventListener('click', () => { erasing = !erasing; eraserBtn.textContent = erasing ? '🖊️ Draw' : '🧹 Eraser'; });
    clearBtn?.addEventListener('click', () => {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        channel.send({ type: 'broadcast', event: 'draw_clear' });
    });

    channel.on('broadcast', { event: 'draw_clear' }, () => {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    });

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const src = e.touches ? e.touches[0] : e;
        return {
            x: (src.clientX - rect.left) * (canvas.width / rect.width),
            y: (src.clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    canvas.addEventListener('mousedown', (e) => {
        if (drawerId !== myId) return;
        isDrawing = true;
        const p = getPos(e);
        lastX = p.x; lastY = p.y;
    });
    canvas.addEventListener('touchstart', (e) => {
        if (drawerId !== myId) return;
        e.preventDefault();
        isDrawing = true;
        const p = getPos(e);
        lastX = p.x; lastY = p.y;
    }, { passive: false });

    function drawLine(x1, y1, x2, y2, color, size) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    }

    function handleDraw(e) {
        if (!isDrawing || drawerId !== myId) return;
        const p = getPos(e);
        const color = erasing ? 'white' : activeColor;
        drawLine(lastX, lastY, p.x, p.y, color, activeBrush);
        // Send normalized coords
        channel.send({
            type: 'broadcast', event: 'draw_stroke',
            payload: {
                x1: lastX / canvas.width, y1: lastY / canvas.height,
                x2: p.x / canvas.width, y2: p.y / canvas.height,
                color, size: activeBrush
            }
        });
        lastX = p.x; lastY = p.y;
    }

    canvas.addEventListener('mousemove', handleDraw);
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); handleDraw(e); }, { passive: false });
    canvas.addEventListener('mouseup', () => { isDrawing = false; });
    canvas.addEventListener('mouseleave', () => { isDrawing = false; });
    canvas.addEventListener('touchend', () => { isDrawing = false; });

    channel.on('broadcast', { event: 'draw_stroke' }, ({ payload }) => {
        if (drawerId === myId) return; // don't redraw own strokes
        drawLine(
            payload.x1 * canvas.width, payload.y1 * canvas.height,
            payload.x2 * canvas.width, payload.y2 * canvas.height,
            payload.color, payload.size
        );
    });

    // ─── Game Start ───
    startBtn?.addEventListener('click', () => {
        if (!isHost) return;
        startBtn.style.display = 'none';
        const wordList = [...WORDS].sort(() => 0.5 - Math.random());
        allWords = wordList;
        channel.send({ type: 'broadcast', event: 'draw_round_start', payload: { drawerIndex: 0, word: wordList[0], words: wordList } });
        startRound(0, wordList[0], wordList);
    });

    channel.on('broadcast', { event: 'draw_round_start' }, ({ payload }) => {
        if (startBtn) startBtn.style.display = 'none';
        startRound(payload.drawerIndex, payload.word, payload.words);
    });

    // ─── Round Logic ───
    function startRound(di, word, words) {
        if (roundTimer) clearInterval(roundTimer);
        allWords = words;
        drawerIndex = di;
        drawerId = uids[di % uids.length];
        currentWord = word;
        roundNum++;
        roundScores = {};
        timeLeft = 60;
        isDrawingPhase = true;

        // Reset canvas
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        guessesDiv.innerHTML = '';

        const drawerName = escapeHtml(members[drawerId]?.username || '?');
        statusDiv.textContent = `Round ${roundNum}: ${drawerName} is drawing!`;
        timerDiv.textContent = '60';
        timerDiv.style.color = 'var(--accent-color)';
        wordDisplay.style.display = 'block';

        if (drawerId === myId) {
            wordDisplay.innerHTML = `<span style="color:var(--primary-color);">🎨 Draw: <strong>${escapeHtml(word)}</strong></span>`;
            toolsDiv.style.display = 'flex';
            guessArea.style.display = 'none';
        } else {
            wordDisplay.innerHTML = `<span style="color:var(--text-muted);">Word has ${word.length} letters: ${'_ '.repeat(word.length)}</span>`;
            toolsDiv.style.display = 'none';
            guessArea.style.display = 'flex';
            if (guessInput) { guessInput.value = ''; guessInput.focus(); }
        }

        renderScores();

        roundTimer = setInterval(() => {
            timeLeft--;
            timerDiv.textContent = timeLeft;
            if (timeLeft <= 10) timerDiv.style.color = '#FF3B30';
            if (timeLeft <= 0) {
                clearInterval(roundTimer);
                endRound();
            }
        }, 1000);
    }

    function endRound() {
        isDrawingPhase = false;
        toolsDiv.style.display = 'none';
        guessArea.style.display = 'none';
        wordDisplay.innerHTML = `<span style="color:var(--primary-color);">The word was: <strong>${escapeHtml(currentWord)}</strong></span>`;
        statusDiv.textContent = '⏳ Next round starting soon...';

        if (isHost) {
            setTimeout(() => {
                const nextDi = (drawerIndex + 1) % uids.length;
                const nextWord = allWords[nextDi % allWords.length] || WORDS[Math.floor(Math.random() * WORDS.length)];
                channel.send({ type: 'broadcast', event: 'draw_round_start', payload: { drawerIndex: nextDi, word: nextWord, words: allWords } });
                startRound(nextDi, nextWord, allWords);
            }, 4000);
        }
    }

    // ─── Guessing ───
    guessSend?.addEventListener('click', submitGuess);
    guessInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitGuess(); });

    function submitGuess() {
        const guess = (guessInput?.value || '').trim();
        if (!guess || !isDrawingPhase || drawerId === myId) return;
        guessInput.value = '';
        // Broadcast — word is included so all clients can verify independently
        channel.send({ type: 'broadcast', event: 'draw_guess', payload: { uid: myId, guess, word: currentWord } });
    }

    channel.on('broadcast', { event: 'draw_guess' }, ({ payload }) => {
        const { uid, guess, word } = payload;
        const name = members[uid]?.username || '?';
        // Use the word that came in the payload so all clients check against same word
        const isCorrect = guess.toLowerCase().trim() === word.toLowerCase().trim();

        if (isCorrect && !roundScores[uid]) {
            const pts = Math.max(10, timeLeft * 2);
            roundScores[uid] = pts;
            totalScores[uid] = (totalScores[uid] || 0) + pts;
            addGuessMsg(name, guess, true);
            import('../ui/animations.js').then(({ playSound }) => playSound('place'));
            renderScores();

            if (uid === myId) {
                // Personal success feedback
                showToast(`🎉 Correct! +${pts} points!`, 'success');
                wordDisplay.innerHTML = `<span style="color:#34C759;font-size:1.3rem;">🎉 You got it! The word was <strong>${escapeHtml(word)}</strong></span>`;
                guessArea.style.display = 'none'; // hide input — already guessed
            } else {
                showToast(`✅ ${escapeHtml(name)} guessed it!`, 'success');
            }

            // If all guessers correct, end early
            const guessers = uids.filter(u => u !== drawerId);
            if (guessers.length > 0 && guessers.every(u => roundScores[u])) {
                if (isHost) {
                    clearInterval(roundTimer);
                    setTimeout(endRound, 2000);
                }
            }
        } else if (!isCorrect) {
            addGuessMsg(name, guess, false);
        }
    });

    function addGuessMsg(sender, text, correct) {
        const el = document.createElement('div');
        el.style.cssText = `padding:3px 8px;border-radius:6px;background:${correct ? 'rgba(52,199,89,0.2)' : 'rgba(255,255,255,0.05)'}`;
        el.innerHTML = `<strong style="color:${correct ? '#34C759' : 'var(--text-secondary)'};">${escapeHtml(sender)}:</strong> ${escapeHtml(text)} ${correct ? '✅' : ''}`;
        guessesDiv.appendChild(el);
        guessesDiv.scrollTop = guessesDiv.scrollHeight;
    }

    function renderScores() {
        const sorted = [...uids].sort((a, b) => (totalScores[b] || 0) - (totalScores[a] || 0));
        scoresDiv.innerHTML = sorted.map((uid, i) => {
            const isDrawerNow = uid === drawerId;
            return `<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:0.85rem;${isDrawerNow ? 'color:var(--accent-color);font-weight:bold;' : ''}">
                <span>${i + 1}. ${escapeHtml(members[uid]?.username || '?')} ${isDrawerNow ? '✏️' : ''}</span>
                <span>${totalScores[uid] || 0}pts</span>
            </div>`;
        }).join('');
    }

    renderScores();
}
