// src/games/party_draw.js  –– Full Rewrite
import { escapeHtml } from '../utils.js';
import { showToast } from '../ui/toast.js';
import { getUserId } from '../auth.js';

// ── Word Banks ──────────────────────────────────────────────
const WORDS = {
    en: ['Cat', 'Dog', 'Pizza', 'Car', 'Airplane', 'Tree', 'House', 'Bicycle', 'Fish', 'Bird',
        'Book', 'Glasses', 'Computer', 'Phone', 'Guitar', 'Camera', 'Banana', 'Apple', 'Sun', 'Moon',
        'Scissors', 'Pencil', 'Hat', 'Shoe', 'Ball', 'Candle', 'Key', 'Lamp', 'Clock', 'Mirror',
        'Umbrella', 'Rainbow', 'Castle', 'Robot', 'Dragon', 'Volcano', 'Submarine', 'Dinosaur',
        'Lighthouse', 'Magnet', 'Snowman', 'Cactus', 'Backpack', 'Bridge', 'Jellyfish', 'Tornado',
        'Treasure', 'Compass', 'Telescope', 'Fireplace', 'Windmill', 'Skateboard', 'Sushi', 'Popcorn'],
    de: ['Katze', 'Hund', 'Pizza', 'Auto', 'Flugzeug', 'Baum', 'Haus', 'Fahrrad', 'Fisch', 'Vogel',
        'Buch', 'Brille', 'Computer', 'Handy', 'Gitarre', 'Kamera', 'Banane', 'Apfel', 'Sonne', 'Mond',
        'Schere', 'Bleistift', 'Hut', 'Schuh', 'Ball', 'Kerze', 'Schlüssel', 'Lampe', 'Uhr', 'Spiegel',
        'Regenschirm', 'Regenbogen', 'Burg', 'Roboter', 'Drache', 'Vulkan', 'Unterseeboot', 'Dinosaurier',
        'Leuchtturm', 'Magnet', 'Schneemann', 'Kaktus', 'Rucksack', 'Brücke', 'Qualle', 'Tornado',
        'Schatz', 'Kompass', 'Teleskop', 'Kamin', 'Windmühle', 'Skateboard', 'Sushi', 'Popcorn']
};

