// src/games/party_trivia.js  –– Full Rewrite
import { escapeHtml } from '../utils.js';
import { showToast } from '../ui/toast.js';
import { getUserId } from '../auth.js';

// ── Question Banks ─────────────────────────────────────────────────────────
const QUESTIONS = {
    en: [
        { q: 'What is the capital of France?', a: ['Berlin', 'Paris', 'Rome', 'Madrid'], correct: 1 },
        { q: 'How many sides does a hexagon have?', a: ['5', '6', '7', '8'], correct: 1 },
        { q: 'What is the largest planet in our solar system?', a: ['Saturn', 'Neptune', 'Jupiter', 'Uranus'], correct: 2 },
        { q: 'Which element has the chemical symbol "O"?', a: ['Gold', 'Oxygen', 'Osmium', 'Oganesson'], correct: 1 },
        { q: 'How many continents are there on Earth?', a: ['5', '6', '7', '8'], correct: 2 },
        { q: 'In which year did World War II end?', a: ['1943', '1944', '1945', '1946'], correct: 2 },
        { q: 'What is the fastest land animal?', a: ['Lion', 'Cheetah', 'Horse', 'Greyhound'], correct: 1 },
        { q: 'Who wrote "Romeo and Juliet"?', a: ['Dickens', 'Shakespeare', 'Tolstoy', 'Hemingway'], correct: 1 },
        { q: 'What is the boiling point of water in Celsius?', a: ['90°', '95°', '100°', '105°'], correct: 2 },
        { q: 'How many strings does a standard guitar have?', a: ['4', '5', '6', '7'], correct: 2 },
        { q: 'Which planet is closest to the Sun?', a: ['Venus', 'Earth', 'Mars', 'Mercury'], correct: 3 },
        { q: 'What is the largest ocean on Earth?', a: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], correct: 3 },
        { q: 'Who painted the Mona Lisa?', a: ['Michelangelo', 'Raphael', 'Da Vinci', 'Botticelli'], correct: 2 },
        { q: 'How many bones are in the adult human body?', a: ['196', '206', '216', '226'], correct: 1 },
        { q: 'What language has the most native speakers?', a: ['English', 'Spanish', 'Mandarin', 'Hindi'], correct: 2 },
        { q: 'What is the square root of 144?', a: ['10', '11', '12', '13'], correct: 2 },
        { q: 'In which country is the Amazon Rainforest primarily located?', a: ['Peru', 'Colombia', 'Venezuela', 'Brazil'], correct: 3 },
        { q: 'What gas do plants absorb from the atmosphere?', a: ['Oxygen', 'Nitrogen', 'CO₂', 'Hydrogen'], correct: 2 },
        { q: 'How many players are on a basketball team on the court?', a: ['4', '5', '6', '7'], correct: 1 },
        { q: 'What is H₂O?', a: ['Salt', 'Oxygen', 'Water', 'Acid'], correct: 2 },
        { q: 'Which country invented the internet?', a: ['UK', 'Japan', 'USA', 'Germany'], correct: 2 },
        { q: 'How many hours are in a day?', a: ['12', '20', '24', '48'], correct: 2 },
        { q: 'What is the currency of Japan?', a: ['Yuan', 'Won', 'Yen', 'Ringgit'], correct: 2 },
        { q: 'What color is a ripe banana?', a: ['Green', 'Red', 'Yellow', 'Orange'], correct: 2 },
        { q: 'How many minutes are in an hour?', a: ['30', '45', '60', '90'], correct: 2 },
    ],
    de: [
        { q: 'Was ist die Hauptstadt von Deutschland?', a: ['München', 'Hamburg', 'Berlin', 'Köln'], correct: 2 },
        { q: 'Wie viele Seiten hat ein Sechseck?', a: ['5', '6', '7', '8'], correct: 1 },
        { q: 'Welcher ist der größte Planet in unserem Sonnensystem?', a: ['Saturn', 'Neptun', 'Jupiter', 'Uranus'], correct: 2 },
        { q: 'Welches chemische Symbol hat Sauerstoff?', a: ['Sa', 'Au', 'O', 'H'], correct: 2 },
        { q: 'Wie viele Kontinente gibt es auf der Erde?', a: ['5', '6', '7', '8'], correct: 2 },
        { q: 'In welchem Jahr endete der Zweite Weltkrieg?', a: ['1943', '1944', '1945', '1946'], correct: 2 },
        { q: 'Was ist das schnellste Landtier?', a: ['Löwe', 'Gepard', 'Pferd', 'Windhund'], correct: 1 },
        { q: 'Wer schrieb "Romeo und Julia"?', a: ['Goethe', 'Shakespeare', 'Schiller', 'Brecht'], correct: 1 },
        { q: 'Bei wie viel Grad Celsius siedet Wasser?', a: ['90°', '95°', '100°', '105°'], correct: 2 },
        { q: 'Wie viele Saiten hat eine Standardgitarre?', a: ['4', '5', '6', '7'], correct: 2 },
        { q: 'Welcher Planet ist der Sonne am nächsten?', a: ['Venus', 'Erde', 'Mars', 'Merkur'], correct: 3 },
        { q: 'Was ist der größte Ozean der Erde?', a: ['Atlantik', 'Indik', 'Arktik', 'Pazifik'], correct: 3 },
        { q: 'Wer malte die Mona Lisa?', a: ['Michelangelo', 'Raffael', 'da Vinci', 'Botticelli'], correct: 2 },
        { q: 'Wie viele Knochen hat der erwachsene menschliche Körper?', a: ['196', '206', '216', '226'], correct: 1 },
        { q: 'Welche Sprache hat die meisten Muttersprachler?', a: ['Englisch', 'Spanisch', 'Mandarin', 'Hindi'], correct: 2 },
        { q: 'Was ist die Quadratwurzel von 144?', a: ['10', '11', '12', '13'], correct: 2 },
        { q: 'In welchem Land liegt der Großteil des Amazonas-Regenwaldes?', a: ['Peru', 'Kolumbien', 'Venezuela', 'Brasilien'], correct: 3 },
        { q: 'Welches Gas nehmen Pflanzen aus der Atmosphäre auf?', a: ['Sauerstoff', 'Stickstoff', 'CO₂', 'Wasserstoff'], correct: 2 },
        { q: 'Wie viele Spieler stehen beim Basketball gleichzeitig auf dem Feld?', a: ['4', '5', '6', '7'], correct: 1 },
        { q: 'Was ist H₂O?', a: ['Salz', 'Sauerstoff', 'Wasser', 'Säure'], correct: 2 },
        { q: 'Wie viele Stunden hat ein Tag?', a: ['12', '20', '24', '48'], correct: 2 },
        { q: 'Was ist die Währung von Japan?', a: ['Yuan', 'Won', 'Yen', 'Ringgit'], correct: 2 },
        { q: 'Welche Farbe hat eine reife Banane?', a: ['Grün', 'Rot', 'Gelb', 'Orange'], correct: 2 },
        { q: 'Wie viele Minuten hat eine Stunde?', a: ['30', '45', '60', '90'], correct: 2 },
        { q: 'Was ist die Hauptstadt von Österreich?', a: ['Salzburg', 'Graz', 'Wien', 'Innsbruck'], correct: 2 },
    ]
};

