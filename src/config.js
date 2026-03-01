// src/config.js
// Supabase Configuration for RedJGames Classic
// RedJGames Project: Auth, Profiles, Chat, Friends
// OnlineGames Project: Game Sessions, Lobbies, Matchmaking

export const REDJGAMES_CONFIG = {
  url: 'https://dxooundpabsbmgbtqijc.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4b291bmRwYWJzYm1nYnRxaWpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNTg2MDYsImV4cCI6MjA4NjkzNDYwNn0.4sp8UgIwCgPTwnvQNYZZVsr1h6E2WdEHiFAbwm6FBSU',
};

export const ONLINE_GAMES_CONFIG = {
  url: 'https://dzujxfxsmzojgbuasbtc.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6dWp4ZnhzbXpvamdidWFzYnRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MjU3OTAsImV4cCI6MjA4NzEwMTc5MH0.WFxp4xb2pMzLxy7HaKEeKpuUCygZSq-Nksbhplr_s6U',
};

// App Settings
export const APP_CONFIG = {
  appName: 'RedJGames Classic',
  maxPlayersPerLobby: 5,
  heartbeatIntervalMs: 5000,    // 5 seconds
  ghostLobbyTimeoutSeconds: 30, // 30 seconds no heartbeat = dead
  guestCleanupDays: 1,          // Guest sessions reset daily
};

// 10 Available Games
export const GAMES = [
  {
    id: 'chess',
    slug: 'chess',
    name: 'Chess',
    description: 'The classic strategy game of kings. Outmaneuver your opponent in this timeless battle of wits. (Max 2 players simultaneously.)',
    icon: '♟️',
    minPlayers: 2,
    maxPlayers: 2,
    color: '#c0392b',
  },
  {
    id: 'checkers',
    slug: 'checkers',
    name: 'Checkers',
    description: 'Jump and capture your way to victory in this fast-paced diagonal battle. (Max 2 players simultaneously.)',
    icon: '(Red)',
    minPlayers: 2,
    maxPlayers: 2,
    color: '#e74c3c',
  },
  {
    id: 'tictactoe',
    slug: 'tictactoe',
    name: 'Tic-Tac-Toe',
    description: 'Three in a row wins! Simple to learn, surprisingly strategic. (Max 2 players simultaneously.)',
    icon: '[X]',
    minPlayers: 2,
    maxPlayers: 2,
    color: '#e67e22',
  },
  {
    id: 'connectfour',
    slug: 'connectfour',
    name: 'Connect Four',
    description: 'Drop your discs and connect four in a row before your opponent does. (Max 2 players simultaneously.)',
    icon: '🟡',
    minPlayers: 2,
    maxPlayers: 2,
    color: '#d35400',
  },
  {
    id: 'battleship',
    slug: 'battleship',
    name: 'Battleship',
    description: 'Sink the enemy fleet! Classic naval warfare on a grid. (Max 2 players simultaneously.)',
    icon: '🚢',
    minPlayers: 2,
    maxPlayers: 2,
    color: '#922b21',
  },
  {
    id: 'minesweeper',
    slug: 'minesweeper',
    name: 'Minesweeper Race',
    description: 'Race against others to clear the minefield without blowing up! (Max 2 players simultaneously.)',
    icon: '💣',
    minPlayers: 2,
    maxPlayers: 2,
    color: '#f39c12',
  },
  {
    id: 'wordguess',
    slug: 'wordguess',
    name: 'Word Guess',
    description: 'Guess the hidden word letter by letter. Classic hangman-style multiplayer fun. (Max 2 players simultaneously.)',
    icon: '🔤',
    minPlayers: 2,
    maxPlayers: 2,
    color: '#e74c3c',
  },
  {
    id: 'rockpaperscissors',
    slug: 'rockpaperscissors',
    name: 'Rock Paper Scissors',
    description: 'Fast-paced best-of-5 rounds. Read your opponent and claim victory! (Max 2 players simultaneously.)',
    icon: '[SCISSORS]',
    minPlayers: 2,
    maxPlayers: 2,
    color: '#e67e22',
  },
  {
    id: 'trivia',
    slug: 'trivia',
    name: 'Trivia Blitz',
    description: 'Test your knowledge! Answer questions faster than your opponents to score big. (Max 2 players simultaneously.)',
    icon: '?',
    minPlayers: 2,
    maxPlayers: 2,
    color: '#d35400',
  },
];
