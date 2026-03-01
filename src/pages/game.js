// src/pages/game.js
// Game container — routes to individual game implementations for VS AI mode

import { renderTicTacToe } from '../games/tictactoe.js';
import { renderConnectFour } from '../games/connectfour.js';
import { renderChess } from '../games/chess.js?v=5';
import { renderCheckers } from '../games/checkers.js';
import { renderBattleship } from '../games/battleship.js';
import { renderMinesweeper } from '../games/minesweeper.js';
import { renderWordGuess } from '../games/wordguess.js';
import { renderRPS } from '../games/rockpaperscissors.js';
import { renderTrivia } from '../games/trivia.js';
import { renderPartyChess } from '../games/party_chess.js';
import { renderPartyTrivia } from '../games/party_trivia.js';
import { renderPartyNeonCards } from '../games/party_neoncards.js';
import { renderPartyDraw } from '../games/party_draw.js';

const RENDERERS = {
  chess: renderChess,
  checkers: renderCheckers,
  tictactoe: renderTicTacToe,
  connectfour: renderConnectFour,
  battleship: renderBattleship,
  minesweeper: renderMinesweeper,
  wordguess: renderWordGuess,
  rockpaperscissors: renderRPS,
  trivia: renderTrivia,
  party_chess: renderPartyChess,
  party_trivia: renderPartyTrivia,
  party_neoncards: renderPartyNeonCards,
  party_draw: renderPartyDraw,
};


export function renderGamePage(container, game, multiplayer, onBack) {
  // Clear container
  container.innerHTML = '';

  const renderer = RENDERERS[game.id];
  if (!renderer) {
    container.innerHTML = `
      <div class="game-screen" style="align-items:center;justify-content:center;flex-direction:column;gap:24px;">
        <div style="font-size:3rem;">🚧</div>
        <div style="font-size:1.5rem;font-weight:800;">Coming Soon</div>
        <div style="color:var(--text-secondary);">${game.name} VS AI is under construction.</div>
        <button class="btn btn-ghost" id="back-btn">← Back to Hub</button>
      </div>
    `;
    container.querySelector('#back-btn').addEventListener('click', onBack);
    return;
  } else {
    renderer(container, onBack, multiplayer);
  }
}
