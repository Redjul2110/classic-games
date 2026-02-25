// src/games/checkers.js
// Checkers / Draughts with Minimax AI (depth 5) and forced captures

import { ogClient } from '../supabase.js';
import { showToast } from '../ui/toast.js';

const EMPTY = 0, RED = 1, BLACK = -1, RED_KING = 2, BLACK_KING = -2;

export function renderCheckers(container, onBack, multiplayer) {
    let board = initBoard();
    let selected = null;
    let validMoves = [];
    let turn = RED; // human/host = RED (plays from bottom)
    let gameOver = false;
    let aiThinking = false;
    let scores = { player: 0, ai: 0 };

    const isMp = !!multiplayer;
    const isHost = isMp ? multiplayer.isHost : true;
    const myColor = isMp ? (isHost ? RED : BLACK) : RED;
    let channel = null;

    if (isMp) {
        channel = ogClient.channel('game-' + multiplayer.lobby.id);
        channel.on('broadcast', { event: 'move' }, (payload) => {
            const { move, nextTurn } = payload.payload;
            applyMove(board, move);
            turn = nextTurn;
            checkGameOver();
            render();
        }).on('broadcast', { event: 'new_game' }, () => {
            if (!isHost) {
                board = initBoard(); selected = null; validMoves = []; turn = RED; gameOver = false; render();
            }
        }).subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                showToast('Connected to opponent! 🔴⚫', 'success');
            }
        });
    }

    function checkGameOver() {
        if (isGameOver(board, turn)) {
            gameOver = true;
            if (turn === BLACK) { scores.player++; showEnd(isMp ? (myColor === RED ? 'You win! ★' : 'Red wins!') : 'You win! ★'); }
            else { scores.ai++; showEnd(isMp ? (myColor === BLACK ? 'You win! ★' : 'Black wins!') : 'AI wins! [AI]'); }
        }
    }

    function initBoard() {
        const b = Array.from({ length: 8 }, () => Array(8).fill(EMPTY));
        for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) b[r][c] = BLACK;
        for (let r = 5; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) b[r][c] = RED;
        return b;
    }

    function render() {
        container.innerHTML = `
      <div class="game-screen">
        <div class="game-screen-header">
          <button class="btn btn-ghost btn-sm" id="back-btn">← Back</button>
          <div class="game-screen-title">Checkers <span class="game-screen-badge ${isMp ? 'vs-player' : 'vs-ai'}">${isMp ? 'VS Player' : 'VS AI'}</span></div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;padding:16px;gap:12px;">
          <div class="score-board">
            <div class="score-item"><div class="score-value player-score">${scores.player}</div><div class="score-label">${isMp ? 'Red (Host)' : 'You (Red)'}</div></div>
            <div class="score-divider">${gameOver ? 'Game Over' : turn === RED ? "Red's Turn" : "Black's Turn"}</div>
            <div class="score-item"><div class="score-value ai-score">${scores.ai}</div><div class="score-label">${isMp ? 'Black (Guest)' : 'AI (Black)'}</div></div>
          </div>
          <div class="checkers-board" id="checkers-board">${renderBoard()}</div>
          <button class="btn btn-ghost btn-sm" id="new-game-btn" ${isMp && !isHost ? 'style="display:none;"' : ''}>New Game</button>
        </div>
      </div>
    `;
        container.querySelector('#back-btn').addEventListener('click', () => {
            if (channel) { channel.unsubscribe(); ogClient.removeChannel(channel); }
            onBack();
        });
        container.querySelector('#new-game-btn')?.addEventListener('click', () => {
            if (isMp && !isHost) return;
            board = initBoard(); selected = null; validMoves = []; turn = RED; gameOver = false; aiThinking = false;
            if (isMp && channel) channel.send({ type: 'broadcast', event: 'new_game' });
            render();
        });

        if (!aiThinking && !gameOver) {
            container.querySelectorAll('.checkers-cell').forEach(cell => {
                cell.addEventListener('click', () => handleClick(parseInt(cell.dataset.r), parseInt(cell.dataset.c)));
            });
            if (!isMp && turn === BLACK && !aiThinking) {
                aiThinking = true;
                setTimeout(() => { makeAIMove(); aiThinking = false; render(); }, 600);
            }
        }
    }

    function renderBoard() {
        let html = '';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const isLight = (r + c) % 2 === 0;
                const piece = board[r][c];
                const isSelected = selected && selected[0] === r && selected[1] === c;
                const isValid = validMoves.some(m => m[2] === r && m[3] === c);
                let cls = `checkers-cell ${isLight ? 'light' : 'dark'}`;
                if (isValid) cls += ' valid-move';
                let pieceHtml = '';
                if (piece) {
                    const pCls = `checkers-piece ${piece > 0 ? 'red' : 'black'} ${Math.abs(piece) === 2 ? 'king' : ''} ${isSelected ? 'selected' : ''}`;
                    pieceHtml = `<div class="${pCls}" data-r="${r}" data-c="${c}"></div>`;
                }
                html += `<div class="${cls}" data-r="${r}" data-c="${c}">${pieceHtml}</div>`;
            }
        }
        return html;
    }

    function handleClick(r, c) {
        if (aiThinking || gameOver || turn !== myColor) return;
        const piece = board[r][c];

        if (selected) {
            const target = validMoves.find(m => m[2] === r && m[3] === c);
            if (target) {
                applyMove(board, target);
                selected = null; validMoves = [];
                turn = myColor === RED ? BLACK : RED;

                checkGameOver();

                if (isMp && channel) {
                    channel.send({ type: 'broadcast', event: 'move', payload: { move: target, nextTurn: turn } });
                }

                render();
                return;
            }
            selected = null; validMoves = [];
        }

        if ((myColor === RED && piece > 0) || (myColor === BLACK && piece < 0)) {
            selected = [r, c];
            validMoves = getPieceMoves(board, r, c, myColor);
            // Forced capture
            const allCaptures = getAllMoves(board, myColor).filter(m => m[4]);
            if (allCaptures.length > 0) validMoves = validMoves.filter(m => m[4]);
        }
        render();
    }

    function makeAIMove() {
        if (gameOver) return;
        const move = checkersMinimaxRoot(board, 5);
        if (move) {
            applyMove(board, move);
            turn = RED;
            checkGameOver();
        } else {
            // No moves = player wins
            scores.player++;
            gameOver = true;
            setTimeout(() => showEnd('You win! ★'), 300);
        }
    }

    function showEnd(msg) {
        import('../ui/animations.js').then(({ triggerConfetti }) => {
            if (msg.includes('You win') || msg.includes('Red wins') || msg.includes('Black wins')) triggerConfetti();
        });
        showToast(msg, msg.includes('win') ? 'success' : 'error');
    }

    render();
}

