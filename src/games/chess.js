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

const ICONS = { K: '♚\uFE0E', Q: '♛\uFE0E', R: '♜\uFE0E', B: '♝\uFE0E', N: '♞\uFE0E', P: '♟\uFE0E', k: '♚\uFE0E', q: '♛\uFE0E', r: '♜\uFE0E', b: '♝\uFE0E', n: '♞\uFE0E', p: '♟\uFE0E' };
const VALS = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000, p: -100, n: -320, b: -330, r: -500, q: -900, k: -20000 };

// Positional values (Piece-Square Tables). Indexed from White's perspective.
const PST = {
    P: [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [50, 50, 50, 50, 50, 50, 50, 50],
        [10, 10, 20, 30, 30, 20, 10, 10],
        [5, 5, 10, 25, 25, 10, 5, 5],
        [0, 0, 0, 20, 20, 0, 0, 0],
        [5, -5, -10, 0, 0, -10, -5, 5],
        [5, 10, 10, -20, -20, 10, 10, 5],
        [0, 0, 0, 0, 0, 0, 0, 0]
    ],
    N: [
        [-50, -40, -30, -30, -30, -30, -40, -50],
        [-40, -20, 0, 0, 0, 0, -20, -40],
        [-30, 0, 10, 15, 15, 10, 0, -30],
        [-30, 5, 15, 20, 20, 15, 5, -30],
        [-30, 0, 15, 20, 20, 15, 0, -30],
        [-30, 5, 10, 15, 15, 10, 5, -30],
        [-40, -20, 0, 5, 5, 0, -20, -40],
        [-50, -40, -30, -30, -30, -30, -40, -50]
    ],
    B: [
        [-20, -10, -10, -10, -10, -10, -10, -20],
        [-10, 0, 0, 0, 0, 0, 0, -10],
        [-10, 0, 5, 10, 10, 5, 0, -10],
        [-10, 5, 5, 10, 10, 5, 5, -10],
        [-10, 0, 10, 10, 10, 10, 0, -10],
        [-10, 10, 10, 10, 10, 10, 10, -10],
        [-10, 5, 0, 0, 0, 0, 5, -10],
        [-20, -10, -10, -10, -10, -10, -10, -20]
    ],
    R: [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [5, 10, 10, 10, 10, 10, 10, 5],
        [-5, 0, 0, 0, 0, 0, 0, -5],
        [-5, 0, 0, 0, 0, 0, 0, -5],
        [-5, 0, 0, 0, 0, 0, 0, -5],
        [-5, 0, 0, 0, 0, 0, 0, -5],
        [-5, 0, 0, 0, 0, 0, 0, -5],
        [0, 0, 0, 5, 5, 0, 0, 0]
    ],
    Q: [
        [-20, -10, -10, -5, -5, -10, -10, -20],
        [-10, 0, 0, 0, 0, 0, 0, -10],
        [-10, 0, 5, 5, 5, 5, 0, -10],
        [-5, 0, 5, 5, 5, 5, 0, -5],
        [0, 0, 5, 5, 5, 5, 0, -5],
        [-10, 5, 5, 5, 5, 5, 0, -10],
        [-10, 0, 5, 0, 0, 0, 0, -10],
        [-20, -10, -10, -5, -5, -10, -10, -20]
    ],
    K: [
        [-30, -40, -40, -50, -50, -40, -40, -30],
        [-30, -40, -40, -50, -50, -40, -40, -30],
        [-30, -40, -40, -50, -50, -40, -40, -30],
        [-30, -40, -40, -50, -50, -40, -40, -30],
        [-20, -30, -30, -40, -40, -30, -30, -20],
        [-10, -20, -20, -20, -20, -20, -20, -10],
        [20, 20, 0, 0, 0, 0, 20, 20],
        [20, 30, 10, 0, 0, 10, 30, 20]
    ]
};

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
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p) continue;

            const isWhite = isW(p);
            const type = p.toUpperCase();

            let val = VALS[p] || 0;
            let pstVal = 0;

            if (PST[type]) {
                const row = isWhite ? r : 7 - r;
                pstVal = PST[type][row][c];
            }

            // White values are positive, Black values are negative
            score += isWhite ? pstVal : -pstVal;
            score += val;
        }
    }
    return score;
}

