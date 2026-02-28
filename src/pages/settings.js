// src/pages/settings.js
// UI for the Color Customization feature

import { UI_ICONS } from '../ui/icons.js';
import { getCurrentTheme, applyTheme, saveTheme, resetTheme, THEME_LABELS, DEFAULT_THEME } from '../theme.js';
import { showToast } from '../ui/toast.js';

export function renderSettingsPage(container, { onBack }) {
    let currentSettings = getCurrentTheme();

    container.innerHTML = `
        <div class="lobby-header" style="position: sticky; top: 0; z-index: 50; background: var(--bg-primary); padding-bottom: 10px;">
            <button class="btn btn-ghost" id="settings-back" style="padding: 10px;">
                ${UI_ICONS.back} 
            </button>
            <h2 style="font-size: 1.5rem; display: flex; align-items: center; gap: 8px;">
                ${UI_ICONS.settings} Theme Settings
            </h2>
            <div style="width: 44px;"></div>
        </div>

        <div style="max-width: 600px; margin: 0 auto; padding: 24px;">

            <!-- Language Section -->
            <div class="auth-card" style="margin-bottom: 24px;">
                <h3 style="margin-bottom: 8px; font-size: 1.2rem; color: var(--red-primary);">🌐 Language</h3>
                <p style="color: var(--text-secondary); margin-bottom: 16px; font-size: 0.9rem;">
                    Choose your language. The site will be translated automatically.
                </p>
                <div id="lang-picker" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;"></div>
            </div>

            <div class="auth-card" style="margin-bottom: 24px;">
                <h3 style="margin-bottom: 16px; font-size: 1.2rem; color: var(--red-primary);">Customize Colors</h3>
                <p style="color: var(--text-secondary); margin-bottom: 24px; font-size: 0.9rem;">
                    Personalize your RedJGames experience. Changes will be saved to your browser and applied instantly.
                </p>

                <div style="display: flex; flex-direction: column; gap: 16px;" id="color-list">
                    ${Object.keys(DEFAULT_THEME).map(key => `
                        <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-secondary); padding: 12px 16px; border-radius: 8px;">
                            <label for="${key}" style="font-weight: 500;">${THEME_LABELS[key]}</label>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <div style="font-family: monospace; font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase;" id="hex-${key}">${currentSettings[key]}</div>
                                <input type="color" id="${key}" value="${currentSettings[key]}" 
                                    style="width: 36px; height: 36px; padding: 0; border: none; border-radius: 4px; cursor: pointer; background: none;">
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div style="display: flex; gap: 12px; margin-top: 32px;">
                    <button class="btn btn-primary" id="save-settings" style="flex: 1;">Save Theme</button>
                    <button class="btn btn-ghost" id="reset-settings" style="flex: 1; border: 1px solid var(--border-subtle);">Restore Defaults</button>
                </div>
            </div>
        </div>
    `;

    // ── Custom Language Picker ────────────────────────────────────────────
    const LANGUAGES = [
        { code: 'en', flag: '🇬🇧', label: 'English' },
        { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
        { code: 'fr', flag: '🇫🇷', label: 'Français' },
        { code: 'es', flag: '🇪🇸', label: 'Español' },
        { code: 'it', flag: '🇮🇹', label: 'Italiano' },
        { code: 'pt', flag: '🇵🇹', label: 'Português' },
        { code: 'nl', flag: '🇳🇱', label: 'Nederlands' },
        { code: 'pl', flag: '🇵🇱', label: 'Polski' },
        { code: 'ru', flag: '🇷🇺', label: 'Русский' },
        { code: 'tr', flag: '🇹🇷', label: 'Türkçe' },
        { code: 'zh-CN', flag: '🇨🇳', label: '中文' },
        { code: 'ja', flag: '🇯🇵', label: '日本語' },
        { code: 'ko', flag: '🇰🇷', label: '한국어' },
        { code: 'ar', flag: '🇸🇦', label: 'العربية' },
    ];

    const savedLang = localStorage.getItem('rjg_lang') || 'en';
    const picker = container.querySelector('#lang-picker');

    // Whitelist of allowed lang codes — validated before any cookie/localStorage write
    const VALID_LANG_CODES = new Set(LANGUAGES.map(l => l.code));

    function setLanguage(code) {
        // Security: reject any code not in our fixed whitelist
        if (!VALID_LANG_CODES.has(code)) return;

        localStorage.setItem('rjg_lang', code);
        // Render updated buttons
        renderLangButtons(code);
        // Trigger Google Translate via the hidden widget select
        const gtSelect = document.querySelector('#google_translate_element select');
        if (gtSelect) {
            gtSelect.value = code;
            gtSelect.dispatchEvent(new Event('change'));
        } else {
            // Fallback: set cookie and reload (Google Translate reads googtrans cookie)
            if (code === 'en') {
                document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
                document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}`;
            } else {
                document.cookie = `googtrans=/en/${code}; path=/`;
                document.cookie = `googtrans=/en/${code}; path=/; domain=${window.location.hostname}`;
            }
            window.location.reload();
        }
    }

    function renderLangButtons(activeLang) {
        picker.innerHTML = LANGUAGES.map(l => {
            const isActive = l.code === activeLang;
            return `<button data-lang="${l.code}" style="
                display:flex;flex-direction:column;align-items:center;gap:4px;
                padding:10px 6px;border-radius:10px;cursor:pointer;border:2px solid ${isActive ? 'var(--primary-color)' : 'rgba(255,255,255,0.08)'};
                background:${isActive ? 'rgba(var(--primary-rgb,220,38,38),0.15)' : 'var(--bg-secondary)'};
                color:var(--text-primary);font-size:0.78rem;font-weight:${isActive ? '700' : '400'};
                transition:all 0.15s;min-height:60px;
            ">
                <span style="font-size:1.6rem;line-height:1;">${l.flag}</span>
                <span>${l.label}</span>
            </button>`;
        }).join('');

        picker.querySelectorAll('button[data-lang]').forEach(btn => {
            btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
        });
    }

    renderLangButtons(savedLang);

    // Event Listeners for Color Pickers (Live Preview)
    Object.keys(DEFAULT_THEME).forEach(key => {
        const input = container.querySelector(`[id="${key}"]`);
        const hexDisplay = container.querySelector(`[id="hex-${key}"]`);

        input.addEventListener('input', (e) => {
            const val = e.target.value;
            currentSettings[key] = val;
            hexDisplay.textContent = val;
            applyTheme(currentSettings); // Live preview
        });
    });

    container.querySelector('#save-settings').addEventListener('click', () => {
        saveTheme(currentSettings);
        showToast('Theme saved successfully! 🎨', 'success');
    });

    container.querySelector('#reset-settings').addEventListener('click', () => {
        if (confirm('Are you sure you want to restore the default colors?')) {
            resetTheme();
            currentSettings = { ...DEFAULT_THEME };

            // Update UI inputs
            Object.keys(DEFAULT_THEME).forEach(key => {
                const input = container.querySelector(`[id="${key}"]`);
                const hexDisplay = container.querySelector(`[id="hex-${key}"]`);
                input.value = currentSettings[key];
                hexDisplay.textContent = currentSettings[key];
            });
            showToast('Default theme restored.', 'info');
        }
    });

    container.querySelector('#settings-back').addEventListener('click', () => {
        // If not saved, should we revert live preview? Let's just keep the live preview, 
        // but if they didn't save, it will reset on refresh. This is common behavior.
        onBack();
    });
}