export function renderPartyDraw(container, onBack) {
    const pd = window._partyData;
    if (!pd) { onBack(); return; }

    const { channel, code, isHost, members, lang = 'en' } = pd;
    const myId = getUserId();
    const uids = Object.keys(members);
    const wordList = WORDS[lang] || WORDS.en;

    // ── Game State ──────────────────────────────────────────
    let totalScores = {};
    uids.forEach(uid => { totalScores[uid] = 0; });

    let currentRound = 0;
    const MAX_ROUNDS = 3;
    let currentDrawerUid = null;
    let currentWord = null;          // only drawer knows this
    let roundTimer = null;
    let roundSecondsLeft = 80;
    let correctGuessers = new Set();
    let hasGuessedCorrectly = false;  // local flag for this client
    let gameStarted = false;

    // ── Build UI ─────────────────────────────────────────────
    container.innerHTML = `
        <div class="game-screen" style="max-width:960px;margin:0 auto;display:flex;flex-direction:column;height:100vh;">
            <div class="game-screen-header">
                <div class="game-screen-title">🎨 Party Draw <span class="game-screen-badge vs-player">${code}</span></div>
                ${isHost ? `<button class="btn btn-sm btn-ghost danger" id="pd-force-end" style="margin-left:auto;">🛑 End</button>` : '<div style="margin-left:auto;"></div>'}
            </div>

            <div style="flex:1;display:flex;flex-wrap:wrap;gap:12px;padding:12px;overflow:auto;align-items:flex-start;">

                <!-- Canvas + tools (main area) -->
                <div style="flex:1;min-width:min(100%,300px);display:flex;flex-direction:column;gap:8px;">
                    <div id="pd-status" style="font-size:1rem;font-weight:700;text-align:center;">Waiting for host to start...</div>
                    <div id="pd-timer" style="font-size:1.8rem;font-weight:900;color:var(--accent-color);text-align:center;min-height:2rem;"></div>
                    <div id="pd-word-display" style="text-align:center;font-size:1.1rem;font-weight:bold;min-height:1.5em;letter-spacing:6px;"></div>
                    <div style="position:relative;width:100%;aspect-ratio:4/3;min-height:200px;">
                        <canvas id="pd-canvas" style="width:100%;height:100%;border:2px solid var(--border-color);border-radius:8px;background:white;touch-action:none;display:block;"></canvas>
                    </div>
                    <div id="pd-tools" style="display:none;gap:12px;flex-wrap:wrap;align-items:center;justify-content:center;">
                        <input type="color" id="pd-colorpicker" value="#000000" style="width:48px;height:48px;border:none;border-radius:8px;cursor:pointer;">
                        <input type="range" id="pd-brushsize" min="2" max="30" value="6" style="flex:1;min-width:100px;max-width:150px;height:24px;">
                        <button class="btn btn-secondary" id="pd-eraser" style="min-height:48px;padding:0 16px;">🧹 Eraser</button>
                        <button class="btn btn-secondary" id="pd-clear" style="min-height:48px;padding:0 16px;">🗑️ Clear</button>
                    </div>
                    <div id="pd-guess-area" style="display:none;gap:8px;">
                        <input type="text" id="pd-guess-input" class="input-field" placeholder="Type your guess..." autocomplete="off" style="flex:1;min-height:44px;">
                        <button class="btn btn-primary" id="pd-guess-send" style="min-height:44px;min-width:72px;">Guess!</button>
                    </div>
                </div>

                <!-- Side panel -->
                <div style="flex:1 1 300px;max-width:100%;display:flex;flex-direction:column;gap:12px;">
                    <div style="background:var(--bg-card);border-radius:12px;padding:12px;border:1px solid rgba(255,255,255,0.1);">
                        <h4 style="margin-bottom:8px;font-size:1.1rem;">Scores</h4>
                        <div id="pd-scores" style="display:flex;flex-direction:column;gap:6px;"></div>
                    </div>
                    <div style="background:var(--bg-card);border-radius:12px;padding:12px;border:1px solid rgba(255,255,255,0.1);flex:1;min-height:150px;display:flex;flex-direction:column;">
                        <h4 style="margin-bottom:8px;font-size:1.1rem;">Guesses</h4>
                        <div id="pd-guesses" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;font-size:0.95rem;"></div>
                    </div>
                    ${isHost ? `<button class="btn btn-accent" id="pd-start-btn" style="min-height:52px;font-size:1.1rem;">▶ Start Game</button>` : ''}
                </div>
            </div>
        </div>
    `;

    // ── DOM refs ─────────────────────────────────────────────
    const canvas = container.querySelector('#pd-canvas');
    const statusDiv = container.querySelector('#pd-status');
    const timerDiv = container.querySelector('#pd-timer');
    const wordDisplay = container.querySelector('#pd-word-display');
    const toolsDiv = container.querySelector('#pd-tools');
    const guessArea = container.querySelector('#pd-guess-area');
    const guessInput = container.querySelector('#pd-guess-input');
    const guessSend = container.querySelector('#pd-guess-send');
    const scoresDiv = container.querySelector('#pd-scores');
    const guessesDiv = container.querySelector('#pd-guesses');
    const startBtn = container.querySelector('#pd-start-btn');
    const forceEndBtn = container.querySelector('#pd-force-end');

    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let lastX = 0, lastY = 0;
    let currentColor = '#000000';
    let brushSize = 6;
    let eraserMode = false;

    // ── Canvas Sizing ─────────────────────────────────────────
    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        const scale = window.devicePixelRatio || 1;
        const imgData = canvas.width > 0 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
        canvas.width = rect.width * scale;
        canvas.height = rect.height * scale;
        ctx.scale(scale, scale);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (imgData) ctx.putImageData(imgData, 0, 0);
    }

    const resizeObs = new ResizeObserver(resizeCanvas);
    resizeObs.observe(canvas);
    resizeCanvas();

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const src = e.touches ? e.touches[0] : e;
        return { x: (src.clientX - rect.left), y: (src.clientY - rect.top) };
    }

    function startDraw(e) {
        if (currentDrawerUid !== myId) return;
        const { x, y } = getPos(e);
        isDrawing = true;
        lastX = x; lastY = y;
    }

    function draw(e) {
        if (!isDrawing || currentDrawerUid !== myId) return;
        e.preventDefault();
        const { x, y } = getPos(e);
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.strokeStyle = eraserMode ? '#FFFFFF' : currentColor;
        ctx.lineWidth = eraserMode ? brushSize * 3 : brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        // Broadcast the stroke
        channel.send({ type: 'broadcast', event: 'draw_stroke', payload: { x0: lastX, y0: lastY, x1: x, y1: y, color: eraserMode ? '#FFFFFF' : currentColor, size: eraserMode ? brushSize * 3 : brushSize, cw: canvas.getBoundingClientRect().width, ch: canvas.getBoundingClientRect().height } });
        lastX = x; lastY = y;
    }

    function stopDraw() { isDrawing = false; }

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseleave', stopDraw);
    canvas.addEventListener('touchstart', e => { e.preventDefault(); startDraw(e); }, { passive: false });
    canvas.addEventListener('touchmove', e => { e.preventDefault(); draw(e); }, { passive: false });
    canvas.addEventListener('touchend', stopDraw);

    // tools
    container.querySelector('#pd-colorpicker')?.addEventListener('input', e => { currentColor = e.target.value; eraserMode = false; });
    container.querySelector('#pd-brushsize')?.addEventListener('input', e => { brushSize = parseInt(e.target.value); });
    container.querySelector('#pd-eraser')?.addEventListener('click', () => { eraserMode = !eraserMode; container.querySelector('#pd-eraser').classList.toggle('btn-accent', eraserMode); });
    container.querySelector('#pd-clear')?.addEventListener('click', () => {
        if (currentDrawerUid !== myId) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        channel.send({ type: 'broadcast', event: 'draw_clear', payload: {} });
    });

    // ── Render Scores ─────────────────────────────────────────
    function renderScores() {
        scoresDiv.innerHTML = Object.keys(members).sort((a, b) => (totalScores[b] || 0) - (totalScores[a] || 0)).map(uid => `
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                <span style="font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:130px;">${escapeHtml(members[uid]?.username || uid)}</span>
                <span style="font-weight:bold;color:var(--accent-color);">${totalScores[uid] || 0}</span>
            </div>`).join('');
    }

    function appendGuess(username, text, correct = false) {
        const el = document.createElement('div');
        el.style.cssText = `padding:2px 4px;border-radius:4px;background:${correct ? 'rgba(52,199,89,0.2)' : 'transparent'};`;
        el.innerHTML = `<strong style="color:${correct ? '#34C759' : 'var(--text-secondary)'};">${escapeHtml(username)}:</strong> <span style="word-break:break-word;">${escapeHtml(text)}</span>`;
        guessesDiv.appendChild(el);
        guessesDiv.scrollTop = guessesDiv.scrollHeight;
    }

    // ── Round Management ──────────────────────────────────────
    function computeDrawerUid(round) {
        return uids[round % uids.length];
    }

    function startRound(round, word) {
        currentRound = round;
        currentWord = word;
        currentDrawerUid = computeDrawerUid(round);
        correctGuessers.clear();
        hasGuessedCorrectly = false;
        roundSecondsLeft = 80;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const amDrawing = currentDrawerUid === myId;
        const drawerName = members[currentDrawerUid]?.username || currentDrawerUid;

        statusDiv.textContent = amDrawing ? `✏️ You are drawing!` : `⏳ ${escapeHtml(drawerName)} is drawing...`;
        toolsDiv.style.display = amDrawing ? 'flex' : 'none';
        guessArea.style.display = (!amDrawing && !hasGuessedCorrectly) ? 'flex' : 'none';

        if (amDrawing) {
            wordDisplay.textContent = `Word: ${word}`;
            wordDisplay.style.color = 'var(--primary-color)';
        } else {
            wordDisplay.textContent = '_ '.repeat(word.length).trim();
            wordDisplay.style.color = 'var(--text-muted)';
        }

        if (startBtn) startBtn.style.display = 'none';
        gameStarted = true;

        if (isHost) {
            if (roundTimer) clearInterval(roundTimer);
            roundTimer = setInterval(() => {
                roundSecondsLeft--;
                timerDiv.textContent = `⏱ ${roundSecondsLeft}s`;
                channel.send({ type: 'broadcast', event: 'draw_tick', payload: { s: roundSecondsLeft } });
                if (roundSecondsLeft <= 0) {
                    clearInterval(roundTimer);
                    channel.send({ type: 'broadcast', event: 'draw_round_end', payload: { word: currentWord, nextRound: currentRound + 1 } });
                    handleRoundEnd(currentWord, currentRound + 1);
                }
            }, 1000);
        }

        renderScores();
        guessesDiv.innerHTML = '';
    }

    function handleRoundEnd(word, nextRound) {
        if (roundTimer) { clearInterval(roundTimer); roundTimer = null; }
        timerDiv.textContent = '';
        toolsDiv.style.display = 'none';
        guessArea.style.display = 'none';
        wordDisplay.textContent = `The word was: ${word}`;
        wordDisplay.style.color = 'var(--accent-color)';

        if (nextRound >= MAX_ROUNDS * uids.length) {
            // Final round — show winner
            setTimeout(() => showWinner(), 1500);
        } else {
            statusDiv.textContent = `Next round in 3s...`;
            if (isHost) {
                setTimeout(() => {
                    const nextWord = wordList[Math.floor(Math.random() * wordList.length)];
                    channel.send({ type: 'broadcast', event: 'draw_round_start', payload: { round: nextRound, word: nextWord } });
                    startRound(nextRound, nextWord);
                }, 3000);
            }
        }
    }

    function showWinner() {
        if (roundTimer) clearInterval(roundTimer);
        const winnerId = Object.keys(totalScores).sort((a, b) => totalScores[b] - totalScores[a])[0];
        const winnerName = members[winnerId]?.username || winnerId;
        statusDiv.innerHTML = `<span style="color:var(--primary-color);font-size:1.3rem;">🏆 ${escapeHtml(winnerName)} wins Party Draw!</span>`;
        timerDiv.textContent = '';
        wordDisplay.textContent = '';
        toolsDiv.style.display = 'none';
        guessArea.style.display = 'none';
        import('../ui/animations.js').then(({ triggerConfetti }) => triggerConfetti());
    }

    // ── Broadcast Handlers ────────────────────────────────────
    channel.on('broadcast', { event: 'draw_stroke' }, ({ payload }) => {
        if (currentDrawerUid === myId) return; // ignore own echoes
        const scaleX = canvas.getBoundingClientRect().width / payload.cw;
        const scaleY = canvas.getBoundingClientRect().height / payload.ch;
        ctx.beginPath();
        ctx.moveTo(payload.x0 * scaleX, payload.y0 * scaleY);
        ctx.lineTo(payload.x1 * scaleX, payload.y1 * scaleY);
        ctx.strokeStyle = payload.color;
        ctx.lineWidth = payload.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    });

    channel.on('broadcast', { event: 'draw_clear' }, () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    channel.on('broadcast', { event: 'draw_tick' }, ({ payload }) => {
        if (!isHost) {
            roundSecondsLeft = payload.s;
            timerDiv.textContent = `⏱ ${payload.s}s`;
        }
    });

    channel.on('broadcast', { event: 'draw_round_start' }, ({ payload }) => {
        // non-host gets an empty word (only drawer gets it from host via private channel? no - just blank it)
        // Actually host broadcasts the word to everyone - drawer uses it, others see blanks
        startRound(payload.round, payload.word);
    });

    channel.on('broadcast', { event: 'draw_round_end' }, ({ payload }) => {
        if (!isHost) handleRoundEnd(payload.word, payload.nextRound);
    });

    channel.on('broadcast', { event: 'draw_chat' }, ({ payload }) => {
        appendGuess(payload.username, payload.guess, false);
    });

    // ── Host Authoritative Scoring ────────────────────────────
    function handleDrawAttempt(payload) {
        if (!isHost) return;
        const { uid, username, guess } = payload;
        if (correctGuessers.has(uid)) return; // Already guessed

        const correct = !!(currentWord && guess && guess.trim().toLowerCase() === currentWord.toLowerCase());

        if (correct) {
            const pts = Math.max(10, Math.round(roundSecondsLeft * 1.25));
            totalScores[uid] = (totalScores[uid] || 0) + pts;
            correctGuessers.add(uid);

            let drawerPts = 0;
            if (currentDrawerUid && currentDrawerUid !== uid) {
                drawerPts = 5;
                totalScores[currentDrawerUid] = (totalScores[currentDrawerUid] || 0) + drawerPts;
            }

            // Broadcast exact points to all clients so everyone stays perfectly in sync
            channel.send({ type: 'broadcast', event: 'draw_correct', payload: { uid, username, pts, drawerUid: currentDrawerUid, drawerPts } });

            // If everyone guessed, end round early
            if (correctGuessers.size >= uids.length - 1) {
                if (roundTimer) clearInterval(roundTimer);
                channel.send({ type: 'broadcast', event: 'draw_round_end', payload: { word: currentWord, nextRound: currentRound + 1 } });
                handleRoundEnd(currentWord, currentRound + 1);
            }
        } else {
            // Not correct, just forward to chat
            channel.send({ type: 'broadcast', event: 'draw_chat', payload: { username, guess } });
        }
    }

    if (isHost) {
        channel.on('broadcast', { event: 'draw_attempt' }, ({ payload }) => handleDrawAttempt(payload));
    }

    channel.on('broadcast', { event: 'draw_correct' }, ({ payload }) => {
        const { uid, username, pts, drawerUid, drawerPts } = payload;

        appendGuess(username, '✅ Got it!', true);

        if (!isHost) {
            totalScores[uid] = (totalScores[uid] || 0) + pts;
            correctGuessers.add(uid);
            if (drawerUid && drawerPts > 0) {
                totalScores[drawerUid] = (totalScores[drawerUid] || 0) + drawerPts;
            }
        }

        if (uid === myId) {
            hasGuessedCorrectly = true;
            guessArea.style.display = 'none';
            wordDisplay.textContent = `✅ Correct! The word was: ${currentWord}`;
            wordDisplay.style.color = '#34C759';
            showToast(`🎉 You got it! +${pts} points!`, 'success');
            import('../ui/animations.js').then(({ triggerConfetti }) => triggerConfetti());
        }
        renderScores();
    });

    channel.on('broadcast', { event: 'force_game_end' }, ({ payload }) => {
        if (isHost) return;
        if (roundTimer) clearInterval(roundTimer);
        const pd2 = window._partyData;
        const count = payload?.matchCount || 1;
        if (pd2) pd2.matchCount = count;
        showToast('Host ended the match.', 'info');
        if (count >= 2) pd2?.forceHome();
        else onBack();
    });

    // ── Guess Submission ──────────────────────────────────────
    function submitGuess() {
        if (hasGuessedCorrectly || currentDrawerUid === myId || !currentWord) return;
        const raw = guessInput.value.trim();
        if (!raw) return;
        guessInput.value = '';

        // Host evaluates all guesses to ensure exact synced points and no spoofing
        if (isHost) {
            // Host evaluates their own guess directly
            handleDrawAttempt({ uid: myId, username: members[myId]?.username || 'Me', guess: raw });
        } else {
            channel.send({ type: 'broadcast', event: 'draw_attempt', payload: { uid: myId, username: members[myId]?.username || 'Me', guess: raw } });
        }
    }

    guessSend?.addEventListener('click', submitGuess);
    guessInput?.addEventListener('keydown', e => { if (e.key === 'Enter') submitGuess(); });

    // ── Host Controls ─────────────────────────────────────────
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            if (!isHost) return;
            const firstWord = wordList[Math.floor(Math.random() * wordList.length)];
            channel.send({ type: 'broadcast', event: 'draw_round_start', payload: { round: 0, word: firstWord } });
            startRound(0, firstWord);
        });
    }

    if (forceEndBtn) {
        forceEndBtn.addEventListener('click', () => {
            if (confirm('End match for everyone?')) {
                if (roundTimer) clearInterval(roundTimer);
                const pd2 = window._partyData;
                const nextCount = (pd2?.matchCount || 0) + 1;
                channel.send({ type: 'broadcast', event: 'force_game_end', payload: { matchCount: nextCount } });
                if (pd2) pd2.matchCount = nextCount;
                if (nextCount >= 2) pd2?.forceHome();
                else onBack();
            }
        });
    }

    renderScores();
}