function alphaBeta(board, depth, alpha, beta, isMax, qDepth = 0) {
    const color = isMax ? 'white' : 'black';

    if (depth <= 0) {
        let stand_pat = evaluate(board);
        // Limit quiescence search depth to avoid infinite loops and performance issues
        if (qDepth >= 3) return stand_pat;

        if (isMax) {
            if (stand_pat >= beta) return beta;
            if (alpha < stand_pat) alpha = stand_pat;
        } else {
            if (stand_pat <= alpha) return alpha;
            if (beta > stand_pat) beta = stand_pat;
        }

        // Only evaluate captures to resolve the horizon effect
        let moves = getAllMoves(board, color).filter(m => board[m[2]][m[3]]);
        if (moves.length === 0) return stand_pat;

        moves.sort((a, b) => {
            const capA = Math.abs(VALS[board[a[2]][a[3]]] || 0);
            const capB = Math.abs(VALS[board[b[2]][b[3]]] || 0);
            return capB - capA;
        });

        if (isMax) {
            let v = stand_pat;
            for (const m of moves) {
                v = Math.max(v, alphaBeta(applyMove(board, m), 0, alpha, beta, false, qDepth + 1));
                alpha = Math.max(alpha, v);
                if (alpha >= beta) break;
            }
            return v;
        } else {
            let v = stand_pat;
            for (const m of moves) {
                v = Math.min(v, alphaBeta(applyMove(board, m), 0, alpha, beta, true, qDepth + 1));
                beta = Math.min(beta, v);
                if (alpha >= beta) break;
            }
            return v;
        }
    }

    const moves = getAllMoves(board, color);
    if (moves.length === 0) {
        // No moves: checkmate or stalemate
        if (isInCheck(board, color)) return isMax ? -99999 - depth : 99999 + depth;
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
            v = Math.max(v, alphaBeta(applyMove(board, m), depth - 1, alpha, beta, false, 0));
            alpha = Math.max(alpha, v);
            if (alpha >= beta) break;
        }
        return v;
    } else {
        let v = Infinity;
        for (const m of moves) {
            v = Math.min(v, alphaBeta(applyMove(board, m), depth - 1, alpha, beta, true, 0));
            beta = Math.min(beta, v);
            if (alpha >= beta) break;
        }
        return v;
    }
}

