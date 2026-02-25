// src/utils.js
// Shared utility functions for RedJGames Classic

/**
 * Escapes HTML characters to prevent Cross-Site Scripting (XSS) attacks.
 * Use this whenever rendering untrusted user input (like usernames) via innerHTML.
 * @param {string} str - The string to escape.
 * @returns {string} - The escaped safe HTML string.
 */
export function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
