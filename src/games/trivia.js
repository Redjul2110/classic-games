// src/games/trivia.js
// Trivia Blitz – 10 questions, timed, dynamic multiplayer support (up to 5 players) & AI opponent

import { showToast } from '../ui/toast.js';
import { getUserId, getDisplayName } from '../auth.js';
import { escapeHtml } from '../utils.js';
import { ogClient } from '../supabase.js';

const QUESTIONS = [
  { q: 'What is the capital of France?', options: ['London', 'Berlin', 'Paris', 'Madrid'], correct: 2 },
  { q: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Saturn'], correct: 1 },
  { q: 'Who wrote "Romeo and Juliet"?', options: ['Dickens', 'Shakespeare', 'Twain', 'Poe'], correct: 1 },
  { q: 'What is the largest ocean on Earth?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], correct: 3 },
  { q: 'How many sides does a hexagon have?', options: ['5', '6', '7', '8'], correct: 1 },
  { q: 'What element has the chemical symbol "O"?', options: ['Gold', 'Oxygen', 'Osmium', 'Ozone'], correct: 1 },
  { q: 'Which country invented pizza?', options: ['USA', 'Greece', 'Italy', 'France'], correct: 2 },
  { q: 'What is 12 × 12?', options: ['124', '136', '144', '148'], correct: 2 },
  { q: 'Which animal is the fastest on land?', options: ['Lion', 'Cheetah', 'Horse', 'Greyhound'], correct: 1 },
  { q: 'What is the smallest continent?', options: ['Europe', 'Antarctica', 'Australia', 'South America'], correct: 2 },
  { q: 'Who painted the Mona Lisa?', options: ['Michelangelo', 'Raphael', 'Da Vinci', 'Monet'], correct: 2 },
  { q: 'What language has the most native speakers?', options: ['English', 'Spanish', 'Mandarin', 'Hindi'], correct: 2 },
  { q: 'How many bones are in the adult human body?', options: ['186', '206', '226', '246'], correct: 1 },
  { q: 'What is the hardest natural substance on Earth?', options: ['Iron', 'Quartz', 'Diamond', 'Granite'], correct: 2 },
  { q: 'Which programming language runs in a browser?', options: ['Python', 'Java', 'JavaScript', 'C++'], correct: 2 },
];

export function renderTrivia(container, onBack, multiplayer) {
  const isMp = !!multiplayer;
  const isHost = isMp ? multiplayer.isHost : true;
  const myId = isMp ? getUserId() : 'player';

  let selected = [];
  let qIndex = 0;

  // Dynamic Multiplayer State
  let playerIds = [];
  let playerNames = {};
  let scores = {};
  let answers = {}; // Maps playerId -> { correct, score, optionIdx }

  let timerInterval = null;
  let timeLeft = 15;
  const QUESTION_TIME = 15;
  const AI_ACCURACY = 0.70;

  let channel = null;

  function initHost() {
    selected = [...QUESTIONS].sort(() => Math.random() - 0.5).slice(0, 10);
    if (isMp) {
      playerIds = multiplayer.lobby.players.map(p => p.id);
      multiplayer.lobby.players.forEach(p => playerNames[p.id] = p.name || 'Player');
    } else {
      playerIds = ['player', 'ai'];
      playerNames = { player: 'You', ai: 'AI' };
    }

    playerIds.forEach(id => scores[id] = 0);

    if (isMp && channel) {
      channel.send({ type: 'broadcast', event: 'init_state', payload: { selected, playerIds, playerNames } });
    }
  }

  if (isMp) {
    channel = ogClient.channel('game-' + multiplayer.lobby.id);
    channel.on('broadcast', { event: 'state' }, (payload) => {
      const { action, state, whoId, optionIdx } = payload.payload;

      if (action === 'sync_state') {
        if (!isHost) {
          selected = state.selected;
          playerIds = state.playerIds;
          playerNames = state.playerNames;
          scores = state.scores;
          answers = state.answers;
          qIndex = state.qIndex;
          timeLeft = state.timeLeft;

          if (state.roundResolved) {
            resolveRoundGuest(state.qCorrect);
          } else {
            render();
          }
        }
      } else if (action === 'submit_answer' && isHost) {
        if (!answers[whoId] && !timerPendingResolve) {
          processAnswer(whoId, optionIdx, selected[qIndex]);
        }
      } else if (action === 'request_state') {
        if (isHost && selected.length > 0) {
          syncHostState();
        }
      } else if (action === 'new_game' && isHost) {
        initHost();
        startGame();
      }
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        showToast('Connected to lobby! 🧠', 'success');
        if (isHost) {
          setTimeout(() => { initHost(); startGame(); }, 400);
        } else {
          setTimeout(() => { channel.send({ type: 'broadcast', event: 'state', payload: { action: 'request_state' } }); }, 600);
        }
      }
    });
  }

  function syncHostState(roundResolved = false, qCorrect = -1) {
    if (isMp && isHost && channel) {
      channel.send({
        type: 'broadcast',
        event: 'state',
        payload: {
          action: 'sync_state',
          state: { selected, playerIds, playerNames, scores, answers, qIndex, timeLeft, roundResolved, qCorrect }
        }
      });
    }
  }

  function handleExit() {
    clearTimer();
    if (channel) { channel.unsubscribe(); ogClient.removeChannel(channel); }
    onBack();
  }

  function startGame() {
    qIndex = 0;
    playerIds.forEach(id => scores[id] = 0);
    nextRound();
  }

  let timerPendingResolve = false;

  function nextRound() {
    answers = {};
    timerPendingResolve = false;

    if (qIndex >= selected.length) {
      showFinalResult();
    } else {
      render();
      if (!isMp || isHost) {
        startTimer();
      }

      if (!isMp && playerIds.includes('ai')) {
        const aiDelay = Math.floor(Math.random() * 5000) + 2000;
        setTimeout(() => {
          if (!answers['ai'] && timeLeft > 0 && !timerPendingResolve) {
            const aiCorrect = Math.random() < AI_ACCURACY;
            const q = selected[qIndex];
            const optIdx = aiCorrect ? q.correct : Math.floor(Math.random() * q.options.length);
            processAnswer('ai', optIdx, q);
          }
        }, aiDelay);
      }
    }
    if (isHost) syncHostState();
  }

  function resolveRoundGuest(qCorrect) {
    // Guest receives round resolution visuals
    timerPendingResolve = true;
    render(); // Display ✅ ⏳ accurately
    const q = selected[qIndex]; // Define q here for guest
    container.querySelectorAll('.trivia-option').forEach((btn, i) => {
      if (i === qCorrect) {
        btn.classList.add('correct');
        btn.style.border = '3px solid var(--green-primary)';
      } else {
        btn.classList.add('wrong');
        btn.style.opacity = '0.5';
      }
    });
  }

  function render() {
    if (selected.length === 0) {
      container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted);">Waiting for host to select questions...</div>`;
      return;
    }
    const q = selected[qIndex];

    // Sort players by score for the display
    const sortedPlayers = [...playerIds].sort((a, b) => scores[b] - scores[a]);

    container.innerHTML = `
      <div class="game-screen">
        <div class="game-screen-header">
          <button class="btn btn-ghost btn-sm" id="back-btn">← Back</button>
          <div class="game-screen-title">Trivia Blitz <span class="game-screen-badge ${isMp ? 'vs-player' : 'vs-ai'}">${isMp ? 'Multiplayer' : 'VS AI'}</span></div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;padding:24px;gap:16px;max-width:700px;margin:0 auto;width:100%;">
          
          <div class="score-board" style="display:flex;flex-wrap:wrap;justify-content:center;gap:15px;width:100%;">
            ${sortedPlayers.map((id, index) => `
              <div class="score-item" style="border: ${id === myId ? '2px solid var(--primary-color)' : '1px solid var(--border-color)'}; padding:8px 16px; border-radius:12px;">
                <div class="score-value" id="score-${id}">${scores[id]}</div>
                <div class="score-label">${escapeHtml(playerNames[id] || '')} ${answers[id] ? '✅' : '⏳'}</div>
              </div>
            `).join('')}
            <div class="score-divider" style="width:100%;text-align:center;">Question ${qIndex + 1} / 10</div>
          </div>

          <div class="trivia-timer-bar" style="max-width:400px;width:100%;">
            <div class="trivia-timer-fill" id="timer-fill" style="width:${(timeLeft / QUESTION_TIME) * 100}%"></div>
          </div>
          <div class="trivia-question" style="text-align:center;font-size:1.4rem;font-weight:700;margin:20px 0;">${q.q}</div>
          <div class="trivia-options" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;max-width:500px;">
            ${q.options.map((opt, i) => `
              <button class="trivia-option btn" style="text-align:left;height:auto;padding:16px;${answers[myId] && answers[myId].optionIdx === i ? 'border:3px solid var(--primary-color);' : ''}" data-idx="${i}" ${answers[myId] ? 'disabled' : ''}>${opt}</button>
            `).join('')}
          </div>
          <div style="color:var(--text-muted);font-size:0.78rem;margin-top:10px;" id="time-text">${QUESTION_TIME - timeLeft}s elapsed</div>
        </div>
      </div>
    `;

    container.querySelector('#back-btn').addEventListener('click', handleExit);

    container.querySelectorAll('.trivia-option').forEach(btn => {
      btn.addEventListener('click', () => {
        if (answers[myId]) return;
        handleMyAnswer(parseInt(btn.dataset.idx), q);
      });
    });
  }

  function startTimer() {
    clearTimer();
    timeLeft = QUESTION_TIME;
    timerInterval = setInterval(() => {
      timeLeft--;
      if (isHost) syncHostState();
      else render(); // for local AI mode

      if (timeLeft <= 0) {
        clearTimer();
        if (isMp && isHost) {
          // Force answer for any player who timed out
          playerIds.forEach(id => {
            if (!answers[id]) { answers[id] = { correct: false, score: 0, optionIdx: -1 }; }
          });
          checkRoundEnd();
        } else if (!isMp) {
          if (!answers[myId]) processAnswer(myId, -1, selected[qIndex]);
          playerIds.forEach(id => {
            if (!answers[id]) { answers[id] = { correct: false, score: 0, optionIdx: -1 }; }
          });
          checkRoundEnd();
        }
      }
    }, 1000);
  }

  function clearTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
  }

  function handleMyAnswer(idx, q) {
    if (answers[myId] || timerPendingResolve) return;

    if (isMp && !isHost) {
      // Guest sends answer to host
      channel.send({ type: 'broadcast', event: 'state', payload: { action: 'submit_answer', whoId: myId, optionIdx: idx } });
      // Optimistic UI lock
      answers[myId] = { correct: false, score: 0, optionIdx: idx };
      render();
      return;
    }

    processAnswer(myId, idx, q);
  }

  function processAnswer(whoId, idx, q) {
    if (answers[whoId]) return;
    const myCorrect = idx === q.correct;
    const timingBonus = Math.max(0, timeLeft - 5);
    const scoreBonus = myCorrect ? 10 + timingBonus : 0;

    answers[whoId] = { correct: myCorrect, score: scoreBonus, optionIdx: idx };
    scores[whoId] += scoreBonus;

    if (isHost) syncHostState();

    if (!isMp || isHost) {
      checkRoundEnd();
    }
    render();
  }

  function checkRoundEnd() {
    if (timerPendingResolve) return;
    const allAnswered = playerIds.every(id => !!answers[id]);
    if (allAnswered) {
      clearTimer();
      timerPendingResolve = true;
      resolveRound();
    }
  }

  function resolveRound() {
    const q = selected[qIndex];

    // Add up scores from network players
    playerIds.forEach(id => {
      if (id !== myId && answers[id]) {
        scores[id] += answers[id].score;
      }
    });

    render(); // Force re-render of scoreboard and buttons with new scores

    container.querySelectorAll('.trivia-option').forEach((btn, i) => {
      btn.disabled = true;
      btn.style.border = 'none'; // reset selection border

      const myAns = answers[myId];
      if (i === q.correct) btn.classList.add('correct');
      else if (myAns && i === myAns.optionIdx && !myAns.correct) btn.classList.add('wrong');
    });

    const myAns = answers[myId];
    showToast(
      `You: ${myAns && myAns.correct ? '✅' : myAns && myAns.optionIdx === -1 ? '⏰' : '❌'}`,
      myAns && myAns.correct ? 'success' : 'error', 2000
    );

    setTimeout(() => {
      qIndex++;
      nextRound();
    }, 2500);
  }

  function showFinalResult() {
    const sortedIds = [...playerIds].sort((a, b) => scores[b] - scores[a]);
    const winnerId = sortedIds[0];
    const isMeWinner = winnerId === myId;

    if (isMeWinner) import('../ui/animations.js').then(({ triggerConfetti }) => triggerConfetti());

    container.innerHTML = `
      <div class="game-screen" style="align-items:center;justify-content:center;">
        <div style="text-align:center;padding:40px;max-width:480px;">
          <div style="font-size:4rem;margin-bottom:16px;">
            ${isMeWinner ? '★' : '😔'}
          </div>
          <div style="font-size:2rem;font-weight:900;margin-bottom:8px;">
            ${isMeWinner ? 'You Win!' : `${escapeHtml(playerNames[winnerId])} Wins!`}
          </div>
          <div style="color:var(--text-secondary);margin-bottom:24px;display:flex;flex-direction:column;gap:8px;">
            ${sortedIds.map((id, index) => `
                <div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.1);padding:4px 0;">
                    <span>${index + 1}. ${escapeHtml(playerNames[id])} ${id === myId ? '(You)' : ''}</span>
                    <span style="font-weight:bold;">${scores[id]} pts</span>
                </div>
            `).join('')}
          </div>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
            ${(!isMp || isHost) ? `<button class="btn btn-primary" id="play-again-btn">Play Again</button>` : `<div style="color:var(--text-muted)">Waiting for host to replay...</div>`}
            <button class="btn btn-ghost" id="exit-btn">Exit</button>
          </div>
        </div>
      </div>
    `;
    const replayBtn = container.querySelector('#play-again-btn');
    if (replayBtn) {
      replayBtn.addEventListener('click', () => {
        if (isMp && channel) channel.send({ type: 'broadcast', event: 'new_game' });
        if (isMp) { initHost(); startGame(); }
        else startGame();
      });
    }
    container.querySelector('#exit-btn').addEventListener('click', handleExit);
  }

  if (!isMp) {
    initHost();
    startGame();
  } else {
    render(); // show waiting text
  }
}
