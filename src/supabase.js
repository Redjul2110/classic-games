// src/supabase.js
// Supabase client initialization for both projects

import { REDJGAMES_CONFIG, ONLINE_GAMES_CONFIG } from './config.js';

const { createClient } = window.supabase;

// RedJGames Supabase Client (Auth, Profiles, Chat, Friends)
export const rjClient = createClient(
    REDJGAMES_CONFIG.url,
    REDJGAMES_CONFIG.anonKey
);

// OnlineGames Supabase Client (Game Sessions, Lobbies, Matchmaking)
export const ogClient = createClient(
    ONLINE_GAMES_CONFIG.url,
    ONLINE_GAMES_CONFIG.anonKey
);

export default rjClient;
