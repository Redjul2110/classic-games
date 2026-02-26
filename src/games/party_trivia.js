// src/games/party_trivia.js
// Battle Royale Trivia (Wer wird Millionär style) für bis zu 30 Spieler

import { escapeHtml } from '../utils.js';
import { showToast } from '../ui/toast.js';
import { getUserId } from '../auth.js';

// Pool of questions (easy -> hard)
const QUESTIONS = [
    // Level 1 (Easy)
    { q: "Was ist die Hauptstadt von Deutschland?", a: ["Berlin", "München", "Hamburg", "Köln"], correct: 0 },
    { q: "Wie viele Farben hat ein Regenbogen?", a: ["5", "7", "6", "8"], correct: 1 },
    { q: "Welches Tier schnurrt?", a: ["Hund", "Katze", "Vogel", "Pferd"], correct: 1 },
    // Level 2
    { q: "Wer schrieb 'Romeo und Julia'?", a: ["Goethe", "Schiller", "Shakespeare", "J.K. Rowling"], correct: 2 },
    { q: "Welcher Planet ist der rote Planet?", a: ["Venus", "Mars", "Jupiter", "Saturn"], correct: 1 },
    { q: "Wie viele Bundesländer hat Deutschland?", a: ["14", "15", "16", "17"], correct: 2 },
    // Level 3
    { q: "Was ist die chemische Formel für Wasser?", a: ["CO2", "H2O", "O2", "NaCl"], correct: 1 },
    { q: "Welcher Ozean ist der größte?", a: ["Atlantik", "Pazifik", "Indischer Ozean", "Arktischer Ozean"], correct: 1 },
    { q: "Wie hieß der erste Mensch auf dem Mond?", a: ["Yuri Gagarin", "Buzz Aldrin", "Neil Armstrong", "Michael Collins"], correct: 2 },
    // Level 4
    { q: "In welchem Jahr fiel die Berliner Mauer?", a: ["1987", "1989", "1990", "1991"], correct: 1 },
    { q: "Welches ist das härteste bekannte natürliche Material?", a: ["Gold", "Eisen", "Diamant", "Titan"], correct: 2 },
    // Level 5 (Hard)
    { q: "Wer malte die Mona Lisa?", a: ["Vincent van Gogh", "Pablo Picasso", "Leonardo da Vinci", "Michelangelo"], correct: 2 },
    { q: "Wie lautet die Hauptstadt von Australien?", a: ["Sydney", "Melbourne", "Canberra", "Perth"], correct: 2 },
    { q: "Wie viele Knochen hat ein erwachsener Mensch?", a: ["206", "208", "210", "212"], correct: 0 },
    { q: "Wer ist der Autor von 'Der Herr der Ringe'?", a: ["George R.R. Martin", "J.R.R. Tolkien", "C.S. Lewis", "J.K. Rowling"], correct: 1 }
];

