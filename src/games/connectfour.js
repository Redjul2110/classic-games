// src/games/connectfour.js
// Connect Four with Minimax Alpha-Beta AI (depth 6)

import { showResultCard } from './tictactoe.js';
import { showToast } from '../ui/toast.js';
import { triggerConfetti } from '../ui/animations.js';
import { ogClient } from '../supabase.js';

const ROWS = 6, COLS = 7;
const PLAYER = 1, AI = 2, EMPTY = 0;

export function renderConnectFour(container, onBack, multiplayer) {
    let board = createBoard();
    const isMp = !!multiplayer;
    const isHost = isMp ? multiplayer.isHost : true;

    // Red goes first (1). In MP, Host is Red. Guest is Yellow. VS AI: Player is Red, AI is Yellow.
    let myId = isMp ? (isHost ? 1 : 2) : 1;
    let oppId = isMp ? (isHost ? 2 : 1) : 2;
    let currentTurnId = 1;

    let gameOver = false;
    let aiMovePending = false;
    let scores = { player: 0, ai: 0, draws: 0 };
    let channel = null;

    if (isMp) {
        channel = ogClient.channel('game-' + multiplayer.lobby.id);
        channel.on('broadcast', { event: 'move' }, (payload) => {
            const { col, player } = payload.payload;
            if (gameOver) return;
            dropDisc(board, col, player);
            currentTurnId = myId;
            const win = checkConnect4Win(board, player);
            if (win) { render(); highlightWin(win); return endGame(player === myId ? 'player' : 'opponent'); }
            if (isDraw(board)) { render(); return endGame('draw'); }
            render();
        }).on('broadcast', { event: 'new_game' }, () => {
            resetBoard(false);
        }).subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                showToast('Connected to opponent!', 'success');
            }
        });
    }

    function createBoard() {
        return Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
    }

    function handleExit() {
        if (channel) { channel.unsubscribe(); ogClient.removeChannel(channel); }
        onBack();
    }

    function render() {
        const isPlayerTurn = !gameOver && currentTurnId === myId;
        const myColor = myId === 1 ? 'Red 🔴' : 'Yellow 🟡';
        const oppColor = oppId === 1 ? 'Red 🔴' : 'Yellow 🟡';

        container.innerHTML = `
      <div class="game-screen">
        <div class="game-screen-header">
          <button class="btn btn-ghost btn-sm" id="back-btn">← Back</button>
          <div class="game-screen-title">Connect Four <span class="game-screen-badge ${isMp ? 'vs-player' : 'vs-ai'}">${isMp ? 'Multiplayer' : 'VS AI'}</span></div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;padding:20px;gap:16px;">
          <div class="score-board">
            <div class="score-item"><div class="score-value player-score">${scores.player}</div><div class="score-label">You (${myColor})</div></div>
            <div class="score-divider">–</div>
            <div class="score-item"><div class="score-value" style="color:var(--text-muted)">${scores.draws}</div><div class="score-label">Draws</div></div>
            <div class="score-divider">–</div>
            <div class="score-item"><div class="score-value ai-score">${scores.ai}</div><div class="score-label">${isMp ? 'Opponent' : 'AI'} (${oppColor})</div></div>
          </div>
          <div style="color:var(--text-secondary);font-size:0.88rem;">
            ${isPlayerTurn ? 'Your turn! Click a column to drop your disc.' : (isMp ? 'Opponent is thinking...' : '[AI] AI is thinking…')}
          </div>
          <div class="c4-board" id="c4-board">
            ${board.map((row, r) => `
              <div class="c4-row">
                ${row.map((cell, c) => `
                  <div class="c4-cell ${cell === 1 ? 'red' : cell === 2 ? 'yellow' : ''}"
                       data-col="${c}"></div>
                `).join('')}
              </div>
            `).join('')}
          </div>
          ${(!isMp || isHost) ? '<button class="btn btn-ghost btn-sm" id="new-game-btn">New Game</button>' : ''}
        </div>
      </div>
    `;

        container.querySelector('#back-btn').addEventListener('click', handleExit);
        container.querySelector('#new-game-btn')?.addEventListener('click', newGame);

        if (isPlayerTurn) {
            container.querySelectorAll('.c4-cell').forEach(cell => {
                cell.addEventListener('click', () => {
                    handlePlayerMove(parseInt(cell.dataset.col));
                });
            });
        }
    }

    function handlePlayerMove(col) {
        if (gameOver || currentTurnId !== myId) return;
        const row = dropDisc(board, col, myId);
        if (row === -1) return; // column full

        currentTurnId = oppId;

        if (isMp && channel) {
            channel.send({ type: 'broadcast', event: 'move', payload: { col, player: myId } });
        }

        const win = checkConnect4Win(board, myId);
        if (win) { render(); highlightWin(win); return endGame('player'); }
        if (isDraw(board)) { render(); return endGame('draw'); }

        render();

        if (!isMp && !gameOver) {
            aiMovePending = true;
            setTimeout(() => { aiMove(); }, 600);
        }
    }

    function aiMove() {
        if (gameOver || isMp) return;
        const aiCol = c4AIMove(board);
        dropDisc(board, aiCol, oppId);
        currentTurnId = myId;
        const aiWin = checkConnect4Win(board, oppId);
        aiMovePending = false;
        if (aiWin) { render(); highlightWin(aiWin); return endGame('ai'); }
        if (isDraw(board)) { render(); return endGame('draw'); }
        render();
    }

    function highlightWin(cells) {
        const allCells = container.querySelectorAll('.c4-cell');
        cells.forEach(([r, c]) => {
            const idx = r * COLS + c;
            allCells[idx]?.classList.add('winner');
        });
    }

    function endGame(result) {
        gameOver = true;
        if (result === 'player') { scores.player++; showToast('You win! ★', 'success'); triggerConfetti(); }
        else if (result === 'opponent' || result === 'ai') { scores.ai++; showToast(isMp ? 'Opponent wins!' : 'AI wins! [AI]', 'error'); }
        else { scores.draws++; showToast("It's a draw!", 'info'); }

        const title = result === 'player' ? 'You Win! ★' : (isMp ? 'Opponent Wins!' : 'AI Wins! [AI]');
        const sub = `Score: You ${scores.player} – ${isMp ? 'Opp' : 'AI'} ${scores.ai}`;
        setTimeout(() => showResultCard(container, title, sub, newGame, handleExit), 1200);
    }

    function resetBoard(broadcast = false) {
        board = createBoard();
        gameOver = false;
        aiMovePending = false;
        currentTurnId = 1;

        if (broadcast && channel) {
            channel.send({ type: 'broadcast', event: 'new_game' });
        }
        render();
    }

    function newGame() {
        resetBoard(true);
    }

    render();
}