function getBestMove(board, color, difficulty) {
    const moves = getAllMoves(board, color);
    if (moves.length === 0) return null;
    // Shuffle for variety among equal moves
    moves.sort(() => Math.random() - 0.5);

    if (difficulty === 'easy') {
        // 50% random, 50% depth 1
        if (Math.random() < 0.5) return moves[0];
        difficulty = 'depth1';
    }

    let searchDepth = 3; // hard
    if (difficulty === 'depth1') searchDepth = 1;
    if (difficulty === 'medium') searchDepth = 2;
    if (difficulty === 'impossible') searchDepth = 4;

    // Always Win mode: AI intentionally picks the WORST possible move for itself
    if (difficulty === 'always_win') {
        let worstScore = color === 'black' ? -Infinity : Infinity;
        let worstMove = moves[0];
        for (const m of moves) {
            const nb = applyMove(board, m);
            // Search depth 1 to find immediate bad outcomes
            const score = alphaBeta(nb, 0, -Infinity, Infinity, color === 'black');
            if (color === 'black' ? score > worstScore : score < worstScore) {
                worstScore = score;
                worstMove = m;
            }
        }
        return worstMove;
    }

    // Normal play
    let bestScore = color === 'black' ? Infinity : -Infinity;
    let bestMove = moves[0];

    for (const m of moves) {
        const nb = applyMove(board, m);
        const score = alphaBeta(nb, searchDepth - 1, -Infinity, Infinity, color === 'black');
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
    let aiDifficulty = 'medium'; // Default difficulty
    let diffSelected = isMp; // In MP, bypass difficulty select
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

    let isInitialized = false;

    function render() {
        if (!diffSelected) {
            container.innerHTML = `
                <div class="game-screen">
                  <div class="game-screen-header">
                    <button class="btn btn-ghost btn-sm" id="back-btn">← Back</button>
                    <div class="game-screen-title">
                      Chess
                      <div class="game-screen-badge vs-ai">VS AI</div>
                    </div>
                  </div>
                  <div class="difficulty-screen" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; gap: 30px; padding: 24px;">
                    <h2 class="difficulty-title">Select AI Difficulty</h2>
                    <div class="difficulty-options">
                      <div class="diff-card" data-diff="always_win">
                        <div class="diff-card-header">Always Win</div>
                        <div class="diff-card-desc">The AI actively tries to lose against you.</div>
                      </div>
                      <div class="diff-card" data-diff="easy">
                        <div class="diff-card-header">Easy</div>
                        <div class="diff-card-desc">Mostly random moves. Great for beginners.</div>
                      </div>
                      <div class="diff-card" data-diff="medium">
                        <div class="diff-card-header">Medium</div>
                        <div class="diff-card-desc">Standard challenge with 2-move foresight.</div>
                      </div>
                      <div class="diff-card" data-diff="hard">
                        <div class="diff-card-header">Hard</div>
                        <div class="diff-card-desc">Advanced challenge with 3-move foresight.</div>
                      </div>
                      <div class="diff-card" data-diff="impossible" style="border-bottom: 3px solid var(--red-primary);">
                        <div class="diff-card-header">Impossible</div>
                        <div class="diff-card-desc">Minimax depth 4. Very hard to beat.</div>
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
                    resetGame(false);
                });
            });
            return;
        }

        if (isInitialized) {
            // Soft Update: prevents DOM thrashing and glitching
            container.querySelector('.player-score').textContent = scores.player;
            container.querySelector('.ai-score').textContent = scores.ai;

            const statusMsg = container.querySelector('.game-status-msg');
            if (statusMsg) {
                statusMsg.textContent = aiThinking ? '[AI] AI is thinking…' : gameOver ? '♟️ Game Over' : checkMsg || (turn === myColor ? (myColor === 'white' ? '♔' : '♚') + ' Your turn' : (isMp ? 'Opponent is thinking...' : '♚ AI is playing...'));
                statusMsg.style.color = checkMsg.includes('Check') ? 'var(--red-light)' : 'var(--text-secondary)';
            }

            const chessBoard = container.querySelector('#chess-board');
            if (chessBoard) {
                chessBoard.innerHTML = renderBoard();
            }
        } else {
            // Full render
            isInitialized = true;
            container.innerHTML = `
                <div class="game-screen">
                  <div class="game-screen-header">
                    <button class="btn btn-ghost btn-sm" id="back-btn">← Back</button>
                    <div class="game-screen-title" style="display:flex;align-items:center;gap:12px;">
                      Chess 
                      <span class="game-screen-badge ${isMp ? 'vs-player' : 'vs-ai'}">${isMp ? 'Multiplayer' : 'VS AI'}</span>
                      ${!isMp ? `<div class="game-screen-badge" style="background:var(--bg-glass);border:1px solid var(--border-accent);color:var(--text-secondary);">${aiDifficulty.replace('_', ' ').toUpperCase()}</div>` : ''}
                    </div>
                  </div>
                  <div style="flex:1;display:flex;flex-direction:column;align-items:center;padding:16px;gap:10px;">
                    <div class="score-board">
                      <div class="score-item"><div class="score-value player-score">${scores.player}</div><div class="score-label">You ${myColor === 'white' ? '♔' : '♚'}</div></div>
                      <div class="score-divider">|</div>
                      <div class="score-item"><div class="score-value ai-score">${scores.ai}</div><div class="score-label">${isMp ? 'Opponent' : 'AI'} ${oppColor === 'white' ? '♔' : '♚'}</div></div>
                    </div>
                    <div class="game-status-msg" style="font-size:0.88rem;font-weight:700;color:${checkMsg.includes('Check') ? 'var(--red-light)' : 'var(--text-secondary)'};">
                      ${aiThinking ? '[AI] AI is thinking…' : gameOver ? '♟️ Game Over' : checkMsg || (turn === myColor ? (myColor === 'white' ? '♔' : '♚') + ' Your turn' : (isMp ? 'Opponent is thinking...' : '♚ AI is playing...'))}
                    </div>
                    <div class="chess-board" id="chess-board">${renderBoard()}</div>
                    ${(!isMp || isHost) ? '<button class="btn btn-ghost btn-sm" id="new-game-btn">New Game</button>' : ''}
                  </div>
                </div>
            `;
            container.querySelector('#back-btn').addEventListener('click', handleExit);
            container.querySelector('#new-game-btn')?.addEventListener('click', () => resetGame(true));
        }

        container.querySelectorAll('.chess-cell').forEach(cell => {
            cell.addEventListener('click', () => handleClick(+cell.dataset.r, +cell.dataset.c));
        });
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
                if (isValid) {
                    const selPiece = selected ? board[selected[0]][selected[1]] : null;
                    const canPlay = selPiece && colorOf(selPiece) === myColor && turn === myColor && !aiThinking && !gameOver;
                    cls += canPlay ? ' valid-move' : ' valid-move-info';
                }
                if (isLast && !isSel) cls += ' last-move';

                if (piece) {
                    cls += colorOf(piece) === 'white' ? ' white-piece' : ' black-piece';
                }

                html += `<div class="${cls}" data-r="${r}" data-c="${c}">${piece ? ICONS[piece] : ''}</div>`;
            }
        }
        return html;
    }

    function handleClick(r, c) {
        if (selected) {
            const selPiece = board[selected[0]][selected[1]];
            const isMyTurn = turn === myColor && !aiThinking && !gameOver;
            const canPlay = selPiece && colorOf(selPiece) === myColor && isMyTurn;

            const move = validMoves.find(m => m[2] === r && m[3] === c);
            if (move && canPlay) {
                executeMove(move, myColor);
                return;
            }
            // Deselect on any other click
            selected = null; validMoves = [];
        }

        // View moves for ANY piece
        if (board[r][c]) {
            selected = [r, c];
            const pColor = colorOf(board[r][c]);
            validMoves = getLegalMoves(board, r, c, pColor);
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
            // Small timeout to allow UI to render the 'thinking' state
            setTimeout(() => {
                const aiMove = getBestMove(board, 'black', aiDifficulty);
                aiThinking = false; // Reset before executeMove so render() picks up the false state
                if (aiMove) {
                    executeMove(aiMove, 'black');
                } else {
                    render();
                }
            }, 50);
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
