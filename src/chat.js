// src/chat.js
// Community Chat - global realtime chat via RedJGames Supabase
// Fixed: guests can now chat, user_id is null for guests (FK allows it)

import { rjClient } from './supabase.js';
import { getUserId, getDisplayName, isAuthenticated, isGuest } from './auth.js';
import { showToast } from './ui/toast.js';
import { escapeHtml } from './utils.js';

let chatChannel = null;
let chatMessages = [];
let onMessageCallback = null;
let unreadCount = 0;
let onUnreadUpdate = null;
let pollInterval = null;

// ─── Anti-Spam State ───
let lastChatTime = 0;
let spamWarningCount = 0;
let chatTimeoutUntil = 0;

// ─── Load existing messages ───
export async function loadChatMessages(limit = 60) {
    const { data, error } = await rjClient
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.warn('Chat load error:', error.message);
        return chatMessages; // Return existing cache on error
    }

    // Check if new messages arrived
    const oldTopId = chatMessages.length ? chatMessages[chatMessages.length - 1].id : null;
    chatMessages = (data || []).reverse();
    const newTopId = chatMessages.length ? chatMessages[chatMessages.length - 1].id : null;

    // Only invoke callback and unread bump if polling found a genuinely new message
    if (oldTopId !== newTopId && onMessageCallback) {
        onMessageCallback(chatMessages[chatMessages.length - 1], chatMessages);

        // Note: we don't blindly bump unreadCount on every poll load to avoid spamming the badge,
        // we only bump if we're not actively looking at chat. Realtime handles exact bumps.
        // But if real-time failed and poll caught it, we should bump once.
        if (oldTopId && newTopId && oldTopId !== newTopId) {
            unreadCount++;
            if (onUnreadUpdate) onUnreadUpdate(unreadCount);
        }
    }

    return chatMessages;
}

// ─── Send a message ───
// Authenticated users: use their real user_id
// Guests: user_id = null (FK allows null, no auth.uid() check needed if RLS uses WITH CHECK (true))
export async function sendChatMessage(text) {
    const trimmed = text?.trim();
    if (!trimmed || trimmed.length > 500) return;

    // ─── Anti-Spam Check ───
    const now = Date.now();
    if (now < chatTimeoutUntil) {
        const remainingMinutes = Math.ceil((chatTimeoutUntil - now) / 60000);
        showToast(`You are timed out for spamming. Try again in ${remainingMinutes} minute(s).`, 'error');
        return;
    }

    if (now - lastChatTime < 2000) {
        spamWarningCount++;
        if (spamWarningCount >= 3) {
            chatTimeoutUntil = now + (3 * 60 * 1000); // 3 minutes timeout
            showToast('You have been timed out for 3 minutes due to spamming.', 'error');
            spamWarningCount = 0;
        } else {
            showToast('Please wait 2 seconds between messages.', 'warning');
        }
        return;
    }

    // Reset warnings on successful delay
    spamWarningCount = 0;
    lastChatTime = now;

    // ─── Guests cannot send chat messages ───
    if (isGuest()) {
        showToast('Sign in to chat — guests can only read messages.', 'info');
        return;
    }

    if (!isAuthenticated()) {
        showToast('Please sign in to use the chat.', 'error');
        return;
    }

    const username = getDisplayName();
    const userId = getUserId();

    if (!username) {
        showToast('Could not determine username.', 'error');
        return;
    }

    const payload = {
        username: username,
        message: trimmed,
        // user_id is nullable — authenticated users get their UUID, guests get null
        ...(userId ? { user_id: userId } : {}),
    };

    const { error } = await rjClient
        .from('chat_messages')
        .insert(payload);

    if (error) {
        console.error('Chat send error:', error.message, error);
        // Show friendly error
        if (error.code === '42501' || error.message?.includes('policy')) {
            showToast('Chat is blocked. Please run the chat SQL fix in your RedJGames Supabase project.', 'error');
        } else {
            showToast('Could not send message: ' + error.message, 'error');
        }
        throw error;
    }
}

// ─── Delete a message ───
export async function deleteChatMessage(messageId) {
    const userId = getUserId();
    if (!userId || isGuest()) {
        showToast('Only registered users can delete messages.', 'error');
        return;
    }
    const { error } = await rjClient
        .from('chat_messages')
        .delete()
        .eq('id', messageId)
        .eq('user_id', userId);

    if (error) throw error;
}

// ─── Subscribe to real-time messages ───
export function subscribeChatRealtime(onMessage, onUnread) {
    onMessageCallback = onMessage;
    onUnreadUpdate = onUnread;

    chatChannel = rjClient
        .channel('global-chat')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'chat_messages' },
            (payload) => {
                chatMessages.push(payload.new);
                if (onMessageCallback) onMessageCallback(payload.new, chatMessages);
                unreadCount++;
                if (onUnreadUpdate) onUnreadUpdate(unreadCount);
            }
        )
        .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'chat_messages' },
            (payload) => {
                chatMessages = chatMessages.filter(m => m.id !== payload.old.id);
                if (onMessageCallback) onMessageCallback(null, chatMessages);
            }
        )
        .subscribe();

    // ─── 2 Second Silent Polling Backup ───
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(() => {
        loadChatMessages(60); // Silently re-fetches and updates array
    }, 2000);
}

export function unsubscribeChat() {
    if (chatChannel) {
        rjClient.removeChannel(chatChannel);
        chatChannel = null;
    }
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}

export function clearUnread() {
    unreadCount = 0;
    if (onUnreadUpdate) onUnreadUpdate(0);
}

export function getChatMessages() { return chatMessages; }
