import { showToast } from '../ui/toast.js';
import { ogClient } from '../supabase.js';

const WORD_LIST = [
  'CASTLE', 'KNIGHT', 'DRAGON', 'WIZARD', 'SHIELD', 'BATTLE', 'MYSTIC', 'PLAYER',
  'GAMING', 'LEGEND', 'PORTAL', 'QUEST', 'REALM', 'SWORD', 'TOWER', 'ARROW',
  'FOREST', 'MAGIC', 'POWER', 'STORM', 'FLAME', 'FROST', 'GHOST', 'ANGEL',
  'BINARY', 'CIPHER', 'CHROME', 'DIVIDE', 'ENERGY', 'FILTER', 'GLITCH', 'HARBOR',
  'IMPACT', 'JUNGLE', 'KERNEL', 'LAUNCH', 'MARBLE', 'NETHER', 'ONWARD', 'PILLAR',
  'QUARTZ', 'RANSOM', 'SCRIPT', 'TACTIC', 'UNIQUE', 'VACUUM', 'WIDGET', 'XYSTER',
  'YELLOW', 'ZENITH', 'SPRING', 'SUMMER', 'WINTER', 'RIVER', 'OCEAN', 'PLANET',
];

// Frequency-ordered English letters (most common first)
const LETTER_FREQ = 'ETAOINSHRDLCUMWFGYPBVKJXQZ'.split('');

const HANGMAN_SVG = (wrong) => `
  <svg class="hangman-svg" viewBox="0 0 200 220" width="180" height="180" xmlns="http://www.w3.org/2000/svg">
    ${wrong >= 1 ? `<line x1="20" y1="210" x2="180" y2="210" stroke="#555" stroke-width="4" stroke-linecap="round"/>` : ''}
    ${wrong >= 2 ? `<line x1="60" y1="210" x2="60" y2="20" stroke="#555" stroke-width="4" stroke-linecap="round"/>` : ''}
    ${wrong >= 3 ? `<line x1="60" y1="20" x2="130" y2="20" stroke="#555" stroke-width="4" stroke-linecap="round"/>` : ''}
    ${wrong >= 4 ? `<line x1="130" y1="20" x2="130" y2="45" stroke="#555" stroke-width="4" stroke-linecap="round"/>` : ''}
    ${wrong >= 5 ? `<circle cx="130" cy="62" r="16" stroke="#e74c3c" stroke-width="3" fill="none"/>` : ''}
    ${wrong >= 6 ? `<line x1="130" y1="78" x2="130" y2="130" stroke="#e74c3c" stroke-width="3" stroke-linecap="round"/>` : ''}
    ${wrong >= 7 ? `<line x1="130" y1="95" x2="100" y2="115" stroke="#e74c3c" stroke-width="3" stroke-linecap="round"/>` : ''}
    ${wrong >= 8 ? `<line x1="130" y1="95" x2="160" y2="115" stroke="#e74c3c" stroke-width="3" stroke-linecap="round"/>` : ''}
    ${wrong >= 9 ? `<line x1="130" y1="130" x2="105" y2="160" stroke="#e74c3c" stroke-width="3" stroke-linecap="round"/>` : ''}
    ${wrong >= 10 ? `<line x1="130" y1="130" x2="155" y2="160" stroke="#e74c3c" stroke-width="3" stroke-linecap="round"/>` : ''}
    ${wrong >= 11 ? `<circle cx="124" cy="58" r="1.5" fill="#e74c3c"/> <circle cx="136" cy="58" r="1.5" fill="#e74c3c"/>` : ''}
    ${wrong >= 12 ? `<path d="M 125 68 Q 130 64 135 68" stroke="#e74c3c" stroke-width="2" fill="none"/>` : ''}
  </svg>`;

