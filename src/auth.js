// src/auth.js
// Authentication helpers: sign in, sign up, guest mode, session management

import { rjClient } from './supabase.js';
import { APP_CONFIG } from './config.js';
import { showToast } from './ui/toast.js';

// ─────────────────────────────────────────────
// Session State (exported for use across the app)
// ─────────────────────────────────────────────
export let currentUser = null;   // Supabase auth user or null
export let currentProfile = null; // profiles table row
export let guestSession = null;  // { id, username, is_guest: true }
export let hasAiAccess = false;  // UI toggle for 💡 button

// Listeners that get called when auth state changes
const authListeners = [];
export function onAuthChange(fn) { authListeners.push(fn); }
function notifyAuth() { authListeners.forEach(fn => fn()); }

// ─────────────────────────────────────────────
// Bootstrap: restore session on page load
// ─────────────────────────────────────────────
export async function initAuth() {
    // Check for existing Supabase session
    const { data } = await rjClient.auth.getSession();
    if (data?.session) {
        currentUser = data.session.user;
        await loadProfile(currentUser.id);
        notifyAuth();
        return;
    }

    // Check for guest session stored in localStorage
    const savedGuest = localStorage.getItem('rjg_guest');
    if (savedGuest) {
        try {
            const parsed = JSON.parse(savedGuest);
            // Validate guest hasn't expired (daily reset)
            const savedDate = new Date(parsed.created_at);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (savedDate >= today) {
                guestSession = parsed;
                notifyAuth();
                return;
            } else {
                // Guest session expired
                localStorage.removeItem('rjg_guest');
            }
        } catch (e) {
            localStorage.removeItem('rjg_guest');
        }
    }

    // Listen for auth state changes (e.g., OAuth redirect)
    rjClient.auth.onAuthStateChange(async (_event, session) => {
        if (session) {
            currentUser = session.user;
            await loadProfile(currentUser.id);
            await checkAiAccess();
        } else {
            currentUser = null;
            currentProfile = null;
            hasAiAccess = false;
        }
        notifyAuth();
    });
}

// ─────────────────────────────────────────────
// Load profile from database
// ─────────────────────────────────────────────
export async function loadProfile(userId) {
    const { data, error } = await rjClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (!error && data) {
        currentProfile = data;
    }
}

// ─────────────────────────────────────────────
// Sign Up with email
// ─────────────────────────────────────────────
export async function signUp(email, password, username) {
    const { data, error } = await rjClient.auth.signUp({
        email,
        password,
        options: {
            data: { username },
        },
    });

    if (error) throw error;

    // Profile is created by the database trigger (handle_new_user)
    if (data.user) {
        currentUser = data.user;
        await loadProfile(currentUser.id);
        await checkAiAccess();
        notifyAuth();
    }
    return data;
}

// ─────────────────────────────────────────────
// Sign In with email
// ─────────────────────────────────────────────
export async function signIn(email, password) {
    const { data, error } = await rjClient.auth.signInWithPassword({ email, password });
    if (error) throw error;

    currentUser = data.user;
    await loadProfile(currentUser.id);
    await checkAiAccess();
    notifyAuth();
    return data;
}

// ─────────────────────────────────────────────
// Sign Out
// ─────────────────────────────────────────────
export async function signOut() {
    await rjClient.auth.signOut();
    currentUser = null;
    currentProfile = null;
    guestSession = null;
    hasAiAccess = false;
    localStorage.removeItem('rjg_guest');
    notifyAuth();
}

// ─────────────────────────────────────────────
// Continue as Guest
// ─────────────────────────────────────────────
export function createGuestSession() {
    const guestId = 'guest_' + Math.random().toString(36).slice(2, 10).toUpperCase();
    const guestNum = Math.floor(Math.random() * 9000) + 1000;
    guestSession = {
        id: guestId,
        username: `Guest#${guestNum}`,
        is_guest: true,
        created_at: new Date().toISOString(),
    };
    localStorage.setItem('rjg_guest', JSON.stringify(guestSession));
    hasAiAccess = false; // Guests never have AI access
    notifyAuth();
    return guestSession;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
export function isAuthenticated() { return !!currentUser; }
export function isGuest() { return !!guestSession && !currentUser; }

export async function checkAiAccess() {
    if (!currentUser || !currentUser.email) {
        hasAiAccess = false;
        return false;
    }
    try {
        const { data, error } = await rjClient.from('ai_whitelist').select('email').eq('email', currentUser.email).single();
        hasAiAccess = !!data && !error;
    } catch (e) {
        hasAiAccess = false;
    }
    return hasAiAccess;
}

export function getDisplayName() {
    if (currentProfile?.username) return currentProfile.username;
    if (currentUser?.user_metadata?.username) return currentUser.user_metadata.username;
    if (currentUser?.email) return currentUser.email.split('@')[0];
    if (guestSession) return guestSession.username;
    return 'Player';
}

export function getUserId() {
    if (currentUser) return currentUser.id;
    if (guestSession) return guestSession.id;
    return null;
}

export function getAvatarInitial() {
    return getDisplayName().charAt(0).toUpperCase();
}

// ─────────────────────────────────────────────
// Profile Update
// ─────────────────────────────────────────────
export async function updateProfile(updates) {
    if (!currentUser) throw new Error('Not authenticated');

    const { data, error } = await rjClient
        .from('profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', currentUser.id)
        .select()
        .single();

    if (error) throw error;
    currentProfile = data;
    notifyAuth();
    return data;
}

// ─────────────────────────────────────────────
// Delete Account
// ─────────────────────────────────────────────
export async function deleteAccount() {
    if (!currentUser) throw new Error('Not authenticated');

    // Call delete_account RPC defined in 07_delete_account_rpc.sql
    const { error } = await rjClient.rpc('delete_account');
    if (error) throw error;

    currentUser = null;
    currentProfile = null;
    notifyAuth();
}
