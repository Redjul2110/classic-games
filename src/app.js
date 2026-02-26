// src/app.js
// Main Application Router – SPA with sidebar, AI game routing, chat drawer

import { initAuth, onAuthChange, isAuthenticated, isGuest, signOut } from './auth.js';
import { renderLoginPage } from './pages/login.js';
import { renderHubPage } from './pages/hub.js';
import { renderMatchmakingPage } from './pages/matchmaking.js';
import { renderLobbyPage } from './pages/lobby.js';
import { renderProfilePage } from './pages/profile.js';
import { renderSettingsPage } from './pages/settings.js';
import { renderPartyPage } from './pages/party.js';
import { renderChatPage, initChatDrawer } from './pages/chat.js';
import { renderGamePage } from './pages/game.js';
import { unsubscribeChat } from './chat.js';
import { showToast } from './ui/toast.js';
import { initSidebar, destroySidebar } from './ui/sidebar.js';
import { ogClient } from './supabase.js';
import { initTheme } from './theme.js';

// Apply custom CSS variable themes immediately
initTheme();

// ─── Page Elements ───
const pages = {
    login: document.getElementById('page-login'),
    hub: document.getElementById('page-hub'),
    matchmaking: document.getElementById('page-matchmaking'),
    lobby: document.getElementById('page-lobby'),
    profile: document.getElementById('page-profile'),
    settings: document.getElementById('page-settings'),
    party: document.getElementById('page-party'),
    chat: document.getElementById('page-chat'),
    game: document.getElementById('page-game'),
};
const loadingScreen = document.getElementById('loading-screen');

// ─── App State ───
let activePage = null;
let selectedGame = null;
let currentLobbyData = null;
let isHostCurrentLobby = false;
let previousPage = 'hub';
let aiGame = null;
let sidebarReady = false;

// ─── Show/Hide Pages ───
function showPage(pageName) {
    Object.entries(pages).forEach(([name, el]) => {
        if (!el) return;
        if (name === pageName) el.classList.remove('hidden');
        else el.classList.add('hidden');
    });
    activePage = pageName;
    window.scrollTo(0, 0);

    // Call Lucide to convert <i data-lucide="..."> tags into SVGs
    if (window.lucide) {
        setTimeout(() => lucide.createIcons(), 10);
    }
}

// ─── Nav callbacks ───
function getNavCallbacks() {
    return {
        onProfileClick: () => navigateTo('profile'),
        onChatClick: () => navigateTo('chat'),
        onSignOut: async () => { await signOut(); showToast('Signed out.', 'info'); },
    };
}

