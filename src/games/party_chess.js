// src/games/party_chess.js
// Battle Royale Massenschach für bis zu 30 Spieler
// Vollständige Schachfiguren: König, Dame, 2 Türme, 2 Läufer, 2 Springer, 8 Bauern pro Spieler

import { escapeHtml } from '../utils.js';
import { showToast } from '../ui/toast.js';
import { getUserId, hasAiAccess } from '../auth.js';

export function renderPartyChess(container, onBack) {
    const partyData = window._partyData;
    if (!partyData) {
        onBack();
        return;
    }

    const { channel, code, isHost, members } = partyData;
    const myId = getUserId();

    const uids = Object.keys(members).sort();
    const COLORS = [
        '#FF3B30', '#34C759', '#007AFF', '#FF9500', '#AF52DE',
        '#FF2D55', '#5856D6', '#FFCC00', '#34AADC', '#4CD964',
        '#FF5E3A', '#87FC70', '#52EDC7', '#1D62F0', '#C644FC',
        '#Ef4DB6', '#8F8E94', '#E4Bfe0', '#5AC8FA', '#4A4A4A',
        '#FFFFFF', '#FFD3E0', '#B2F4E6', '#F3D250', '#F78888',
        '#90CCF4', '#5CDB95', '#8EE4AF', '#EDF5E1', '#05386B'
    ];

    let playerMap = {};
    uids.forEach((id, i) => {
        playerMap[id] = { index: i, color: COLORS[i % COLORS.length], username: members[id].username, alive: true };
    });

    // Dynamic Board Size: 9 pieces per player in 3x3 blocks.
    const zonesPerRow = Math.max(2, Math.ceil(Math.sqrt(uids.length)));
    const gridSize = zonesPerRow * 4 + 2;

    let board = Array.from({ length: gridSize }, () => Array(gridSize).fill(null));
    let currentTurnIndex = 0;
    let selectedSquare = null;
    let validMoves = [];
    let gameOver = false;
    let winnerId = null;
    let currentZoom = 100;

    container.innerHTML = `
        <div class="game-screen" style="max-width:1200px;margin:0 auto;display:flex;flex-direction:column;height:100vh;">
            <div class="game-screen-header">
                <div class="game-screen-title" style="font-size:clamp(0.8rem,3vw,1.1rem);">Party Chess <span class="game-screen-badge vs-player">${uids.length} Players</span></div>
                
                <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
                    <button class="btn btn-sm btn-secondary" id="pc-zoom-out" style="min-width:36px;min-height:36px;">🔍-</button>
                    <button class="btn btn-sm btn-secondary" id="pc-zoom-in" style="min-width:36px;min-height:36px;">🔍+</button>
                    ${hasAiAccess ? `<button class="btn btn-sm btn-ghost" id="pc-ai-hint" title="Get best move hint" style="font-size:1.2rem;padding:4px 8px;min-width:36px;min-height:36px;">💡</button>` : ''}
                    ${isHost ? `<button class="btn btn-sm btn-ghost danger" id="pc-force-end">🛑 End</button>` : ''}
                </div>
            </div>
            
            <div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:center;padding:8px;flex:1;overflow:hidden;min-height:0;">
                
                <!-- Main Board Wrapper for mobile zoom/pan -->
                <div style="flex:1;min-width:min(300px,100%);display:flex;flex-direction:column;align-items:center;overflow:hidden;min-height:0;">
                    <div id="pc-status" style="font-size:clamp(0.9rem,3vw,1.2rem);font-weight:700;margin-bottom:8px;text-align:center;padding:0 8px;">
                        Initializing Board...
                    </div>
                    
                    <div style="width:100%;flex:1;overflow:auto;display:flex;border:2px solid var(--border-color);border-radius:4px;background:#111;min-height:0;">
                        <div id="pc-board" style="display:grid;grid-template-columns:repeat(${gridSize}, 1fr);grid-template-rows:repeat(${gridSize}, 1fr);width:${currentZoom}%;min-width:${currentZoom}%;aspect-ratio:1/1;margin:auto;transition:width 0.2s,min-width 0.2s;">
                            <!-- Cells rendered dynamically -->
                        </div>
                    </div>
                </div>

                <!-- Sidebar: scrolls horizontally on mobile -->
                <div style="flex:1 1 280px;max-width:100%;min-height:120px;background:var(--bg-card);border-radius:12px;padding:16px;border:1px solid rgba(255,255,255,0.1);overflow-y:auto;display:flex;flex-direction:row;flex-wrap:wrap;gap:8px;align-content:flex-start;">
                    <h3 style="width:100%;margin-bottom:8px;font-size:1.1rem;color:var(--text-secondary);">Kings</h3>
                    <div id="pc-player-list" style="display:contents;"></div>
                </div>

            </div>
        </div>
    `;

    const backBtn = container.querySelector('#pc-back');
    const forceEndBtn = container.querySelector('#pc-force-end');
    const aiHintBtn = container.querySelector('#pc-ai-hint');
    const zoomInBtn = container.querySelector('#pc-zoom-in');
    const zoomOutBtn = container.querySelector('#pc-zoom-out');
    const boardDiv = container.querySelector('#pc-board');
    const statusDiv = container.querySelector('#pc-status');
    const playerListDiv = container.querySelector('#pc-player-list');

    let aiHighlightFrom = null;
    let aiHighlightTo = null;

    if (aiHintBtn) {
        aiHintBtn.addEventListener('click', () => {
            if (uids[currentTurnIndex] !== myId) {
                showToast("It's not your turn!", 'info');
                return;
            }
            const best = findBestMove();
            if (best) {
                aiHighlightFrom = best.from;
                aiHighlightTo = best.to;
                renderBoard();
                showToast('💡 Best move highlighted!', 'success');
            } else {
                showToast('No moves available.', 'info');
            }
        });
    }

    if (forceEndBtn) {
        forceEndBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to end this match for everyone?')) {
                const pd = window._partyData;
                const nextCount = (pd?.matchCount || 0) + 1;
                channel.send({ type: 'broadcast', event: 'force_game_end', payload: { matchCount: nextCount } });
                if (pd) pd.matchCount = nextCount;
                if (nextCount >= 2) pd?.forceHome();
                else onBack();
            }
        });
    }

    zoomInBtn.addEventListener('click', () => {
        currentZoom = Math.min(600, currentZoom + 50);
        boardDiv.style.width = currentZoom + '%';
        boardDiv.style.minWidth = currentZoom + '%';
    });
    zoomOutBtn.addEventListener('click', () => {
        currentZoom = Math.max(100, currentZoom - 50);
        boardDiv.style.width = currentZoom + '%';
        boardDiv.style.minWidth = currentZoom + '%';
    });

    // ─── Network ───
    channel.on('broadcast', { event: 'force_game_end' }, ({ payload }) => {
        if (isHost) return; // host already handled above
        const pd = window._partyData;
        const count = payload?.matchCount || 1;
        if (pd) pd.matchCount = count;
        showToast('Host ended the match.', 'info');
        if (count >= 2) pd?.forceHome();
        else onBack();
    });

    channel.on('broadcast', { event: 'chess_init' }, ({ payload }) => {
        board = payload.board;
        currentTurnIndex = payload.turnIndex;
        renderFull();
    });

    channel.on('broadcast', { event: 'chess_move' }, ({ payload }) => {
        const piece = board[payload.from.r][payload.from.c];
        board[payload.to.r][payload.to.c] = piece;
        board[payload.from.r][payload.from.c] = null;

        if (payload.killedUid) {
            playerMap[payload.killedUid].alive = false;
            showToast(`${escapeHtml(playerMap[payload.killedUid].username)}'s King fell! 💀`, 'error');
            import('../ui/animations.js').then(({ playSound }) => playSound('error'));
        } else if (payload.capture) {
            import('../ui/animations.js').then(({ playSound }) => playSound('pop'));
        } else {
            import('../ui/animations.js').then(({ playSound }) => playSound('place'));
        }

        currentTurnIndex = payload.nextTurnIndex;
        checkWinCondition();
        renderFull();
    });

    // ─── INIT ───
    if (isHost) {
        setupInitialBoard();
        channel.send({ type: 'broadcast', event: 'chess_init', payload: { board, turnIndex: currentTurnIndex } });
        renderFull();
    }

    function setupInitialBoard() {
        // Blocks: King, Queen, Rook, Knight, Bishop, 4 Pawns (Total 9)
        let blocks = [];
        const zonesPerRow = Math.max(2, Math.ceil(Math.sqrt(uids.length)));

        for (let r = 0; r < zonesPerRow; r++) {
            for (let c = 0; c < zonesPerRow; c++) {
                blocks.push({ r: r * 4 + 1, c: c * 4 + 1 });
            }
        }

        // Shuffle
        for (let i = blocks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
        }

        uids.forEach(uid => {
            if (blocks.length > 0) {
                let cell = blocks.pop();
                board[cell.r][cell.c] = { type: 'R', owner: uid };
                board[cell.r][cell.c + 1] = { type: 'N', owner: uid };
                board[cell.r][cell.c + 2] = { type: 'B', owner: uid };

                board[cell.r + 1][cell.c] = { type: 'Q', owner: uid };
                board[cell.r + 1][cell.c + 1] = { type: 'K', owner: uid };
                board[cell.r + 1][cell.c + 2] = { type: 'P', owner: uid };

                board[cell.r + 2][cell.c] = { type: 'P', owner: uid };
                board[cell.r + 2][cell.c + 1] = { type: 'P', owner: uid };
                board[cell.r + 2][cell.c + 2] = { type: 'P', owner: uid };
            }
        });
    }

    // ─── RENDER ───
    function renderFull() {
        renderBoard();
        renderSidebar();
        updateStatus();
    }

    function getPieceChar(type) {
        switch (type) {
            case 'K': return '♚';
            case 'Q': return '♛';
            case 'R': return '♜';
            case 'B': return '♝';
            case 'N': return '♞';
            case 'P': return '♟';
            default: return '';
        }
    }

    function renderBoard() {
        boardDiv.innerHTML = '';
        const fragment = document.createDocumentFragment();

        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                const cell = document.createElement('div');
                const isLight = (r + c) % 2 === 0;
                cell.className = `chess-sq ${isLight ? 'light' : 'dark'}`;
                cell.style.cssText = `
                    width:100%;height:100%;display:flex;align-items:center;justify-content:center;
                    font-size: clamp(0.8rem, 2vw, 2rem); cursor:pointer;
                    background-color: ${isLight ? '#E5E7EB' : '#9CA3AF'};
                `;

                if (selectedSquare && selectedSquare.r === r && selectedSquare.c === c) {
                    cell.style.backgroundColor = '#FBBF24';
                } else if (validMoves.some(m => m.r === r && m.c === c)) {
                    cell.style.backgroundColor = '#34D399';
                    cell.style.boxShadow = 'inset 0 0 0 2px rgba(0,0,0,0.5)';
                } else if (aiHighlightFrom && aiHighlightFrom.r === r && aiHighlightFrom.c === c) {
                    cell.style.backgroundColor = '#9B59B6';
                    cell.style.boxShadow = 'inset 0 0 0 3px #6C3483';
                } else if (aiHighlightTo && aiHighlightTo.r === r && aiHighlightTo.c === c) {
                    cell.style.backgroundColor = '#E91E8C';
                    cell.style.boxShadow = 'inset 0 0 0 3px #A01464';
                }

                const piece = board[r][c];
                if (piece && playerMap[piece.owner]?.alive) {
                    const color = playerMap[piece.owner].color;
                    const char = getPieceChar(piece.type);
                    cell.innerHTML = `<span style="color:${color};text-shadow:1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000, 0 4px 10px rgba(0,0,0,0.5);">${char}</span>`;
                }

                cell.addEventListener('mousedown', () => onSquareClick(r, c)); // better for mobile than click sometimes
                fragment.appendChild(cell);
            }
        }
        boardDiv.appendChild(fragment);
    }

    function renderSidebar() {
        playerListDiv.innerHTML = uids.map(uid => {
            const p = playerMap[uid];
            const isTurn = uids[currentTurnIndex] === uid;
            return `<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:100px;background:${isTurn ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'};opacity:${p.alive ? '1' : '0.3'};border:1.5px solid ${isTurn ? p.color : 'transparent'};max-width:120px;">
                <div style="width:12px;height:12px;border-radius:50%;background:${p.color};flex-shrink:0;"></div>
                <div style="font-size:0.75rem;font-weight:${isTurn ? 'bold' : 'normal'};color:${isTurn ? p.color : 'var(--text-primary)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.username)}</div>
                <div style="font-size:0.75rem;flex-shrink:0;">${p.alive ? '♚' : '💀'}</div>
            </div>`;
        }).join('');
    }

    function updateStatus() {
        if (gameOver) {
            statusDiv.innerHTML = `<span style="color:var(--primary-color)">🥇 ${escapeHtml(playerMap[winnerId].username)} WINS!</span>`;
            statusDiv.style.fontSize = '1.8rem';
            import('../ui/animations.js').then(({ triggerConfetti }) => triggerConfetti());
            return;
        }

        if (!playerMap[myId].alive) {
            statusDiv.innerHTML = `<span style="color:var(--text-muted)">Spectating 👻</span>`;
            return;
        }

        const turnUid = uids[currentTurnIndex];
        if (turnUid === myId) {
            statusDiv.innerHTML = `<span style="color:${playerMap[myId].color}">▶ YOUR TURN!</span>`;
        } else {
            statusDiv.innerHTML = `<span style="color:var(--text-secondary)">⏳ ${escapeHtml(playerMap[turnUid].username)} is playing...</span>`;
        }
    }

    // ─── LOGIC ───
    function onSquareClick(r, c) {
        if (gameOver || !playerMap[myId].alive) return;
        if (uids[currentTurnIndex] !== myId) {
            showToast("It's not your turn!", "info");
            return;
        }

        const piece = board[r][c];

        if (validMoves.some(m => m.r === r && m.c === c)) {
            executeMove(selectedSquare, { r, c });
            return;
        }

        if (piece && piece.owner === myId) {
            selectedSquare = { r, c };
            calculateValidMoves(r, c, piece);
            renderFull();
        } else {
            selectedSquare = null;
            validMoves = [];
            renderFull();
        }
    }

    function calculateValidMoves(r, c, piece) {
        validMoves = [];

        const tryAddLine = (dr, dc, limit) => {
            let tr = r + dr;
            let tc = c + dc;
            let steps = 0;
            while (steps < limit && tr >= 0 && tr < gridSize && tc >= 0 && tc < gridSize) {
                const target = board[tr][tc];
                if (!target || !playerMap[target.owner].alive) {
                    validMoves.push({ r: tr, c: tc });
                } else if (target.owner !== myId) {
                    validMoves.push({ r: tr, c: tc }); // attack
                    break;
                } else {
                    break; // blocked by own piece
                }
                tr += dr;
                tc += dc;
                steps++;
            }
        };

        if (piece.type === 'K') {
            [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(d => tryAddLine(d[0], d[1], 1));
        } else if (piece.type === 'Q') {
            [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(d => tryAddLine(d[0], d[1], 99));
        } else if (piece.type === 'R') {
            [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(d => tryAddLine(d[0], d[1], 99));
        } else if (piece.type === 'B') {
            [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(d => tryAddLine(d[0], d[1], 99));
        } else if (piece.type === 'N') {
            [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2]].forEach(d => tryAddLine(d[0], d[1], 1));
        } else if (piece.type === 'P') {
            // Battle Royale Pawn: Move 1 orthogonal, Attack 1 diagonal (all directions because of scattered mass)
            const orthogonals = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            orthogonals.forEach(d => {
                let tr = r + d[0];
                let tc = c + d[1];
                if (tr >= 0 && tr < gridSize && tc >= 0 && tc < gridSize) {
                    const t = board[tr][tc];
                    if (!t || !playerMap[t.owner].alive) validMoves.push({ r: tr, c: tc });
                }
            });
            const diagonals = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
            diagonals.forEach(d => {
                let tr = r + d[0];
                let tc = c + d[1];
                if (tr >= 0 && tr < gridSize && tc >= 0 && tc < gridSize) {
                    const t = board[tr][tc];
                    if (t && t.owner !== myId && playerMap[t.owner].alive) validMoves.push({ r: tr, c: tc });
                }
            });
        }
    }

    function executeMove(from, to) {
        selectedSquare = null;
        validMoves = [];
        aiHighlightFrom = null;
        aiHighlightTo = null;

        const targetPiece = board[to.r][to.c];
        let killedUid = null;
        let isCapture = false;

        if (targetPiece && targetPiece.owner !== myId && playerMap[targetPiece.owner].alive) {
            isCapture = true;
            if (targetPiece.type === 'K') {
                killedUid = targetPiece.owner;
            }
        }

        const piece = board[from.r][from.c];
        board[to.r][to.c] = piece;
        board[from.r][from.c] = null;

        if (killedUid) {
            playerMap[killedUid].alive = false;
        }

        let nextTurnIndex = currentTurnIndex;
        let found = false;
        for (let i = 0; i < uids.length - 1; i++) {
            nextTurnIndex = (nextTurnIndex + 1) % uids.length;
            if (playerMap[uids[nextTurnIndex]].alive) {
                found = true;
                break;
            }
        }

        if (!found) nextTurnIndex = currentTurnIndex;

        currentTurnIndex = nextTurnIndex;

        channel.send({
            type: 'broadcast', event: 'chess_move', payload: {
                from, to, nextTurnIndex, killedUid, capture: isCapture
            }
        });

        if (killedUid) {
            showToast(`You killed ${escapeHtml(playerMap[killedUid].username)}! 💀`, 'success');
            import('../ui/animations.js').then(({ playSound }) => playSound('error'));
        } else if (isCapture) {
            import('../ui/animations.js').then(({ playSound }) => playSound('pop'));
        } else {
            import('../ui/animations.js').then(({ playSound }) => playSound('place'));
        }

        checkWinCondition();
        renderFull();
    }

    function checkWinCondition() {
        if (gameOver) return;
        const alivePlayers = uids.filter(uid => playerMap[uid].alive);
        if (alivePlayers.length === 1 && uids.length > 1) {
            gameOver = true;
            winnerId = alivePlayers[0];
        } else if (alivePlayers.length === 0) {
            gameOver = true;
            winnerId = myId;
        }
    }

    // ─── AI HEURISTIC ───
    const PIECE_VALUES = { K: 900, Q: 90, R: 50, B: 30, N: 30, P: 10 };

    function getAllMovesFor(uid, b) {
        const moves = [];
        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                const p = b[r][c];
                if (!p || p.owner !== uid) continue;
                const targets = calcMoves(r, c, p, uid, b);
                targets.forEach(t => moves.push({ from: { r, c }, to: t, piece: p }));
            }
        }
        return moves;
    }

    function calcMoves(r, c, piece, ownerId, b) {
        const moves = [];
        function tryAdd(dr, dc, limit) {
            let tr = r + dr, tc = c + dc, steps = 0;
            while (steps < limit && tr >= 0 && tr < gridSize && tc >= 0 && tc < gridSize) {
                const t = b[tr][tc];
                if (!t || !playerMap[t.owner].alive) { moves.push({ r: tr, c: tc }); }
                else if (t.owner !== ownerId) { moves.push({ r: tr, c: tc }); break; }
                else break;
                tr += dr; tc += dc; steps++;
            }
        }
        if (piece.type === 'K') [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(d => tryAdd(d[0], d[1], 1));
        if (piece.type === 'Q') [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(d => tryAdd(d[0], d[1], 99));
        if (piece.type === 'R') [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(d => tryAdd(d[0], d[1], 99));
        if (piece.type === 'B') [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(d => tryAdd(d[0], d[1], 99));
        if (piece.type === 'N') [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2]].forEach(d => tryAdd(d[0], d[1], 1));
        if (piece.type === 'P') {
            [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(d => { let tr = r + d[0], tc = c + d[1]; if (tr >= 0 && tr < gridSize && tc >= 0 && tc < gridSize) { const t = b[tr][tc]; if (!t || !playerMap[t.owner].alive) moves.push({ r: tr, c: tc }); } });
            [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(d => { let tr = r + d[0], tc = c + d[1]; if (tr >= 0 && tr < gridSize && tc >= 0 && tc < gridSize) { const t = b[tr][tc]; if (t && t.owner !== ownerId && playerMap[t.owner].alive) moves.push({ r: tr, c: tc }); } });
        }
        return moves;
    }

    function evalBoard(b) {
        let score = 0;
        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                const p = b[r][c];
                if (!p || !playerMap[p.owner].alive) continue;
                const val = PIECE_VALUES[p.type] || 0;
                if (p.owner === myId) score += val;
                else score -= val;
            }
        }
        return score;
    }

    function findBestMove() {
        const myMoves = getAllMovesFor(myId, board);
        if (myMoves.length === 0) return null;
        let best = null, bestScore = -Infinity;
        for (const mv of myMoves) {
            // Shallow copy board
            const bCopy = board.map(row => row.map(c => c ? { ...c } : null));
            const captured = bCopy[mv.to.r][mv.to.c];
            bCopy[mv.to.r][mv.to.c] = bCopy[mv.from.r][mv.from.c];
            bCopy[mv.from.r][mv.from.c] = null;

            let score = evalBoard(bCopy);
            // Bonus for capturing kings
            if (captured && captured.type === 'K') score += 1000;
            if (score > bestScore) { bestScore = score; best = mv; }
        }
        return best;
    }
}
