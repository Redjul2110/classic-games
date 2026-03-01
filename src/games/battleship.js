// src/games/battleship.js
import { showToast } from '../ui/toast.js';
import { ogClient } from '../supabase.js';

const SIZE = 10;
const SHIPS = [5, 4, 3, 3, 2]; // ship sizes
const EMPTY = 0, SHIP = 1, HIT = 2, MISS = 3, SUNK = 4;

export function renderBattleship(container, onBack, multiplayer) {
  const isMp = !!multiplayer;
  const isHost = isMp ? multiplayer.isHost : true;

  let playerGrid = createGrid();
  let aiGrid = createGrid(); // In MP this is oppGrid
  let playerShips = [];
  let aiShips = []; // Only used in single player
  let gameOver = false;
  let aiMovePending = false;
  let phase = 'placing'; // 'placing', 'waiting' (MP), 'playing'
  let placingShipIdx = 0;
  let horizontal = true;

  let playerTurn = true; // In MP: true if my turn
  let myReady = false;
  let oppReady = false;
  let sunkOppShips = 0; // for MP UI

  let channel = null;

  // AI Hunt/Target state
  let aiHits = [];
  let aiTargets = [];
  let aiHitList = new Set();

  if (!isMp) {
    placeShipsRandom(aiGrid, aiShips);
  }

  if (isMp) {
    channel = ogClient.channel('game-' + multiplayer.lobby.id);
    channel.on('broadcast', { event: 'state' }, (payload) => {
      const { action, r, c, result, lost } = payload.payload;
      if (action === 'ready') {
        oppReady = true;
        checkStartGame();
      } else if (action === 'fire') {
        handleGotFired(r, c);
      } else if (action === 'fire_result') {
        handleFireResult(r, c, result, lost);
      } else if (action === 'new_game') {
        if (isHost) newGame(true);
        else newGame(false);
      }
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

  function checkStartGame() {
    if (!isMp) {
      // VS AI: start immediately after player places all ships
      if (myReady) {
        phase = 'playing';
        playerTurn = true;
        render();
        showToast('All ships placed! Click the enemy grid to fire! 🎯', 'info');
      }
      return;
    }
    if (myReady && oppReady) {
      phase = 'playing';
      playerTurn = isHost; // Host always gets first turn
      render();
      if (playerTurn) showToast('Your turn to fire!', 'info');
    } else if (myReady && !oppReady) {
      phase = 'waiting';
      render();
    }
  }

  function handleGotFired(r, c) {
    if (gameOver) return;
    let res = MISS;

    if (playerGrid[r][c] === SHIP) {
      playerGrid[r][c] = HIT; // temporary
      // Check if sunk
      const ship = playerShips.find(s => s.cells.some(([sr, sc]) => sr === r && sc === c));
      const sunk = ship && ship.cells.every(([sr, sc]) => playerGrid[sr][sc] === HIT || playerGrid[sr][sc] === SUNK);
      if (sunk) {
        res = SUNK;
        ship.cells.forEach(([sr, sc]) => { playerGrid[sr][sc] = SUNK; });
      } else {
        res = HIT;
      }
    } else {
      playerGrid[r][c] = MISS;
    }

    const l = playerShips.every(s => s.cells.every(([sr, sc]) => playerGrid[sr][sc] === HIT || playerGrid[sr][sc] === SUNK));

    channel.send({ type: 'broadcast', event: 'state', payload: { action: 'fire_result', r, c, result: res, lost: l } });

    if (l) {
      gameOver = true;
      showEnd('Opponent wins! 💀');
    } else {
      playerTurn = true; // My turn now
      render();
    }
  }

  function handleFireResult(r, c, res, lost) {
    aiGrid[r][c] = res;
    if (res === SUNK) {
      // If sunk, we might not know exactly which surrounding hits belong to the sink but we just mark this shot as SUNK in our simple oppGrid representation.
      // Ideally we'd receive the cells, but for now we just count it.
      sunkOppShips++;
    }

    render();

    if (lost) {
      gameOver = true;
      showEnd('You win! ★');
    }
  }

  function newGame(broadcast = false) {
    playerGrid = createGrid();
    aiGrid = createGrid();
    playerShips = [];
    aiShips = [];
    gameOver = false;
    aiMovePending = false;
    phase = 'placing';
    placingShipIdx = 0;
    horizontal = true;
    myReady = false;
    oppReady = false;
    sunkOppShips = 0;
    aiHits = [];
    aiTargets = [];
    aiHitList = new Set();

    if (!isMp) placeShipsRandom(aiGrid, aiShips);

    if (isMp && broadcast && channel) {
      channel.send({ type: 'broadcast', event: 'state', payload: { action: 'new_game' } });
    }
    render();
  }

  function createGrid() { return Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY)); }

  function render() {
    const placingShip = phase === 'placing' ? SHIPS[placingShipIdx] : null;
    let turnStatus = '';
    if (phase === 'playing') {
      if (!isMp) turnStatus = 'Click the AI\'s grid to fire!';
      else turnStatus = playerTurn ? 'Your turn to fire!' : 'Opponent is firing...';
    }

    container.innerHTML = `
      <div class="game-screen">
        <div class="game-screen-header">
          <button class="btn btn-ghost btn-sm" id="back-btn">← Back</button>
          <div class="game-screen-title">Battleship <span class="game-screen-badge ${isMp ? 'vs-player' : 'vs-ai'}">${isMp ? 'Multiplayer' : 'VS AI'}</span></div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;padding:16px;gap:12px;">
          ${phase === 'placing' ? `
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:center;">
              <span style="font-weight:600;font-size:0.9rem;">
                Placing ship ${placingShipIdx + 1}/5 (size ${placingShip})
              </span>
              <button class="btn btn-ghost btn-sm" id="rotate-btn">
                🔄 ${horizontal ? 'Horizontal' : 'Vertical'}
              </button>
            </div>
            <button class="btn btn-ghost btn-sm" id="random-place-btn">🎲 Place All Randomly</button>
          ` : phase === 'waiting' ? `
            <div style="font-weight:600;font-size:0.9rem;color:var(--orange-primary);">Waiting for opponent to place ships...</div>
          ` : `
            <div style="font-weight:600;font-size:0.88rem;color:${playerTurn ? 'var(--primary-color)' : 'var(--text-secondary)'};">
              ${turnStatus} Ships sunk: You ${isMp ? sunkOppShips : countSunk(aiGrid, aiShips)} / ${isMp ? 'Opp' : 'AI'} ${countSunk(playerGrid, playerShips)}
            </div>
          `}
          
          <div class="battleship-grids">
            <div class="battleship-grid-wrap">
              <div class="battleship-grid-title">Your Fleet</div>
              <div class="bs-grid" style="grid-template-columns:repeat(${SIZE},1fr);" id="player-grid">
                ${renderGrid(playerGrid, false, phase === 'placing')}
              </div>
            </div>
            ${phase === 'playing' ? `
            <div class="battleship-grid-wrap">
              <div class="battleship-grid-title">Enemy Waters</div>
              <div class="bs-grid" style="grid-template-columns:repeat(${SIZE},1fr);" id="ai-grid" style="${!playerTurn && isMp ? 'opacity:0.6;pointer-events:none;' : ''}">
                ${renderGrid(aiGrid, true, false)}
              </div>
            </div>` : ''}
          </div>
        </div>
      </div>
    `;

    container.querySelector('#back-btn').addEventListener('click', handleExit);

    if (phase === 'placing') {
      container.querySelector('#rotate-btn')?.addEventListener('click', () => { horizontal = !horizontal; render(); });
      container.querySelector('#random-place-btn')?.addEventListener('click', () => {
        playerGrid = createGrid(); playerShips = [];
        placeShipsRandom(playerGrid, playerShips);
        placingShipIdx = SHIPS.length;
        myReady = true;
        if (isMp && channel) channel.send({ type: 'broadcast', event: 'state', payload: { action: 'ready' } });
        checkStartGame();
      });

      // Hover preview
      container.querySelectorAll('#player-grid .bs-cell').forEach(cell => {
        const r = parseInt(cell.dataset.r), c = parseInt(cell.dataset.c);
        cell.addEventListener('mouseenter', () => {
          showPreview(r, c, SHIPS[placingShipIdx], horizontal, playerGrid, container);
        });
        cell.addEventListener('mouseleave', () => clearPreview(container));
        cell.addEventListener('click', () => placeShip(r, c));
      });
    } else if (phase === 'playing') {
      // Fire on AI/Opp grid
      container.querySelectorAll('#ai-grid .bs-cell').forEach(cell => {
        const r = parseInt(cell.dataset.r), c = parseInt(cell.dataset.c);
        cell.addEventListener('click', () => {
          if (gameOver || aiGrid[r][c] === HIT || aiGrid[r][c] === MISS || aiGrid[r][c] === SUNK) return;
          if (isMp && (!playerTurn || aiMovePending)) return;
          if (!isMp && aiMovePending) return;

          if (isMp) {
            playerTurn = false;
            channel.send({ type: 'broadcast', event: 'state', payload: { action: 'fire', r, c } });
            render();
          } else {
            fireAt(aiGrid, r, c, aiShips);
            const won = aiShips.every(s => s.cells.every(([sr, sc]) => aiGrid[sr][sc] === HIT || aiGrid[sr][sc] === SUNK));
            if (won) { gameOver = true; render(); return showEnd('You win! ★'); }
            render();

            // AI fires back
            aiMovePending = true;
            setTimeout(() => {
              aiFireAt();
              const lost = playerShips.every(s => s.cells.every(([sr, sc]) => playerGrid[sr][sc] === HIT || playerGrid[sr][sc] === SUNK));
              if (lost) { gameOver = true; render(); return showEnd('AI wins! [AI]'); }
              aiMovePending = false;
              render();
            }, 800);
          }
        });
      });
    }
  }

  function renderGrid(grid, hideShips, clickable) {
    let html = '';
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = grid[r][c];
        let cls = 'bs-cell';
        if (cell === HIT) cls += ' hit';
        else if (cell === MISS) cls += ' miss';
        else if (cell === SUNK) cls += ' sunk';
        else if (cell === SHIP && !hideShips) cls += ' ship';
        html += `<div class="${cls}" data-r="${r}" data-c="${c}"></div>`;
      }
    }
    return html;
  }

  function placeShip(r, c) {
    if (placingShipIdx >= SHIPS.length) return;
    const size = SHIPS[placingShipIdx];
    const cells = getShipCells(r, c, size, horizontal);
    if (!cells || !canPlace(playerGrid, cells)) return;
    cells.forEach(([sr, sc]) => { playerGrid[sr][sc] = SHIP; });
    playerShips.push({ size, cells });
    placingShipIdx++;
    if (placingShipIdx >= SHIPS.length) {
      myReady = true;
      if (isMp && channel) channel.send({ type: 'broadcast', event: 'state', payload: { action: 'ready' } });
      checkStartGame();
    } else {
      render();
    }
  }

  function showEnd(msg) {
    if (msg.includes('win')) {
      import('../ui/animations.js').then(({ triggerConfetti }) => triggerConfetti());
    }
    showToast(msg, msg.includes('win') ? 'success' : 'error', 4000);
    setTimeout(() => {
      const div = document.createElement('div');
      div.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:100;">
          <div style="text-align:center;padding:40px;">
            <div style="font-size:3rem;margin-bottom:12px;">${msg.includes('win') ? '★' : '💀'}</div>
            <div style="font-size:2rem;font-weight:900;margin-bottom:16px;">${msg}</div>
            <div style="display:flex;gap:12px;justify-content:center;">
              ${(!isMp || isHost) ? `<button class="btn btn-primary" id="restart-bs-btn">Play Again</button>` : `<div style="color:var(--text-muted)">Waiting for host...</div>`}
              <button class="btn btn-ghost" id="exit-bs-btn">Exit</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(div);
      const resBtn = div.querySelector('#restart-bs-btn');
      if (resBtn) resBtn.addEventListener('click', () => { div.remove(); newGame(true); });
      div.querySelector('#exit-bs-btn').addEventListener('click', () => { div.remove(); handleExit(); });
    }, 1000);
  }

  // ─── AI Hunt/Target strategy ───
  function aiFireAt() {
    let r, c;
    if (aiTargets.length > 0) {
      // Target mode: fire at adjacent cells of a hit
      [r, c] = aiTargets.shift();
      while (aiHitList.has(`${r},${c}`) && aiTargets.length > 0) [r, c] = aiTargets.shift();
    } else {
      // Hunt mode: checkerboard pattern
      const cells = [];
      for (let i = 0; i < SIZE; i++)
        for (let j = (i % 2); j < SIZE; j += 2)
          if (!aiHitList.has(`${i},${j}`) && playerGrid[i][j] !== HIT && playerGrid[i][j] !== MISS && playerGrid[i][j] !== SUNK)
            cells.push([i, j]);
      if (cells.length === 0) {
        // Fall back to any unshot cell
        for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE; j++)
          if (!aiHitList.has(`${i},${j}`) && playerGrid[i][j] !== HIT && playerGrid[i][j] !== MISS && playerGrid[i][j] !== SUNK) cells.push([i, j]);
      }
      if (cells.length === 0) return;
      [r, c] = cells[Math.floor(Math.random() * cells.length)];
    }

    aiHitList.add(`${r},${c}`);
    if (playerGrid[r][c] === SHIP) {
      playerGrid[r][c] = HIT; // we mark it hit first
      // is it sunk?
      const ship = playerShips.find(s => s.cells.some(([sr, sc]) => sr === r && sc === c));
      if (ship && ship.cells.every(([sr, sc]) => playerGrid[sr][sc] === HIT || playerGrid[sr][sc] === SUNK)) {
        ship.cells.forEach(([sr, sc]) => { playerGrid[sr][sc] = SUNK; });
      }

      aiHits.push([r, c]);
      // Add adjacent cells to targets
      [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([nr, nc]) => {
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && !aiHitList.has(`${nr},${nc}`))
          aiTargets.push([nr, nc]);
      });
      showToast('AI hit your ship! 🔥', 'error');
    } else {
      playerGrid[r][c] = MISS;
    }
  }

  function getShipCells(r, c, size, horizontal) {
    const cells = [];
    for (let i = 0; i < size; i++) {
      const nr = horizontal ? r : r + i;
      const nc = horizontal ? c + i : c;
      if (nr >= SIZE || nc >= SIZE) return null;
      cells.push([nr, nc]);
    }
    return cells;
  }

  function canPlace(grid, cells) {
    return cells.every(([r, c]) => r >= 0 && r < SIZE && c >= 0 && c < SIZE && grid[r][c] === EMPTY);
  }

  function placeShipsRandom(grid, ships) {
    for (const size of SHIPS) {
      let placed = false;
      while (!placed) {
        const horiz = Math.random() < 0.5;
        const r = Math.floor(Math.random() * SIZE);
        const c = Math.floor(Math.random() * SIZE);
        const cells = getShipCells(r, c, size, horiz);
        if (cells && canPlace(grid, cells)) {
          cells.forEach(([sr, sc]) => { grid[sr][sc] = SHIP; });
          ships.push({ size, cells });
          placed = true;
        }
      }
    }
  }

  function fireAt(grid, r, c, ships) {
    if (grid[r][c] === SHIP) {
      grid[r][c] = HIT;
      const ship = ships.find(s => s.cells.some(([sr, sc]) => sr === r && sc === c));
      if (ship && ship.cells.every(([sr, sc]) => grid[sr][sc] === HIT || grid[sr][sc] === SUNK)) {
        ship.cells.forEach(([sr, sc]) => { grid[sr][sc] = SUNK; });
      }
    }
    else { grid[r][c] = MISS; }
  }

  function countSunk(grid, ships) {
    return ships.filter(s => s.cells.every(([r, c]) => grid[r][c] === HIT || grid[r][c] === SUNK)).length;
  }

  function showPreview(r, c, size, horiz, grid, container) {
    // Intentionally empty logic, hover preview isn't visual.
  }

  function clearPreview(container) { }

  render();
}
