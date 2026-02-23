// src/games/chess.js
// Chess with Minimax + Alpha-Beta AI (depth 3)
// Fixed: AI cannot make illegal moves, no moving-into-check exploitation

import { showToast } from '../ui/toast.js';
import { showResultCard } from './tictactoe.js';
import { triggerConfetti } from '../ui/animations.js';
import { ogClient } from '../supabase.js';

// Board: row 0 = top (black home), row 7 = bottom (white home)
// Uppercase = white, lowercase = black
const INIT_BOARD = () => [
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
];

const ICONS = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const VALS = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000, p: -100, n: -320, b: -330, r: -500, q: -900, k: -20000 };

const isW = p => p && p === p.toUpperCase();
const isB = p => p && p === p.toLowerCase();
const colorOf = p => p ? (isW(p) ? 'white' : 'black') : null;
const opponent = c => c === 'white' ? 'black' : 'white';
const cloneB = b => b.map(r => [...r]);

function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

// Returns legal moves as [fromR, fromC, toR, toC]
// Does NOT allow moves that leave own king in check
function getLegalMoves(board, r, c, color) {
    const raw = getRawMoves(board, r, c, color);
    // Filter out moves that leave own king in check
    return raw.filter(([fr, fc, tr, tc]) => {
        const nb = cloneB(board);
        nb[tr][tc] = nb[fr][fc];
        nb[fr][fc] = null;
        // Pawn promotion (needed to not have wrong piece type for check detection)
        if (nb[tr][tc] === 'P' && tr === 0) nb[tr][tc] = 'Q';
        if (nb[tr][tc] === 'p' && tr === 7) nb[tr][tc] = 'q';
        return !isInCheck(nb, color);
    });
}

function getRawMoves(board, r, c, color) {
    const piece = board[r][c];
    if (!piece || colorOf(piece) !== color) return [];
    const moves = [];
    const pt = piece.toLowerCase();
    const dir = color === 'white' ? -1 : 1;
    const startRow = color === 'white' ? 6 : 1;

    const push = (tr, tc) => {
        if (!inBounds(tr, tc)) return false;
        const target = board[tr][tc];
        if (target && colorOf(target) === color) return false; // can't capture own
        moves.push([r, c, tr, tc]);
        return !target; // can continue sliding only if empty
    };

    const slide = (dr, dc) => {
        for (let i = 1; i < 8; i++) if (!push(r + dr * i, c + dc * i)) break;
    };

    if (pt === 'p') {
        // Forward (no capture)
        if (inBounds(r + dir, c) && !board[r + dir][c]) {
            moves.push([r, c, r + dir, c]);
            // Double push from start
            if (r === startRow && !board[r + 2 * dir][c]) {
                moves.push([r, c, r + 2 * dir, c]);
            }
        }
        // Diagonal captures
        for (const dc of [-1, 1]) {
            const tr = r + dir, tc = c + dc;
            if (inBounds(tr, tc) && board[tr][tc] && colorOf(board[tr][tc]) !== color) {
                moves.push([r, c, tr, tc]);
            }
        }
    }
    if (pt === 'n') {
        for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
            push(r + dr, c + dc);
        }
    }
    if (pt === 'r') { slide(0, 1); slide(0, -1); slide(1, 0); slide(-1, 0); }
    if (pt === 'b') { slide(1, 1); slide(1, -1); slide(-1, 1); slide(-1, -1); }
    if (pt === 'q') {
        slide(0, 1); slide(0, -1); slide(1, 0); slide(-1, 0);
        slide(1, 1); slide(1, -1); slide(-1, 1); slide(-1, -1);
    }
    if (pt === 'k') {
        for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
            push(r + dr, c + dc);
        }
    }
    return moves;
}

function findKing(board, color) {
    const king = color === 'white' ? 'K' : 'k';
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c] === king) return [r, c];
    return null;
}

function isInCheck(board, color) {
    const king = findKing(board, color);
    if (!king) return true; // king captured = in check
    const opp = opponent(color);
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] && colorOf(board[r][c]) === opp) {
                // Use raw moves to avoid infinite recursion
                const raw = getRawMoves(board, r, c, opp);
                if (raw.some(([, , , tr, tc]) => tr === king[0] && tc === king[1] ||
                    (raw.some(m => m[2] === king[0] && m[3] === king[1])))) {
                    // Check more carefully:
                    if (raw.some(m => m[2] === king[0] && m[3] === king[1])) return true;
                }
            }
        }
    }
    return false;
}

function getAllMoves(board, color) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] && colorOf(board[r][c]) === color) {
                moves.push(...getLegalMoves(board, r, c, color));
            }
        }
    }
    return moves;
}

function hasOnlyKing(board, color) {
    let pieceCount = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] && colorOf(board[r][c]) === color) pieceCount++;
        }
    }
    return pieceCount === 1;
}

function applyMove(board, move) {
    const [fr, fc, tr, tc] = move;
    const nb = cloneB(board);
    nb[tr][tc] = nb[fr][fc];
    nb[fr][fc] = null;
    if (nb[tr][tc] === 'P' && tr === 0) nb[tr][tc] = 'Q';
    if (nb[tr][tc] === 'p' && tr === 7) nb[tr][tc] = 'q';
    return nb;
}