// ─── Navigate ───
function navigateTo(page, opts = {}) {
    if (page === activePage && page !== 'game') return;
    const nav = getNavCallbacks();

    switch (page) {
        case 'login':
            renderLoginPage(pages.login);
            showPage('login');
            break;

        case 'hub':
            renderHubPage(
                pages.hub,
                (game) => { selectedGame = game; navigateTo('matchmaking'); }, // Multiplayer
                (game) => {
                    aiGame = game;
                    currentLobbyData = null;
                    isHostCurrentLobby = false;
                    navigateTo('game');
                }, // VS AI
                nav.onProfileClick,
                nav.onChatClick
            );
            showPage('hub');
            break;

        case 'matchmaking':
            if (!selectedGame) { navigateTo('hub'); return; }
            renderMatchmakingPage(pages.matchmaking, selectedGame, {
                onBack: () => navigateTo('hub'),
                onLobbyJoined: (lobby, game, isHost) => {
                    currentLobbyData = lobby;
                    isHostCurrentLobby = isHost;
                    selectedGame = game;
                    navigateTo('lobby');
                },
                ...nav,
            });
            showPage('matchmaking');
            break;

        case 'lobby':
            if (!currentLobbyData || !selectedGame) { navigateTo('hub'); return; }
            renderLobbyPage(pages.lobby, currentLobbyData, selectedGame, isHostCurrentLobby, {
                onBack: () => { currentLobbyData = null; navigateTo('matchmaking'); },
                onGameStart: async (lobby, game) => {
                    // Mark lobby as 'playing' so all clients know game started (not cancelled)
                    try {
                        await ogClient.from('game_sessions').update({ status: 'playing' }).eq('id', lobby.id);
                    } catch (e) { console.warn('Could not update lobby status:', e); }
                    showToast(`Starting ${game.name}! [GAME]`, 'success');
                    // Route to game screen with multiplayer data
                    aiGame = game;
                    navigateTo('game');
                },
                ...nav,
            });
            showPage('lobby');
            break;

        case 'profile':
            previousPage = activePage || 'hub';
            renderProfilePage(pages.profile, {
                onBack: () => navigateTo(previousPage === 'profile' ? 'hub' : previousPage),
                onDeleted: () => navigateTo('login'),
                onChatClick: nav.onChatClick,
                onSignOut: nav.onSignOut,
            });
            showPage('profile');
            break;

        case 'settings':
            previousPage = activePage || 'hub';
            renderSettingsPage(pages.settings, {
                onBack: () => navigateTo(previousPage === 'settings' ? 'hub' : previousPage),
            });
            showPage('settings');
            break;

        case 'party':
            previousPage = activePage || 'hub';
            renderPartyPage(pages.party, {
                onBack: () => navigateTo('hub'),
                onPlayChess: () => {
                    aiGame = { id: 'party_chess', name: 'Party Chess', supportsMp: true };
                    navigateTo('game');
                },
                onPlayTrivia: () => {
                    aiGame = { id: 'party_trivia', name: 'Party Trivia', supportsMp: true };
                    navigateTo('game');
                },
                onPlayNeonCards: () => {
                    aiGame = { id: 'party_neoncards', name: 'Party Neon Cards', supportsMp: true };
                    navigateTo('game');
                },
                onPlayDraw: () => {
                    aiGame = { id: 'party_draw', name: 'Party Draw', supportsMp: true };
                    navigateTo('game');
                }
            });
            showPage('party');
            break;

        case 'chat':
            previousPage = activePage || 'hub';
            renderChatPage(pages.chat, {
                onBack: () => navigateTo(previousPage === 'chat' ? 'hub' : previousPage),
                ...nav,
            });
            showPage('chat');
            break;

        case 'game':
            if (!aiGame) { navigateTo('hub'); return; }
            const mpObj = currentLobbyData ? { lobby: currentLobbyData, isHost: isHostCurrentLobby } : null;
            renderGamePage(pages.game, aiGame, mpObj, () => {
                const isPartyGame = aiGame && aiGame.id.startsWith('party_');
                aiGame = null;
                currentLobbyData = null;
                navigateTo(isPartyGame ? 'party' : 'hub');
            });
            showPage('game');
            break;

        default:
            navigateTo('hub');
    }
}

// ─── Boot ───
async function boot() {
    try { await initAuth(); } catch (e) { console.error('Auth init failed:', e); }

    // Fade out loading screen
    setTimeout(() => {
        if (loadingScreen) {
            loadingScreen.classList.add('fade-out');
            setTimeout(() => { loadingScreen.style.display = 'none'; }, 600);
        }
    }, 800);

    // Ghost lobby cleanup on boot via secure RPC
    try {
        const { data: deletedCount, error } = await ogClient.rpc('cleanup_all_dead_lobbies');
        if (error) {
            console.warn('Ghost lobby cleanup RPC failed:', error.message);
        } else if (deletedCount > 0) {
            console.log(`[Cleanup] Deleted ${deletedCount} ghost lobbies.`);
            showToast(`${deletedCount} ghost lobby(s) wurden entfernt`, 'info');
        }
    } catch (e) {
        console.warn('Ghost lobby cleanup failed:', e.message);
    }

    function goToInitialPage() {
        if (isAuthenticated() || isGuest()) {
            navigateTo('hub');
            // Initialize sidebar & chat drawer
            if (!sidebarReady) {
                sidebarReady = true;
                setTimeout(() => {
                    initSidebar(navigateTo, async () => {
                        await signOut();
                        showToast('Signed out.', 'info');
                    });
                    initChatDrawer();
                }, 300);
            }
        } else {
            navigateTo('login');
        }
    }

    goToInitialPage();

    onAuthChange(() => {
        if (isAuthenticated() || isGuest()) {
            if (activePage === 'login') {
                navigateTo('hub');
                if (!sidebarReady) {
                    sidebarReady = true;
                    setTimeout(() => {
                        initSidebar(navigateTo, async () => { await signOut(); showToast('Signed out.', 'info'); });
                        initChatDrawer();
                    }, 300);
                }
            }
        } else {
            unsubscribeChat();
            destroySidebar();
            sidebarReady = false;
            navigateTo('login');
            const fab = document.getElementById('chat-fab');
            const drawer = document.getElementById('chat-drawer');
            if (fab) fab.remove();
            if (drawer) drawer.remove();
        }
    });

    window.addEventListener('popstate', () => {
        if (activePage !== 'hub' && activePage !== 'login') navigateTo('hub');
    });
}

boot();