// Move format: [fromR, fromC, toR, toC, isCapture, capturedR, capturedC]
function getPieceMoves(board, r, c, color) {
    const piece = board[r][c];
    const dirs = [];
    if (color === RED || Math.abs(piece) === 2) dirs.push([-1, -1], [-1, 1]);
    if (color === BLACK || Math.abs(piece) === 2) dirs.push([1, -1], [1, 1]);

    const moves = [];
    for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
        if (board[nr][nc] === EMPTY) {
            moves.push([r, c, nr, nc, false]);
        } else if (isOpponent(board[nr][nc], color)) {
            const jr = r + 2 * dr, jc = c + 2 * dc;
            if (jr >= 0 && jr < 8 && jc >= 0 && jc < 8 && board[jr][jc] === EMPTY) {
                moves.push([r, c, jr, jc, true, nr, nc]);
            }
        }
    }
    return moves;
}

function isOpponent(p, color) {
    if (!p) return false;
    return color === RED ? p < 0 : p > 0;
}

function getAllMoves(board, color) {
    const moves = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p) continue;
        if (color === RED && p < 0) continue;
        if (color === BLACK && p > 0) continue;
        moves.push(...getPieceMoves(board, r, c, color));
    }
    const captures = moves.filter(m => m[4]);
    return captures.length > 0 ? captures : moves;
}

function applyMove(board, move) {
    const [fr, fc, tr, tc, isCapture, cr, cc] = move;
    board[tr][tc] = board[fr][fc];
    board[fr][fc] = EMPTY;
    if (isCapture && cr !== undefined) board[cr][cc] = EMPTY;
    // King promotion
    if (board[tr][tc] === RED && tr === 0) board[tr][tc] = RED_KING;
    if (board[tr][tc] === BLACK && tr === 7) board[tr][tc] = BLACK_KING;
}

function cloneBoard(board) { return board.map(r => [...r]); }

function isGameOver(board, color) {
    return getAllMoves(board, color).length === 0;
}

function evaluateCheckers(board) {
    let score = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p === RED) score += 10;
        else if (p === BLACK) score -= 10;
        else if (p === RED_KING) score += 16;
        else if (p === BLACK_KING) score -= 16;
    }
    return score;
}

function checkersMinimaxRoot(board, depth) {
    const moves = getAllMoves(board, BLACK);
    if (moves.length === 0) return null;
    let bestScore = Infinity, bestMove = moves[0];
    for (const move of moves) {
        const b = cloneBoard(board);
        applyMove(b, move);
        const score = checkersMinimax(b, depth - 1, -Infinity, Infinity, true);
        if (score < bestScore) { bestScore = score; bestMove = move; }
    }
    return bestMove;
}

function checkersMinimax(board, depth, alpha, beta, isMax) {
    const color = isMax ? RED : BLACK;
    if (depth === 0) return evaluateCheckers(board);
    const moves = getAllMoves(board, color);
    if (moves.length === 0) return isMax ? -1000 : 1000;
    if (isMax) {
        let v = -Infinity;
        for (const m of moves) {
            const b = cloneBoard(board);
            applyMove(b, m);
            v = Math.max(v, checkersMinimax(b, depth - 1, alpha, beta, false));
            alpha = Math.max(alpha, v);
            if (alpha >= beta) break;
        }
        return v;
    } else {
        let v = Infinity;
        for (const m of moves) {
            const b = cloneBoard(board);
            applyMove(b, m);
            v = Math.min(v, checkersMinimax(b, depth - 1, alpha, beta, true));
            beta = Math.min(beta, v);
            if (alpha >= beta) break;
        }
        return v;
    }
}
