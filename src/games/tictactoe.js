// src/games/tictactoe.js
// Tic-Tac-Toe with perfect Minimax AI (fixed: proper variable scoping, no cheats)

import { getDisplayName, getUserId, hasAiAccess } from '../auth.js';
import { UI_ICONS } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { triggerConfetti } from '../ui/animations.js';
import { ogClient } from '../supabase.js';

export function renderTicTacToe(container, onBack, multiplayer) {
  let board = Array(9).fill(null);
  const isMp = !!multiplayer;
  const isHost = isMp ? multiplayer.isHost : true;

  // In MP, Host is always X initially. Guest is O.
  // In VS AI, Player is X, AI is O.
  let playerSymbol = isMp ? (isHost ? 'X' : 'O') : 'X';
  let opponentSymbol = isMp ? (isHost ? 'O' : 'X') : 'O';
  let currentTurnSymbol = 'X'; // X always goes first

  let gameOver = false;
  let aiMovePending = false;
  let aiDifficulty = 'hard'; // default for tic-tac-toe
  let diffSelected = isMp; // In MP, bypass difficulty select
  let scores = { player: 0, opponent: 0, draws: 0 };
  let autoHelp = false;
  let channel = null;

  if (isMp) {
    // Setup Supabase Realtime for Multiplayer
    channel = ogClient.channel('game-' + multiplayer.lobby.id);
    channel.on('broadcast', { event: 'move' }, (payload) => {
      const { idx, symbol } = payload.payload;
      if (board[idx] || gameOver) return;
      board[idx] = symbol;
      currentTurnSymbol = playerSymbol; // it's our turn now
      checkEnd();
      render();
    }).on('broadcast', { event: 'new_game' }, () => {
      resetBoard(false); // don't broadcast back
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        showToast('Connected to opponent!', 'success');
      }
    });
  }

  function checkEnd() {
    const result = checkWinner(board);
    if (result) {
      gameOver = true;
      if (result === 'draw') { scores.draws++; showToast('Draw! [DRAW]', 'info'); }
      else if (result === playerSymbol) { scores.player++; showToast('You win! ★', 'success'); triggerConfetti(); }
      else { scores.opponent++; showToast(isMp ? 'Opponent wins!' : 'AI wins! [AI]', 'error'); }

      const winLine = getWinLine(board);
      if (winLine) {
        const cells = container.querySelectorAll('.ttt-cell');
        winLine.forEach(i => cells[i]?.classList.add('winner'));
      }
      setTimeout(() => {
        const msg = result === 'draw' ? "Draw! [DRAW]" : result === playerSymbol ? 'You win! ★' : (isMp ? 'Opponent wins!' : 'AI wins! [AI]');
        showResultCard(container, msg, `Score: You ${scores.player} – ${isMp ? 'Opp' : 'AI'} ${scores.opponent}`, newGame, handleExit);
      }, 900);
      return true;
    }
    return false;
  }

  function handleExit() {
    if (channel) { channel.unsubscribe(); ogClient.removeChannel(channel); }
    onBack();
  }

  let isInitialized = false;

  function render() {
    if (!diffSelected) {
      container.innerHTML = `
        <div class="game-screen">
          <div class="game-screen-header">
            <button class="btn btn-ghost btn-sm" id="back-btn">← Back</button>
            <div class="game-screen-title">
              Tic-Tac-Toe
              <div class="game-screen-badge vs-ai">VS AI</div>
            </div>
          </div>
          <div class="difficulty-screen" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; gap: 30px; padding: 24px;">
            <h2 class="difficulty-title">Select AI Difficulty</h2>
            <div class="difficulty-options">
              <div class="diff-card" data-diff="easy">
                <div class="diff-card-header">Easy</div>
                <div class="diff-card-desc">Random moves. A relaxing game.</div>
              </div>
              <div class="diff-card" data-diff="hard">
                <div class="diff-card-header">Hard</div>
                <div class="diff-card-desc">50% chance the AI makes the best move.</div>
              </div>
              <div class="diff-card" data-diff="impossible" style="border-bottom: 3px solid var(--red-primary);">
                <div class="diff-card-header">Impossible</div>
                <div class="diff-card-desc">Perfect Minimax AI. You cannot win.</div>
              </div>
            </div>
          </div>
        </div>
      `;
      container.querySelector('#back-btn').addEventListener('click', handleExit);
      container.querySelectorAll('.diff-card').forEach(card => {
        card.addEventListener('click', (e) => {
          aiDifficulty = e.currentTarget.dataset.diff;
          diffSelected = true;
          resetBoard(false);
        });
      });
      return;
    }

    const isPlayerTurn = !gameOver && currentTurnSymbol === playerSymbol;

    if (isInitialized) {
      // Soft Update: Nur Board und Texte tauschen (verhindert DOM Thrashing / Glitch)
      container.querySelector('.player-score').textContent = scores.player;
      container.querySelector('.ai-score').textContent = scores.opponent;

      const turnIndicator = container.querySelector('.turn-indicator');
      if (turnIndicator) {
        turnIndicator.innerHTML = `
          <span class="turn-dot ${!isPlayerTurn ? 'ai' : ''}"></span>
          ${isPlayerTurn ? 'Your turn' : (isMp ? 'Opponent thinking…' : '[AI] AI thinking…')}
        `;
      }

      const tttBoard = container.querySelector('#ttt-board');
      if (tttBoard) {
        tttBoard.innerHTML = board.map((cell, i) => `
          <div class="ttt-cell ${cell ? 'taken ' + cell.toLowerCase() : ''}" data-idx="${i}">
            ${cell || ''}
          </div>
        `).join('');
      }
    } else {
      // Hard Update: Komplette UI generieren
      isInitialized = true;
      container.innerHTML = `
        <div class="game-screen">
          <div class="game-screen-header">
            <button class="btn btn-ghost btn-sm" id="back-btn">← Back</button>
            <div class="game-screen-title" style="display:flex;align-items:center;gap:12px;">
              Tic-Tac-Toe
              <div class="game-screen-badge ${isMp ? 'vs-player' : 'vs-ai'}">${isMp ? 'Multiplayer' : 'VS AI'}</div>
              ${!isMp ? `<div class="game-screen-badge" style="background:var(--bg-glass);border:1px solid var(--border-accent);color:var(--text-secondary);">${aiDifficulty.toUpperCase()}</div>` : ''}
            </div>
          </div>
          <div style="flex:1; display:flex; flex-direction:column; align-items:center; padding:24px; gap:20px;">
            <div class="score-board">
              <div class="score-item">
                <div class="score-value player-score">${scores.player}</div>
                <div class="score-label">You (${playerSymbol})</div>
              </div>
              <div class="score-divider">–</div>
              <div class="score-item">
                <div class="score-value" style="color:var(--text-muted);">${scores.draws}</div>
                <div class="score-label">Draws</div>
              </div>
              <div class="score-divider">–</div>
              <div class="score-item">
                <div class="score-value ai-score">${scores.opponent}</div>
                <div class="score-label">${isMp ? 'Opponent' : 'AI'} (${opponentSymbol})</div>
              </div>
            </div>

            <div class="game-status-bar" style="width:100%;max-width:400px;border-radius:var(--radius-md);">
              <div class="turn-indicator">
                <span class="turn-dot ${!isPlayerTurn ? 'ai' : ''}"></span>
                ${isPlayerTurn ? 'Your turn' : (isMp ? 'Opponent thinking…' : '[AI] AI thinking…')}
              </div>
              <div style="display:flex;gap:8px;">
                ${isMp && !isHost ? '' : '<button class="btn btn-ghost btn-sm" id="new-game-btn">New Game</button>'}
                ${hasAiAccess ? `<button class="btn btn-ghost btn-sm" id="help-btn" title="Toggle Auto-AI Hints" style="font-size:1.2rem;padding:4px 8px; ${autoHelp ? 'background:rgba(241, 196, 15, 0.2); border: 1px solid #f1c40f;' : ''}">💡</button>` : ''}
              </div>
            </div>

            <div class="ttt-board" id="ttt-board">
              ${board.map((cell, i) => `
                <div class="ttt-cell ${cell ? 'taken ' + cell.toLowerCase() : ''}" data-idx="${i}">
                  ${cell || ''}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;

      container.querySelector('#back-btn').addEventListener('click', handleExit);
      if (isMp ? isHost : true) {
        container.querySelector('#new-game-btn')?.addEventListener('click', newGame);
      }
      container.querySelector('#help-btn')?.addEventListener('click', () => handleHelp(false));
    }

    if (isPlayerTurn) {
      container.querySelectorAll('.ttt-cell:not(.taken)').forEach(cell => {
        cell.addEventListener('click', () => handlePlayerMove(parseInt(cell.dataset.idx)));
      });
    } else if (!gameOver && !isMp && !aiMovePending) {
      // Only schedule ONE AI move at a time
      aiMovePending = true;
      setTimeout(() => { aiMovePending = false; aiMove(); }, 500);
    }
  }

  function handlePlayerMove(idx) {
    if (board[idx] || gameOver || aiMovePending || currentTurnSymbol !== playerSymbol) return;
    board[idx] = playerSymbol;
    currentTurnSymbol = opponentSymbol;

    if (isMp && channel) {
      channel.send({ type: 'broadcast', event: 'move', payload: { idx, symbol: playerSymbol } });
    }

    if (checkEnd()) return;
    render();

    if (autoHelp && currentTurnSymbol === playerSymbol && !gameOver) {
      handleHelp(true);
    }
  }

  function aiMove() {
    if (gameOver || isMp) return;

    let move = -1;
    const emptySpots = board.map((c, i) => c === null ? i : null).filter(i => i !== null);

    if (emptySpots.length === 0) return;

    if (aiDifficulty === 'easy') {
      // 100% Random
      move = emptySpots[Math.floor(Math.random() * emptySpots.length)];
    } else if (aiDifficulty === 'hard') {
      // 50% Random, 50% Perfect
      if (Math.random() < 0.5) {
        move = emptySpots[Math.floor(Math.random() * emptySpots.length)];
      } else {
        move = minimaxBestMove(board, opponentSymbol, playerSymbol);
      }
    } else {
      // Impossible: 100% Perfect Minimax
      move = minimaxBestMove(board, opponentSymbol, playerSymbol);
    }

    if (move === -1) return;
    board[move] = opponentSymbol;
    currentTurnSymbol = playerSymbol;
    if (checkEnd()) return;
    render();

    if (autoHelp && currentTurnSymbol === playerSymbol && !gameOver) {
      handleHelp(true);
    }
  }

  function resetBoard(broadcast = false) {
    board = Array(9).fill(null);
    gameOver = false;
    autoHelp = false;
    // alternate first move
    if (!isMp) {
      [playerSymbol, opponentSymbol] = [opponentSymbol, playerSymbol];
      currentTurnSymbol = 'X'; // In offline, 'X' always goes first but the symbols swap logically
      // Wait, standard TTT: whoever is 'X' goes first. If we swapped them, let's just make the AI 'X'
      currentTurnSymbol = 'X';
    } else {
      // In MP, Host is always X, Guest is always O. But they alternate who goes first
      // Actually simpler: just swap who is X and O for the next round
      [playerSymbol, opponentSymbol] = [opponentSymbol, playerSymbol];
      currentTurnSymbol = 'X'; // X always starts
    }

    if (broadcast && channel) {
      channel.send({ type: 'broadcast', event: 'new_game' });
    }
    render();
  }

  function newGame() {
    resetBoard(true);
  }

  function handleHelp(autoTrigger = false) {
    if (gameOver || aiMovePending || currentTurnSymbol !== playerSymbol) return;

    if (!autoTrigger) {
      autoHelp = !autoHelp;
      if (!autoHelp) {
        container.querySelectorAll('.ttt-cell').forEach(c => c.classList.remove('help-blink'));
        render();
        showToast('Auto-Hints Disabled.', 'info');
        return;
      } else {
        showToast('Auto-Hints Enabled!', 'success');
      }
    }

    render(); // Update UI button state

    const bestMove = minimaxBestMove([...board], playerSymbol, opponentSymbol);
    if (bestMove !== -1) {
      container.querySelectorAll('.ttt-cell').forEach(c => c.classList.remove('help-blink'));
      const cell = container.querySelector(`.ttt-cell[data-idx="${bestMove}"]`);
      if (cell) cell.classList.add('help-blink');
      if (!autoTrigger) showToast('The AI suggests this move.', 'info');
    }
  }

  render();
}

