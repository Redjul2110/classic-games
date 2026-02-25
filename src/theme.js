// src/theme.js
// Manager for app wide custom color themes stored in localStorage

// Definiert die anpassbaren CSS Variablen und deren Standardwerte laut main.css
export const DEFAULT_THEME = {
    '--bg-primary': '#09090b',
    '--bg-secondary': '#121214',
    '--red-primary': '#e11d48',
    '--red-light': '#fb7185',
    '--orange-primary': '#ea580c',
    '--orange-light': '#fb923c',
    '--text-primary': '#f8fafc',
    '--text-secondary': '#94a3b8'
};

export const THEME_LABELS = {
    '--bg-primary': 'Background Primary',
    '--bg-secondary': 'Background Secondary',
    '--red-primary': 'Red Accent (Primary)',
    '--red-light': 'Red Accent (Light)',
    '--orange-primary': 'Orange Accent (Primary)',
    '--orange-light': 'Orange Accent (Light)',
    '--text-primary': 'Text Primary',
    '--text-secondary': 'Text Secondary'
};

export function initTheme() {
    const saved = localStorage.getItem('rjgames_theme');
    if (saved) {
        try {
            const theme = JSON.parse(saved);
            applyTheme(theme);
        } catch (e) {
            console.error("Failed to parse saved theme", e);
        }
    }
}

export function applyTheme(theme) {
    for (const [key, val] of Object.entries(theme)) {
        document.documentElement.style.setProperty(key, val);
    }
}

export function saveTheme(theme) {
    localStorage.setItem('rjgames_theme', JSON.stringify(theme));
}

export function resetTheme() {
    localStorage.removeItem('rjgames_theme');
    for (const key of Object.keys(DEFAULT_THEME)) {
        document.documentElement.style.removeProperty(key);
    }
}

export function getCurrentTheme() {
    const saved = localStorage.getItem('rjgames_theme');
    if (saved) {
        try {
            return { ...DEFAULT_THEME, ...JSON.parse(saved) };
        } catch (e) { }
    }
    return { ...DEFAULT_THEME };
}