function evaluate(board) {
    let score = 0;
    // Piece values + slight positional bonus (center preferred)
    const CENTER_BONUS = [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [0, 1, 2, 2, 2, 2, 1, 0],
        [0, 1, 2, 3, 3, 2, 1, 0],
        [0, 1, 2, 3, 3, 2, 1, 0],
        [0, 1, 2, 2, 2, 2, 1, 0],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
    ];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p) continue;
            const val = VALS[p] || 0;
            const pos = isW(p) ? CENTER_BONUS[r][c] : -CENTER_BONUS[r][c];
            score += val + pos;
        }
    }
    return score;
}

function alphaBeta(board, depth, alpha, beta, isMax) {
    if (depth === 0) return evaluate(board);
    const color = isMax ? 'white' : 'black';
    const moves = getAllMoves(board, color);
    if (moves.length === 0) {
        // No moves: checkmate or stalemate
        if (isInCheck(board, color)) return isMax ? -9999 - depth : 9999 + depth;
        return 0; // stalemate
    }

    // Move ordering: captures first (improves alpha-beta pruning)
    moves.sort((a, b) => {
        const capA = board[a[2]][a[3]] ? Math.abs(VALS[board[a[2]][a[3]]] || 0) : 0;
        const capB = board[b[2]][b[3]] ? Math.abs(VALS[board[b[2]][b[3]]] || 0) : 0;
        return capB - capA;
    });

    if (isMax) {
        let v = -Infinity;
        for (const m of moves) {
            v = Math.max(v, alphaBeta(applyMove(board, m), depth - 1, alpha, beta, false));
            alpha = Math.max(alpha, v);
            if (alpha >= beta) break;
        }
        return v;
    } else {
        let v = Infinity;
        for (const m of moves) {
            v = Math.min(v, alphaBeta(applyMove(board, m), depth - 1, alpha, beta, true));
            beta = Math.min(beta, v);
            if (alpha >= beta) break;
        }
        return v;
    }
}

function getBestMove(board, color, depth) {
    const moves = getAllMoves(board, color);
    if (moves.length === 0) return null;
    // Shuffle for variety among equal moves
    moves.sort(() => Math.random() - 0.5);

    let bestScore = color === 'black' ? Infinity : -Infinity;
    let bestMove = moves[0];

    for (const m of moves) {
        const nb = applyMove(board, m);
        const score = alphaBeta(nb, depth - 1, -Infinity, Infinity, color !== 'black');
        if (color === 'black' ? score < bestScore : score > bestScore) {
            bestScore = score;
            bestMove = m;
        }
    }
    return bestMove;
}