// ─── Perfect Minimax AI (fixed: no implicit globals) ───
function minimaxBestMove(board, aiSym, playerSym) {
  let bestScore = -Infinity;
  let bestMove = -1;
  for (let i = 0; i < 9; i++) {
    if (!board[i]) {
      board[i] = aiSym;
      const score = minimax(board, false, aiSym, playerSym, 0);
      board[i] = null;
      if (score > bestScore) {
        bestScore = score;
        bestMove = i;
      }
    }
  }
  return bestMove;
}

function minimax(board, isMax, aiSym, playerSym, depth) {
  const winner = checkWinner(board);
  if (winner === aiSym) return 10 - depth;
  if (winner === playerSym) return depth - 10;
  if (winner === 'draw') return 0;

  if (isMax) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (!board[i]) {
        board[i] = aiSym;
        const s = minimax(board, false, aiSym, playerSym, depth + 1);
        board[i] = null;
        best = Math.max(best, s);
      }
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (!board[i]) {
        board[i] = playerSym;
        const s = minimax(board, true, aiSym, playerSym, depth + 1);
        board[i] = null;
        best = Math.min(best, s);
      }
    }
    return best;
  }
}

export function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  if (board.every(Boolean)) return 'draw';
  return null;
}

export function getWinLine(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (const line of lines) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return line;
  }
  return null;
}

// ─── Shared result card (used by other games too) ───
export function showResultCard(container, title, sub, onPlayAgain, onBack) {
  if (title.toLowerCase().includes('win') && !title.toLowerCase().includes('ai')) {
    import('../ui/animations.js').then(({ triggerConfetti }) => triggerConfetti());
  }
  const existing = container.querySelector('.game-result-overlay');
  if (existing) existing.remove();

  const gameEl = container.querySelector('.game-screen') || container;
  gameEl.style.position = 'relative';

  const overlay = document.createElement('div');
  overlay.className = 'game-result-overlay';
  overlay.innerHTML = `
    <div class="game-result-card">
      <div class="result-title">${title}</div>
      <div class="result-sub">${sub}</div>
      <div class="result-actions">
        <button class="btn btn-primary" id="play-again-btn">Play Again</button>
        <button class="btn btn-ghost" id="exit-game-btn">Exit</button>
      </div>
    </div>
  `;
  gameEl.appendChild(overlay);
  overlay.querySelector('#play-again-btn').addEventListener('click', () => {
    overlay.remove();
    onPlayAgain();
  });
  overlay.querySelector('#exit-game-btn').addEventListener('click', onBack);
}