export function renderPartyTrivia(container, onBack) {
    const pd = window._partyData;
    if (!pd) { onBack(); return; }

    const { channel, code, isHost, members, lang = 'en' } = pd;
    const myId = getUserId();
    const uids = Object.keys(members);
    const questionBank = QUESTIONS[lang] || QUESTIONS.en;

    // ── Game State ──────────────────────────────────────────────────────────
    let state = 'lobby';  // 'lobby' | 'playing' | 'results'
    let playerAlive = {};
    uids.forEach(uid => { playerAlive[uid] = true; });
    let currentQuestion = null;
    let myAnswer = null;
    let answers = {};      // uid -> { idx, timedOut }
    let questionIndex = 0;
    let sessionQuestions = [];
    let timerInterval = null;
    let timerSeconds = 15;

    // ── Build UI ─────────────────────────────────────────────────────────────
    container.innerHTML = `
        <div class="game-screen" style="max-width:800px;margin:0 auto;height:100vh;display:flex;flex-direction:column;">
            <div class="game-screen-header">
                <div class="game-screen-title">🧠 Party Trivia <span class="game-screen-badge vs-player">${code}</span></div>
                ${isHost ? `<button class="btn btn-sm btn-ghost danger" id="pt-force-end" style="margin-left:auto;">🛑 End</button>` : '<div style="margin-left:auto;"></div>'}
            </div>
            
            <div style="flex:1;padding:clamp(12px,4vw,24px);display:flex;flex-direction:column;align-items:center;overflow-y:auto;">
                
                <div id="pt-status" style="font-size:clamp(1rem,4vw,1.5rem);font-weight:700;margin-bottom:16px;color:var(--primary-color);text-align:center;">
                    Waiting for host to start...
                </div>
                
                <div id="pt-host-controls" style="${isHost ? '' : 'display:none;'}margin-bottom:16px;">
                    <button class="btn btn-accent" id="pt-start-btn" style="font-size:clamp(1rem,3vw,1.2rem);padding:12px 24px;min-height:48px;">Start Battle Royale!</button>
                </div>

                <!-- Play Area -->
                <div id="pt-play-area" style="display:none;width:100%;max-width:600px;flex-direction:column;align-items:center;">
                    <div style="font-size:clamp(1.5rem,6vw,2.5rem);font-weight:900;margin-bottom:8px;color:var(--accent-color);" id="pt-timer">15</div>
                    <div style="font-size:0.95rem;color:var(--text-secondary);margin-bottom:16px;">
                        Question <span id="pt-q-num">1</span> / ${Math.min(15, questionBank.length)}
                    </div>
                    
                    <div id="pt-question" style="background:var(--bg-card);border:2px solid var(--border-color);border-radius:12px;padding:clamp(12px,4vw,24px);font-size:clamp(1rem,3.5vw,1.4rem);font-weight:bold;text-align:center;width:100%;margin-bottom:16px;">
                        ...
                    </div>
                    
                    <div id="pt-answers" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;">
                        <button class="btn btn-secondary answer-btn" data-idx="0" style="min-height:52px;font-size:clamp(0.85rem,2.5vw,1rem);white-space:normal;word-break:break-word;"></button>
                        <button class="btn btn-secondary answer-btn" data-idx="1" style="min-height:52px;font-size:clamp(0.85rem,2.5vw,1rem);white-space:normal;word-break:break-word;"></button>
                        <button class="btn btn-secondary answer-btn" data-idx="2" style="min-height:52px;font-size:clamp(0.85rem,2.5vw,1rem);white-space:normal;word-break:break-word;"></button>
                        <button class="btn btn-secondary answer-btn" data-idx="3" style="min-height:52px;font-size:clamp(0.85rem,2.5vw,1rem);white-space:normal;word-break:break-word;"></button>
                    </div>

                    <div id="pt-waiting" style="display:none;margin-top:16px;color:var(--text-secondary);font-size:0.9rem;text-align:center;">
                        ⏳ Waiting for other players...
                    </div>
                </div>

                <!-- Player Status -->
                <div style="width:100%;max-width:600px;margin-top:24px;background:rgba(0,0,0,0.2);border-radius:12px;padding:12px;">
                    <h3 style="margin-bottom:8px;font-size:0.95rem;">Players</h3>
                    <div id="pt-player-list" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
                </div>

            </div>
        </div>
    `;

    // ── DOM refs ──────────────────────────────────────────────────────────────
    const statusDiv = container.querySelector('#pt-status');
    const playArea = container.querySelector('#pt-play-area');
    const timerDiv = container.querySelector('#pt-timer');
    const qNumSpan = container.querySelector('#pt-q-num');
    const questionDiv = container.querySelector('#pt-question');
    const answerBtns = container.querySelectorAll('.answer-btn');
    const waitingDiv = container.querySelector('#pt-waiting');
    const playerListDiv = container.querySelector('#pt-player-list');
    const startBtn = container.querySelector('#pt-start-btn');
    const forceEndBtn = container.querySelector('#pt-force-end');

    // ── Render player status ─────────────────────────────────────────────────
    function renderPlayers() {
        playerListDiv.innerHTML = uids.map(uid => {
            const alive = playerAlive[uid];
            const name = members[uid]?.username || uid;
            return `<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:100px;border:1.5px solid ${alive ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)'};opacity:${alive ? '1' : '0.4'};">
                <span style="font-size:0.8rem;">${alive ? '💚' : '💀'}</span>
                <span style="font-size:0.85rem;">${escapeHtml(name)}</span>
            </div>`;
        }).join('');
    }

    // ── Load a question ──────────────────────────────────────────────────────
    function loadQuestion(q, idx, total) {
        state = 'playing';
        currentQuestion = q;
        myAnswer = null;
        answers = {};
        timerSeconds = 15;

        questionDiv.textContent = q.q;
        qNumSpan.textContent = idx + 1;
        answerBtns.forEach((btn, i) => {
            btn.textContent = q.a[i];
            btn.className = 'btn btn-secondary answer-btn';
            btn.disabled = !playerAlive[myId];
            btn.style.minHeight = '52px';
            btn.style.fontSize = 'clamp(0.85rem,2.5vw,1rem)';
            btn.style.whiteSpace = 'normal';
            btn.style.wordBreak = 'break-word';
        });

        waitingDiv.style.display = 'none';
        playArea.style.display = 'flex';
        statusDiv.textContent = playerAlive[myId] ? '🎮 Pick your answer!' : '👻 Spectating...';

        timerDiv.textContent = timerSeconds;

        if (isHost) {
            clearTimer();
            timerInterval = setInterval(() => {
                timerSeconds--;
                timerDiv.textContent = timerSeconds;
                channel.send({ type: 'broadcast', event: 'trivia_tick', payload: { s: timerSeconds } });
                if (timerSeconds <= 0) {
                    clearTimer();
                    // Mark non-answerers as timed out
                    uids.forEach(uid => {
                        if (playerAlive[uid] && !(uid in answers)) {
                            answers[uid] = { idx: -1, timedOut: true };
                        }
                    });
                    resolveQuestion();
                }
            }, 1000);
        }
    }

    function clearTimer() {
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    }

    // ── Resolve the question (host only, then broadcast results) ────────────
    function resolveQuestion() {
        clearTimer();
        if (!currentQuestion) return;

        const correct = currentQuestion.correct;
        const eliminated = [];

        // Eliminate players who got wrong or timed out
        uids.forEach(uid => {
            if (!playerAlive[uid]) return;
            const ans = answers[uid];
            if (!ans || ans.timedOut || ans.idx !== correct) {
                playerAlive[uid] = false;
                eliminated.push(uid);
            }
        });

        const aliveCount = uids.filter(u => playerAlive[u]).length;
        channel.send({ type: 'broadcast', event: 'trivia_resolve', payload: { correct, eliminated, playerAlive: { ...playerAlive }, aliveCount } });
        applyResolve({ correct, eliminated, playerAlive: { ...playerAlive }, aliveCount });
    }

    function applyResolve({ correct, eliminated, playerAlive: newAlive, aliveCount }) {
        clearTimer();

        // Color answer buttons
        answerBtns.forEach((btn, i) => {
            btn.disabled = true;
            if (i === correct) btn.classList.add('btn-primary');
            else if (myAnswer === i && i !== correct) btn.classList.add('btn-danger');
        });

        // Update alive state
        Object.assign(playerAlive, newAlive);

        if (eliminated.includes(myId)) {
            statusDiv.innerHTML = `<span style="color:#FF3B30;">❌ Wrong! You've been eliminated.</span>`;
            showToast('❌ Eliminated!', 'error');
        } else if (playerAlive[myId]) {
            statusDiv.innerHTML = `<span style="color:#34C759;">✅ Correct! You survive!</span>`;
        }

        renderPlayers();

        if (aliveCount <= 1) {
            setTimeout(() => showWinner(aliveCount), 1500);
        } else if (isHost) {
            // Next question after 3s
            questionIndex++;
            if (questionIndex >= sessionQuestions.length) {
                // Ran out of questions
                setTimeout(() => showWinner(aliveCount), 1500);
            } else {
                setTimeout(() => {
                    const nextQ = sessionQuestions[questionIndex];
                    channel.send({ type: 'broadcast', event: 'trivia_question', payload: { q: nextQ, idx: questionIndex, total: sessionQuestions.length } });
                    loadQuestion(nextQ, questionIndex, sessionQuestions.length);
                }, 3000);
            }
        }

        waitingDiv.style.display = 'none';
    }

    function showWinner(aliveCount) {
        clearTimer();
        playArea.style.display = 'none';
        state = 'results';

        if (aliveCount === 0) {
            statusDiv.innerHTML = `<span style="color:#FF3B30;font-size:1.2rem;">💀 Everyone eliminated! No winner!</span>`;
        } else {
            const winnerId = uids.find(u => playerAlive[u]);
            const name = members[winnerId]?.username || winnerId;
            statusDiv.innerHTML = `<span style="color:var(--primary-color);font-size:clamp(1rem,4vw,1.5rem);">🏆 ${escapeHtml(name)} wins Party Trivia!</span>`;
            import('../ui/animations.js').then(({ triggerConfetti }) => triggerConfetti());
        }
        renderPlayers();
    }

    // ── Answer buttons ─────────────────────────────────────────────────────
    answerBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (state !== 'playing' || myAnswer !== null || !playerAlive[myId]) return;
            const idx = parseInt(e.currentTarget.dataset.idx);
            myAnswer = idx;

            answerBtns.forEach(b => b.classList.remove('btn-primary'));
            e.currentTarget.classList.add('btn-primary');
            e.currentTarget.classList.remove('btn-secondary');

            answers[myId] = { idx, timedOut: false };
            channel.send({ type: 'broadcast', event: 'trivia_answer', payload: { uid: myId, idx } });
            waitingDiv.style.display = 'block';

            import('../ui/animations.js').then(({ playSound }) => playSound('place'));

            if (isHost) {
                const aliveWhoCanAnswer = uids.filter(u => playerAlive[u]);
                const allAnswered = aliveWhoCanAnswer.every(u => u in answers);
                if (allAnswered) { clearTimer(); resolveQuestion(); }
            }
        });
    });

    // ── Network handlers ───────────────────────────────────────────────────
    channel.on('broadcast', { event: 'trivia_tick' }, ({ payload }) => {
        if (!isHost) {
            timerSeconds = payload.s;
            timerDiv.textContent = payload.s;
        }
    });

    channel.on('broadcast', { event: 'trivia_question' }, ({ payload }) => {
        if (!isHost) {
            questionIndex = payload.idx;
            loadQuestion(payload.q, payload.idx, payload.total);
        }
    });

    channel.on('broadcast', { event: 'trivia_answer' }, ({ payload }) => {
        if (!isHost) return;
        answers[payload.uid] = { idx: payload.idx, timedOut: false };
        const aliveWhoCanAnswer = uids.filter(u => playerAlive[u]);
        const allAnswered = aliveWhoCanAnswer.every(u => u in answers);
        if (allAnswered) { clearTimer(); resolveQuestion(); }
    });

    channel.on('broadcast', { event: 'trivia_resolve' }, ({ payload }) => {
        if (isHost) return;
        applyResolve(payload);
    });

    channel.on('broadcast', { event: 'trivia_start' }, ({ payload }) => {
        if (isHost) return;
        sessionQuestions = payload.questions;
        uids.forEach(uid => { playerAlive[uid] = true; });
        if (startBtn) startBtn.style.display = 'none';
        container.querySelector('#pt-host-controls').style.display = 'none';
        loadQuestion(sessionQuestions[0], 0, sessionQuestions.length);
    });

    channel.on('broadcast', { event: 'force_game_end' }, ({ payload }) => {
        if (isHost) return;
        clearTimer();
        const pd2 = window._partyData;
        const count = payload?.matchCount || 1;
        if (pd2) pd2.matchCount = count;
        showToast('Host ended the match.', 'info');
        if (count >= 2) pd2?.forceHome();
        else onBack();
    });

    // ── Host Start Button ──────────────────────────────────────────────────
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            if (!isHost) return;
            const shuffled = [...questionBank].sort(() => 0.5 - Math.random());
            sessionQuestions = shuffled.slice(0, Math.min(15, shuffled.length));
            uids.forEach(uid => { playerAlive[uid] = true; });
            channel.send({ type: 'broadcast', event: 'trivia_start', payload: { questions: sessionQuestions } });
            container.querySelector('#pt-host-controls').style.display = 'none';
            loadQuestion(sessionQuestions[0], 0, sessionQuestions.length);
        });
    }

    if (forceEndBtn) {
        forceEndBtn.addEventListener('click', () => {
            if (confirm('End match for everyone?')) {
                clearTimer();
                const pd2 = window._partyData;
                const nextCount = (pd2?.matchCount || 0) + 1;
                channel.send({ type: 'broadcast', event: 'force_game_end', payload: { matchCount: nextCount } });
                if (pd2) pd2.matchCount = nextCount;
                if (nextCount >= 2) pd2?.forceHome();
                else onBack();
            }
        });
    }

    renderPlayers();
}