export function renderWordGuess(container, onBack, multiplayer) {
  const isMp = !!multiplayer;
  const isHost = isMp ? multiplayer.isHost : true;

  let word = '';
  let guessed = new Set();
  let maxWrong = 12;
  let scores = { teamWin: 0, aiLoss: 0 };
  let gameOver = false;
  let channel = null;
  let aiTimer = null; // VS AI: periodic guess timer

  // ─── AI Timer (VS AI only) ───
  function startAiTimer() {
    clearAiTimer();
    if (isMp || !word) return;
    aiTimer = setInterval(() => {
      if (gameOver || !word) { clearAiTimer(); return; }
      // Pick next unguessed letter — frequency ordered, with 20% random deviation
      const remaining = Math.random() < 0.80
        ? LETTER_FREQ.filter(l => !guessed.has(l))
        : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(l => !guessed.has(l));
      if (!remaining.length) { clearAiTimer(); return; }
      const letter = remaining[Math.floor(Math.random() * Math.min(5, remaining.length))];
      guess(letter);
    }, 3000);
  }

  function clearAiTimer() {
    if (aiTimer) { clearInterval(aiTimer); aiTimer = null; }
  }

  if (isMp) {
    channel = ogClient.channel('game-' + multiplayer.lobby.id);
    channel.on('broadcast', { event: 'state' }, (payload) => {
      const { action, letter, newWordStr } = payload.payload;
      if (action === 'guess') {
        if (!guessed.has(letter) && word) {
          guessed.add(letter);
          checkEnd();
          render();
        }
      } else if (action === 'new_game') {
        word = newWordStr;
        guessed = new Set();
        gameOver = false;
        render();
      } else if (action === 'request_state' && isHost && word) {
        channel.send({ type: 'broadcast', event: 'state', payload: { action: 'new_game', newWordStr: word } });
      }
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        showToast('Connected to partner! 📝', 'success');
        if (isHost && !word) {
          setTimeout(() => newWord(true), 400);
        } else if (!isHost) {
          setTimeout(() => {
            channel.send({ type: 'broadcast', event: 'state', payload: { action: 'request_state' } });
          }, 600);
        }
      }
    });
  }

  function handleExit() {
    clearAiTimer();
    if (channel) { channel.unsubscribe(); ogClient.removeChannel(channel); }
    onBack();
  }

  function newWord(broadcast = false) {
    clearAiTimer();
    word = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
    guessed = new Set();
    gameOver = false;
    if (isMp && broadcast && channel) {
      channel.send({ type: 'broadcast', event: 'state', payload: { action: 'new_game', newWordStr: word } });
    }
    if (!isMp) startAiTimer();
  }

  function wrongCount() {
    return [...guessed].filter(l => !word.includes(l)).length;
  }

  function isWordGuessed() {
    return word && word.split('').every(l => guessed.has(l));
  }

  function checkEnd() {
    if (gameOver || !word) return;
    const wrong = wrongCount();
    const solved = isWordGuessed();

    if (solved) {
      scores.teamWin++;
      gameOver = true;
      clearAiTimer();
      import('../ui/animations.js').then(({ triggerConfetti }) => triggerConfetti());
    } else if (wrong >= maxWrong) {
      scores.aiLoss++;
      gameOver = true;
      clearAiTimer();
    }
  }

  function guess(letter) {
    if (!word || guessed.has(letter) || gameOver) return;
    guessed.add(letter);
    if (isMp && channel) {
      channel.send({ type: 'broadcast', event: 'state', payload: { action: 'guess', letter } });
    }
    checkEnd();
    render();
  }

  function render() {
    const wrong = wrongCount();
    const solved = isWordGuessed();
    const lost = wrong >= maxWrong;

    container.innerHTML = `
      <div class="game-screen">
        <div class="game-screen-header">
          <button class="btn btn-ghost btn-sm" id="back-btn">← Back</button>
          <div class="game-screen-title">Word Guess <span class="game-screen-badge ${isMp ? 'vs-player' : 'vs-ai'}">${isMp ? 'Co-op' : 'VS AI'}</span></div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;padding:16px 24px;gap:12px;max-width:600px;margin:0 auto;width:100%;">
          <div class="score-board">
            <div class="score-item"><div class="score-value player-score">${scores.teamWin}</div><div class="score-label">${isMp ? 'Team Wins' : 'You'}</div></div>
            <div class="score-divider">${isMp ? '-' : 'VS'}</div>
            <div class="score-item"><div class="score-value ai-score">${scores.aiLoss}</div><div class="score-label">${isMp ? 'Losses' : 'AI 🤖'}</div></div>
          </div>

          ${!isMp ? `<div style="font-size:0.8rem;color:var(--text-muted);font-style:italic;">🤖 AI is guessing too — race it!</div>` : ''}

          <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap;justify-content:center;">
            ${HANGMAN_SVG(wrong)}
            <div>
              <div style="color:var(--text-muted);font-size:0.8rem;margin-bottom:8px;">
                Wrong guesses: ${wrong} / ${maxWrong}
              </div>
              ${wrong > 0 ? `<div style="color:var(--red-light);font-size:0.82rem;font-weight:600;letter-spacing:2px;">
                ${[...guessed].filter(l => !word.includes(l)).join(' ')}
              </div>` : '<div style="color:var(--text-muted);font-size:0.8rem;">No wrong guesses yet</div>'}
            </div>
          </div>

          <div class="wordguess-word">
            ${word ? word.split('').map(l => `
              <div class="letter-box ${guessed.has(l) ? 'revealed' : lost ? 'wrong' : ''}">
                ${guessed.has(l) || lost ? l : ''}
              </div>
            `).join('') : '<div style="color:var(--text-muted);">Waiting for word...</div>'}
          </div>

          ${!solved && !lost && word ? `
            <div class="alphabet-keyboard">
              ${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => {
      const correct = guessed.has(l) && word.includes(l);
      const wrong2 = guessed.has(l) && !word.includes(l);
      return `<button class="key-btn ${correct ? 'correct' : wrong2 ? 'wrong' : ''}"
                  data-letter="${l}" ${guessed.has(l) ? 'disabled' : ''}>${l}</button>`;
    }).join('')}
            </div>
          ` : `
            <div style="text-align:center;margin-top:8px;">
              <div style="font-size:1.5rem;font-weight:900;margin-bottom:6px;">
                ${solved ? '⭐ You got it!' : lost ? '💀 Game Over' : ''}
              </div>
              ${lost ? `<div style="color:var(--text-muted);">The word was: <strong style="color:var(--orange-primary)">${word}</strong></div>` : ''}
              ${(solved || lost) ? `
              <div style="margin-top:16px;display:flex;gap:12px;justify-content:center;">
                ${(!isMp || isHost) ? `<button class="btn btn-primary" id="new-word-btn">Next Word</button>` : `<div style="color:var(--text-muted);">Waiting for host to start next word...</div>`}
                <button class="btn btn-ghost" id="exit-btn">Exit</button>
              </div>` : ''}
            </div>
          `}
        </div>
      </div>
    `;

    container.querySelector('#back-btn')?.addEventListener('click', handleExit);
    container.querySelector('#exit-btn')?.addEventListener('click', handleExit);
    container.querySelector('#new-word-btn')?.addEventListener('click', () => {
      newWord(true);
      render();
    });

    container.querySelectorAll('.key-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => guess(btn.dataset.letter));
    });
  }

  if (!isMp) {
    newWord(false); // also starts AI timer
    render();
  } else if (isHost) {
    // host waits for SUBSCRIBED before sending word
  } else {
    // guest shows loading until init arrives
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted);">📝 Connecting to game...</div>`;
  }
  if (!isMp) render();
}