export function renderPartyTrivia(container, onBack) {
    const partyData = window._partyData;
    if (!partyData) {
        onBack();
        return;
    }

    const { channel, code, isHost, members } = partyData;
    const myId = getUserId();
    const uids = Object.keys(members).sort();

    let state = 'waiting'; // waiting, playing, review, over
    let playerMap = {}; // uid -> { username, alive }

    uids.forEach(uid => {
        playerMap[uid] = { username: members[uid].username, alive: true };
    });

    let currentQuestionIndex = 0;
    let selectedQuestions = [];
    let timeRemaining = 15;
    let timerInterval = null;
    let myAnswer = null; // index 0-3
    let winnerId = null;

    container.innerHTML = `
        <div class="game-screen" style="max-width:800px;margin:0 auto;height:100vh;display:flex;flex-direction:column;">
            <div class="game-screen-header">
                <button class="btn btn-ghost btn-sm" id="pt-back">← Leave</button>
                <div class="game-screen-title">Party Trivia <span class="game-screen-badge vs-player">${code}</span></div>
                ${isHost ? `<button class="btn btn-sm btn-ghost danger" id="pt-force-end" style="margin-left:auto;">🛑 End Match</button>` : '<div style="margin-left:auto;"></div>'}
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
                    <div style="font-size:0.95rem;color:var(--text-secondary);margin-bottom:16px;">Round <span id="pt-round-num">1</span> / 15</div>
                    
                    <div id="pt-question" style="background:var(--bg-card);border:2px solid var(--border-color);border-radius:12px;padding:clamp(12px,4vw,24px);font-size:clamp(1rem,3.5vw,1.4rem);font-weight:bold;text-align:center;width:100%;margin-bottom:16px;">
                        Question?
                    </div>
                    
                    <div id="pt-answers" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;">
                        <button class="btn btn-secondary answer-btn" data-idx="0" style="min-height:52px;font-size:clamp(0.85rem,2.5vw,1rem);white-space:normal;word-break:break-word;">A</button>
                        <button class="btn btn-secondary answer-btn" data-idx="1" style="min-height:52px;font-size:clamp(0.85rem,2.5vw,1rem);white-space:normal;word-break:break-word;">B</button>
                        <button class="btn btn-secondary answer-btn" data-idx="2" style="min-height:52px;font-size:clamp(0.85rem,2.5vw,1rem);white-space:normal;word-break:break-word;">C</button>
                        <button class="btn btn-secondary answer-btn" data-idx="3" style="min-height:52px;font-size:clamp(0.85rem,2.5vw,1rem);white-space:normal;word-break:break-word;">D</button>
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

    const backBtn = container.querySelector('#pt-back');
    const forceEndBtn = container.querySelector('#pt-force-end');
    const startBtn = container.querySelector('#pt-start-btn');
    const statusDiv = container.querySelector('#pt-status');
    const playArea = container.querySelector('#pt-play-area');

    const timerDiv = container.querySelector('#pt-timer');
    const roundSpan = container.querySelector('#pt-round-num');
    const questionDiv = container.querySelector('#pt-question');
    const answerBtns = container.querySelectorAll('.answer-btn');
    const playerListDiv = container.querySelector('#pt-player-list');

    backBtn.addEventListener('click', () => {
        if (timerInterval) clearInterval(timerInterval);
        onBack();
    });

    if (forceEndBtn) {
        forceEndBtn.addEventListener('click', () => {
            if (confirm("End match for everyone?")) {
                channel.send({ type: 'broadcast', event: 'force_game_end' });
                if (timerInterval) clearInterval(timerInterval);
                onBack();
            }
        });
    }

    startBtn.addEventListener('click', () => {
        if (isHost) {
            // Pick 15 random questions
            const shuffled = [...QUESTIONS].sort(() => 0.5 - Math.random());
            const sessionQs = shuffled.slice(0, 15);
            channel.send({ type: 'broadcast', event: 'trivia_start', payload: { questions: sessionQs } });
            startGame(sessionQs);
        }
    });

    answerBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (state !== 'playing' || myAnswer !== null || !playerMap[myId].alive) return;
            const idx = parseInt(e.target.dataset.idx);
            myAnswer = idx;

            // Highlight selection
            answerBtns.forEach(b => b.classList.remove('btn-primary'));
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-secondary');

            import('../ui/animations.js').then(({ playSound }) => playSound('place'));

            // Send answer to host implicitly by just sending to everyone
            channel.send({ type: 'broadcast', event: 'trivia_answer', payload: { uid: myId, answerIdx: idx } });
        });
    });

    // ─── Network Channels ───
    let currentRoundAnswers = {}; // uid -> answerIdx

    channel.on('broadcast', { event: 'force_game_end' }, () => {
        showToast('Host ended the match.', 'info');
        if (timerInterval) clearInterval(timerInterval);
        onBack();
    });

    channel.on('broadcast', { event: 'trivia_start' }, ({ payload }) => {
        startGame(payload.questions);
    });

    channel.on('broadcast', { event: 'trivia_answer' }, ({ payload }) => {
        currentRoundAnswers[payload.uid] = payload.answerIdx;
    });

    channel.on('broadcast', { event: 'trivia_round_result' }, ({ payload }) => {
        handleRoundResult(payload.eliminatedUids, payload.correctIdx);
    });

    channel.on('broadcast', { event: 'trivia_next_round' }, () => {
        startNextRound();
    });

    channel.on('broadcast', { event: 'trivia_end' }, ({ payload }) => {
        endGame(payload.winnerId);
    });

    // ─── Logic ───
    function startGame(qs) {
        selectedQuestions = qs;
        currentQuestionIndex = 0;

        uids.forEach(uid => playerMap[uid].alive = true);
        winnerId = null;

        startBtn.style.display = 'none';
        statusDiv.style.display = 'none';
        playArea.style.display = 'flex';

        startNextRound();
    }

    function startNextRound() {
        if (currentQuestionIndex >= selectedQuestions.length) {
            if (isHost) evaluateFinalWinner();
            return;
        }

        state = 'playing';
        myAnswer = null;
        currentRoundAnswers = {};

        const qObj = selectedQuestions[currentQuestionIndex];
        roundSpan.textContent = currentQuestionIndex + 1;
        questionDiv.textContent = qObj.q;

        answerBtns.forEach((btn, i) => {
            btn.textContent = qObj.a[i];
            btn.className = 'btn btn-secondary answer-btn'; // reset
            btn.disabled = !playerMap[myId].alive;
        });

        if (!playerMap[myId].alive) {
            questionDiv.textContent = `(Spectating) ${qObj.q}`;
        }

        renderPlayerList();

        timeRemaining = 15;
        timerDiv.textContent = timeRemaining;
        timerDiv.style.color = 'var(--accent-color)';

        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            timeRemaining--;
            timerDiv.textContent = timeRemaining;

            if (timeRemaining <= 5) timerDiv.style.color = 'var(--red-primary)';

            if (timeRemaining <= 0) {
                clearInterval(timerInterval);
                if (isHost) evaluateRound();
            }
        }, 1000);
    }

    function evaluateRound() {
        const qObj = selectedQuestions[currentQuestionIndex];
        const correct = qObj.correct;
        const eliminatedUids = [];

        // Check everyone who is alive, did they answer correctly?
        uids.forEach(uid => {
            if (playerMap[uid].alive) {
                const ans = currentRoundAnswers[uid];
                if (ans === undefined || ans !== correct) {
                    eliminatedUids.push(uid);
                }
            }
        });

        channel.send({ type: 'broadcast', event: 'trivia_round_result', payload: { eliminatedUids, correctIdx: correct } });
        handleRoundResult(eliminatedUids, correct);
    }

    function handleRoundResult(eliminatedUids, correctIdx) {
        state = 'review';

        // Highlight correct and wrong 
        answerBtns.forEach((btn, i) => {
            if (i === correctIdx) {
                btn.className = 'btn answer-btn';
                btn.style.backgroundColor = 'var(--green-primary)';
                btn.style.color = 'white';
            } else if (myAnswer === i && myAnswer !== correctIdx) {
                btn.className = 'btn answer-btn';
                btn.style.backgroundColor = 'var(--red-primary)';
                btn.style.color = 'white';
            } else {
                btn.className = 'btn btn-secondary answer-btn';
                btn.style.opacity = '0.5';
            }
        });

        eliminatedUids.forEach(uid => {
            playerMap[uid].alive = false;
        });

        renderPlayerList();

        const alivePlayers = uids.filter(u => playerMap[u].alive);

        if (eliminatedUids.includes(myId)) {
            showToast('Falsche Antwort! Du bist ausgeschieden.', 'error');
            import('../ui/animations.js').then(({ playSound }) => playSound('error'));
        } else if (playerMap[myId].alive) {
            import('../ui/animations.js').then(({ playSound }) => playSound('success'));
        }

        // Host handles next step
        if (isHost) {
            setTimeout(() => {
                if (alivePlayers.length === 0) {
                    // Everyone died this round, no winner
                    channel.send({ type: 'broadcast', event: 'trivia_end', payload: { winnerId: null } });
                    endGame(null);
                } else if (alivePlayers.length === 1 && uids.length > 1) {
                    // One winner remains
                    channel.send({ type: 'broadcast', event: 'trivia_end', payload: { winnerId: alivePlayers[0] } });
                    endGame(alivePlayers[0]);
                } else {
                    currentQuestionIndex++;
                    channel.send({ type: 'broadcast', event: 'trivia_next_round', payload: {} });
                    startNextRound();
                }
            }, 4000);
        }
    }

    function evaluateFinalWinner() {
        const alivePlayers = uids.filter(u => playerMap[u].alive);
        const winId = alivePlayers.length > 0 ? alivePlayers[0] : null; // if multiple survived 15 rounds, give it to the first for simplicity
        channel.send({ type: 'broadcast', event: 'trivia_end', payload: { winnerId: winId } });
        endGame(winId);
    }

    function endGame(winId) {
        state = 'over';
        playArea.style.display = 'none';
        statusDiv.style.display = 'block';

        if (winId) {
            statusDiv.innerHTML = `<span style="font-size:2rem;color:var(--primary-color)">🏆 ${escapeHtml(playerMap[winId].username)} GEWINNT DIE MILLION!</span>`;
            if (winId === myId) {
                import('../ui/animations.js').then(({ triggerConfetti }) => triggerConfetti());
            }
        } else {
            statusDiv.innerHTML = `<span style="font-size:2rem;color:var(--red-primary)">💀 Alle wurden eliminiert!</span>`;
        }

        if (isHost) {
            startBtn.style.display = 'inline-block';
            startBtn.textContent = 'Neues Spiel starten';
        }
    }

    function renderPlayerList() {
        playerListDiv.innerHTML = uids.map(uid => {
            const p = playerMap[uid];
            return `
                 <div style="background:var(--bg-elevated);padding:4px 12px;border-radius:100px;opacity:${p.alive ? '1' : '0.3'};text-decoration:${p.alive ? 'none' : 'line-through'};border:1px solid ${p.alive ? 'var(--primary-color)' : 'transparent'};">
                     ${escapeHtml(p.username)} ${p.alive ? '🟢' : '💀'}
                 </div>
            `;
        }).join('');
    }

    // Init display
    renderPlayerList();
}