function dropDisc(board, col, player) {
    for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][col] === EMPTY) { board[r][col] = player; return r; }
    }
    return -1;
}

function undropDisc(board, col) {
    for (let r = 0; r < ROWS; r++) {
        if (board[r][col] !== EMPTY) { board[r][col] = EMPTY; return; }
    }
}

function isDraw(board) { return board[0].every(c => c !== EMPTY); }

function checkConnect4Win(board, player) {
    // Horizontal, Vertical, Diagonal
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
            for (const [dr, dc] of dirs) {
                const cells = [];
                for (let k = 0; k < 4; k++) {
                    const nr = r + dr * k, nc = c + dc * k;
                    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
                    if (board[nr][nc] !== player) break;
                    cells.push([nr, nc]);
                }
                if (cells.length === 4) return cells;
            }
        }
    }
    return null;
}

// ─── Minimax with Alpha-Beta (depth 6) ───
function c4AIMove(board) {
    const validCols = [];
    for (let c = 0; c < COLS; c++) { if (board[0][c] === EMPTY) validCols.push(c); }

    // Win immediately
    for (const c of validCols) {
        dropDisc(board, c, AI);
        if (checkConnect4Win(board, AI)) { undropDisc(board, c); return c; }
        undropDisc(board, c);
    }
    // Block immediate win
    for (const c of validCols) {
        dropDisc(board, c, PLAYER);
        if (checkConnect4Win(board, PLAYER)) { undropDisc(board, c); return c; }
        undropDisc(board, c);
    }

    let bestScore = -Infinity, bestCol = validCols[Math.floor(validCols.length / 2)];
    // Center-first order
    const order = [3, 2, 4, 1, 5, 0, 6].filter(c => validCols.includes(c));
    for (const c of order) {
        dropDisc(board, c, AI);
        const score = alphabeta(board, 5, -Infinity, Infinity, false);
        undropDisc(board, c);
        if (score > bestScore) { bestScore = score; bestCol = c; }
    }
    return bestCol;
}

function alphabeta(board, depth, alpha, beta, isMax) {
    const aiWin = checkConnect4Win(board, AI);
    if (aiWin) return 1000 + depth;
    const playerWin = checkConnect4Win(board, PLAYER);
    if (playerWin) return -(1000 + depth);
    if (isDraw(board) || depth === 0) return c4Evaluate(board);

    const order = [3, 2, 4, 1, 5, 0, 6];
    if (isMax) {
        let v = -Infinity;
        for (const c of order) {
            if (board[0][c] !== EMPTY) continue;
            dropDisc(board, c, AI);
            v = Math.max(v, alphabeta(board, depth - 1, alpha, beta, false));
            undropDisc(board, c);
            alpha = Math.max(alpha, v);
            if (alpha >= beta) break;
        }
        return v;
    } else {
        let v = Infinity;
        for (const c of order) {
            if (board[0][c] !== EMPTY) continue;
            dropDisc(board, c, PLAYER);
            v = Math.min(v, alphabeta(board, depth - 1, alpha, beta, true));
            undropDisc(board, c);
            beta = Math.min(beta, v);
            if (alpha >= beta) break;
        }
        return v;
    }
}

function c4Evaluate(board) {
    let score = 0;
    // Center column preference
    const centerCol = board.map(r => r[3]);
    score += centerCol.filter(c => c === AI).length * 6;
    score -= centerCol.filter(c => c === PLAYER).length * 6;

    const scoreWindow = (window) => {
        const aiCount = window.filter(c => c === AI).length;
        const playerCount = window.filter(c => c === PLAYER).length;
        const empty = window.filter(c => c === EMPTY).length;
        let s = 0;
        if (aiCount === 3 && empty === 1) s += 50;
        if (aiCount === 2 && empty === 2) s += 10;
        if (playerCount === 3 && empty === 1) s -= 80;
        if (playerCount === 2 && empty === 2) s -= 15;
        return s;
    };

    // Horizontal
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS - 3; c++)
            score += scoreWindow([board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]]);
    // Vertical
    for (let r = 0; r < ROWS - 3; r++)
        for (let c = 0; c < COLS; c++)
            score += scoreWindow([board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]]);
    // Diagonals
    for (let r = 0; r < ROWS - 3; r++) {
        for (let c = 0; c < COLS - 3; c++)
            score += scoreWindow([board[r][c], board[r + 1][c + 1], board[r + 2][c + 2], board[r + 3][c + 3]]);
        for (let c = 3; c < COLS; c++)
            score += scoreWindow([board[r][c], board[r + 1][c - 1], board[r + 2][c - 2], board[r + 3][c - 3]]);
    }
    return score;
}