// ─── UI ───
export function renderChess(container, onBack, multiplayer) {
    let board = INIT_BOARD();

    const isMp = !!multiplayer;
    const isHost = isMp ? multiplayer.isHost : true;
    const myColor = isMp ? (isHost ? 'white' : 'black') : 'white';
    const oppColor = isMp ? (isHost ? 'black' : 'white') : 'black';

    let selected = null;
    let validMoves = [];
    let turn = 'white'; // white always starts
    let gameOver = false;
    let aiThinking = false;
    let lastMove = null;
    let scores = { player: 0, ai: 0 };
    let checkMsg = '';
    let channel = null;

    if (isMp) {
        channel = ogClient.channel('game-' + multiplayer.lobby.id);
        channel.on('broadcast', { event: 'move' }, (payload) => {
            const { move, color } = payload.payload;
            if (gameOver) return;
            executeMove(move, color, true);
        }).on('broadcast', { event: 'new_game' }, () => {
            resetGame(false);
        }).subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                showToast('Connected to opponent!', 'success');
            }
        });
    }

    function handleExit() {
        if (channel) { channel.unsubscribe(); ogClient.removeChannel(channel); }
        onBack();
    }

    function render() {
        container.innerHTML = `
      <div class="game-screen">
        <div class="game-screen-header">
          <button class="btn btn-ghost btn-sm" id="back-btn">← Back</button>
          <div class="game-screen-title">Chess <span class="game-screen-badge ${isMp ? 'vs-player' : 'vs-ai'}">${isMp ? 'Multiplayer' : 'VS AI'}</span></div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;padding:16px;gap:10px;">
          <div class="score-board">
            <div class="score-item"><div class="score-value player-score">${scores.player}</div><div class="score-label">You ${myColor === 'white' ? '♔' : '♚'}</div></div>
            <div class="score-divider">|</div>
            <div class="score-item"><div class="score-value ai-score">${scores.ai}</div><div class="score-label">${isMp ? 'Opponent' : 'AI'} ${oppColor === 'white' ? '♔' : '♚'}</div></div>
          </div>
          <div style="font-size:0.88rem;font-weight:700;color:${checkMsg.includes('Check') ? 'var(--red-light)' : 'var(--text-secondary)'};">
            ${aiThinking ? '[AI] AI is thinking…' : gameOver ? '♟️ Game Over' : checkMsg || (turn === myColor ? (myColor === 'white' ? '♔' : '♚') + ' Your turn' : (isMp ? 'Opponent is thinking...' : '♚ AI is playing...'))}
          </div>
          <div class="chess-board" id="chess-board">${renderBoard()}</div>
          ${(!isMp || isHost) ? '<button class="btn btn-ghost btn-sm" id="new-game-btn">New Game</button>' : ''}
        </div>
      </div>
    `;
        container.querySelector('#back-btn').addEventListener('click', handleExit);
        container.querySelector('#new-game-btn')?.addEventListener('click', () => resetGame(true));

        if (!aiThinking && !gameOver && turn === myColor) {
            container.querySelectorAll('.chess-cell').forEach(cell => {
                cell.addEventListener('click', () => handleClick(+cell.dataset.r, +cell.dataset.c));
            });
        }
    }

    function renderBoard() {
        let html = '';
        for (let rowIdx = 0; rowIdx < 8; rowIdx++) {
            const r = myColor === 'black' ? 7 - rowIdx : rowIdx;
            for (let colIdx = 0; colIdx < 8; colIdx++) {
                const c = myColor === 'black' ? 7 - colIdx : colIdx;
                const light = (r + c) % 2 === 0;
                const piece = board[r][c];
                const isSel = selected && selected[0] === r && selected[1] === c;
                const isValid = validMoves.some(m => m[2] === r && m[3] === c);
                const isLast = lastMove && lastMove.some(([lr, lc]) => lr === r && lc === c);
                let cls = `chess-cell ${light ? 'light' : 'dark'}`;
                if (isSel) cls += ' selected';
                if (isValid) cls += ' valid-move';
                if (isLast && !isSel) cls += ' last-move';
                html += `<div class="${cls}" data-r="${r}" data-c="${c}">${piece ? ICONS[piece] : ''}</div>`;
            }
        }
        return html;
    }

    function handleClick(r, c) {
        if (turn !== myColor || aiThinking || gameOver) return;

        if (selected) {
            const move = validMoves.find(m => m[2] === r && m[3] === c);
            if (move) {
                executeMove(move, myColor);
                return;
            }
            // Deselect
            selected = null; validMoves = [];
        }

        if (board[r][c] && colorOf(board[r][c]) === myColor) {
            selected = [r, c];
            validMoves = getLegalMoves(board, r, c, myColor);
        }
        render();
    }

    function executeMove(move, color, fromNetwork = false) {
        lastMove = [[move[0], move[1]], [move[2], move[3]]];
        board = applyMove(board, move);
        selected = null; validMoves = [];
        checkMsg = '';

        if (isMp && !fromNetwork && channel) {
            channel.send({ type: 'broadcast', event: 'move', payload: { move, color } });
        }

        // Check for game end
        const opp = opponent(color);
        const oppMoves = getAllMoves(board, opp);
        const oppLostByRule = hasOnlyKing(board, opp);
        if (oppMoves.length === 0 || oppLostByRule) {
            gameOver = true;
            if (isInCheck(board, opp) || oppLostByRule) {
                // Checkmate or lone king
                const winner = color === myColor ? 'player' : (isMp ? 'opponent' : 'ai');
                if (winner === 'player') scores.player++; else scores.ai++;
                render();

                const msg = winner === 'player' ? 'Victory! You Win! ♔' : (isMp ? 'Defeat! Opponent Wins! ♚' : 'Defeat! AI Wins! ♚');
                const toast = winner === 'player' ? 'success' : 'error';
                showToast(msg, toast);

                if (winner === 'player') triggerConfetti();
                setTimeout(() => showResultCard(container, msg,
                    `Score: You ${scores.player} – ${isMp ? 'Opp' : 'AI'} ${scores.ai}`, () => resetGame(true), handleExit), 800);
            } else {
                render();
                showToast('Stalemate — Draw!', 'info');
                setTimeout(() => showResultCard(container, 'Stalemate! [DRAW]',
                    'Neither player can move.', () => resetGame(true), handleExit), 800);
            }
            return;
        }
        // Report check
        if (isInCheck(board, opp)) {
            checkMsg = opp === myColor ? '[!] You are in Check!' : (isMp ? '[!] Opponent in Check!' : '[!] AI is in Check!');
        }

        turn = opp;
        render();

        if (!isMp && turn === 'black' && !aiThinking) {
            aiThinking = true;
            render();
            setTimeout(() => {
                const aiMove = getBestMove(board, 'black', 3);
                aiThinking = false; // Reset before executeMove so render() picks up the false state
                if (aiMove) {
                    executeMove(aiMove, 'black');
                } else {
                    render();
                }
            }, 400);
        }
    }

    function resetGame(broadcast = true) {
        board = INIT_BOARD();
        selected = null; validMoves = [];
        turn = 'white'; gameOver = false; aiThinking = false;
        lastMove = null; checkMsg = '';
        if (isMp && broadcast && channel) {
            channel.send({ type: 'broadcast', event: 'new_game' });
        }
        render();
    }

    render();
}
