// src/lobby.js
// Lobby system: create, join, leave, heartbeat via OnlineGames Supabase
// Tries RPC first, falls back to direct insert, gracefully degrades on missing columns

import { ogClient } from './supabase.js';
import { getUserId, getDisplayName } from './auth.js';
import { APP_CONFIG } from './config.js';

let heartbeatTimer = null;
let currentLobbyId = null;
let realtimeChannel = null;

function buildPlayerInfo() {
    return {
        id: getUserId(),
        name: getDisplayName(),
        is_guest: !window.__authUser,
    };
}

function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─── Create Lobby ───
export async function createLobby(gameType, maxPlayers, isPublic) {
    const info = buildPlayerInfo();

    // 1. Try RPC
    try {
        const { data, error } = await ogClient.rpc('create_lobby', {
            p_game_type: gameType,
            p_host_info: info,
            p_is_public: isPublic,
            p_max_players: 2, // Hard limit to 2 players 
        });
        if (!error && data?.id) {
            currentLobbyId = data.id;
            startHeartbeat(data.id);
            return data;
        }
    } catch (_) { }

    // 2. Fallback: direct table insert with all optional columns
    const code = isPublic ? null : generateCode();
    const payload = {
        game_type: gameType,
        host_id: info.id,
        status: 'waiting',
        is_public: isPublic,
        max_players: 2, // Hard limit to 2 players
        players: [info],
        last_heartbeat: new Date().toISOString(),
    };
    if (code) payload.lobby_code = code;

    let { data, error } = await ogClient.from('game_sessions').insert(payload).select().single();

    // 3. If columns missing, retry with minimal columns only
    if (error) {
        console.warn('Full insert failed, trying minimal:', error.message);
        const minPayload = {
            game_type: gameType,
            host_id: info.id,
            status: 'waiting',
        };
        const res = await ogClient.from('game_sessions').insert(minPayload).select().single();
        if (res.error) throw new Error('Could not create lobby. Please run sql/OnlineGames/00_COMPLETE_SETUP.sql in your OnlineGames Supabase project.');
        data = res.data;
    }

    currentLobbyId = data.id;
    startHeartbeat(data.id);
    return data;
}

// ─── Join Random Public Lobby ───
export async function joinPublicLobby(gameType) {
    const info = buildPlayerInfo();

    // 1. Try RPC
    try {
        const { data, error } = await ogClient.rpc('join_public_lobby', {
            p_game_type: gameType,
            p_client_info: info,
        });
        if (!error) {
            if (data?.id) currentLobbyId = data.id;
            return data;
        }
    } catch (_) { }

    // 2. Fallback: direct query
    const cutoff = new Date(Date.now() - 30000).toISOString();
    try {
        await ogClient.from('game_sessions').delete().eq('status', 'waiting').lt('last_heartbeat', cutoff);
    } catch (_) { }

    const { data: lobbies } = await ogClient
        .from('game_sessions')
        .select('*')
        .eq('game_type', gameType)
        .eq('status', 'waiting')
        .neq('host_id', info.id)
        .order('created_at', { ascending: true })
        .limit(10);

    // Only look at public ones
    const lobby = (lobbies || [])
        .filter(l => l.is_public !== false)
        .find(l => {
            const count = Array.isArray(l.players) ? l.players.length : 0;
            const max = 2; // Strict limit
            return count < max;
        });

    if (!lobby) return null;

    const updatedPlayers = [...(Array.isArray(lobby.players) ? lobby.players : []), info];
    try {
        const { data, error } = await ogClient
            .from('game_sessions')
            .update({ players: updatedPlayers })
            .eq('id', lobby.id)
            .select()
            .single();
        if (!error && data) { currentLobbyId = data.id; return data; }
    } catch (_) { }
    return null;
}

// ─── Join Private Lobby by Code ───
export async function joinPrivateLobby(lobbyCode) {
    const info = buildPlayerInfo();
    const code = lobbyCode.toUpperCase().trim();

    // 1. Try RPC
    try {
        const { data, error } = await ogClient.rpc('join_private_lobby', {
            p_lobby_code: code,
            p_client_info: info,
        });
        if (!error && data?.id) {
            currentLobbyId = data.id;
            return data;
        }
    } catch (_) { }

    // 2. Fallback: direct query
    const { data: lobby, error: findErr } = await ogClient
        .from('game_sessions')
        .select('*')
        .eq('lobby_code', code)
        .eq('status', 'waiting')
        .single();

    if (findErr || !lobby) throw new Error('Lobby not found or already started.');

    const players = Array.isArray(lobby.players) ? lobby.players : [];
    const max = 2; // Strict limit
    if (players.length >= max) throw new Error('Lobby is full.');

    const { data, error } = await ogClient
        .from('game_sessions')
        .update({ players: [...players, info] })
        .eq('id', lobby.id)
        .select()
        .single();

    if (error) throw new Error(error.message);
    currentLobbyId = data.id;
    return data;
}

// ─── Leave Lobby ───
export async function leaveLobby(lobbyId) {
    stopHeartbeat();
    stopRealtimeSubscription();
    const userId = getUserId();

    try { await ogClient.rpc('leave_lobby', { p_lobby_id: lobbyId, p_user_id: userId }); currentLobbyId = null; return; } catch (_) { }

    try {
        const { data: lobby } = await ogClient.from('game_sessions').select('*').eq('id', lobbyId).single();
        if (!lobby) { currentLobbyId = null; return; }
        if (lobby.host_id === userId) {
            await ogClient.from('game_sessions').delete().eq('id', lobbyId);
        } else {
            const players = (Array.isArray(lobby.players) ? lobby.players : []).filter(p => p.id !== userId);
            await ogClient.from('game_sessions').update({ players }).eq('id', lobbyId);
        }
    } catch (_) { }
    currentLobbyId = null;
}

// ─── Heartbeat ───
function startHeartbeat(lobbyId) {
    stopHeartbeat();
    heartbeatTimer = setInterval(async () => {
        try {
            await ogClient.rpc('update_heartbeat', { lobby_id: lobbyId });
        } catch {
            try {
                await ogClient.from('game_sessions').update({ last_heartbeat: new Date().toISOString() }).eq('id', lobbyId);
            } catch (_) { }
        }
    }, APP_CONFIG.heartbeatIntervalMs);
}

function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

export function subscribeLobby(lobbyId, onUpdate) {
    stopRealtimeSubscription();
    realtimeChannel = ogClient
        .channel(`lobby:${lobbyId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${lobbyId}` },
            (payload) => {
                if (payload.eventType === 'DELETE') onUpdate({ deleted: true });
                else onUpdate(payload.new);
            })
        .subscribe();
}

export function stopRealtimeSubscription() {
    if (realtimeChannel) { ogClient.removeChannel(realtimeChannel); realtimeChannel = null; }
}

export async function getLobby(lobbyId) {
    const { data } = await ogClient.from('game_sessions').select('*').eq('id', lobbyId).single();
    return data;
}
