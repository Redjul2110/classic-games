// src/pages/profile.js
// Profile Management Page

import { currentProfile, currentUser, guestSession, updateProfile, deleteAccount, signOut, getDisplayName, getAvatarInitial, isGuest, isAuthenticated } from '../auth.js';
import { renderNavbar } from '../ui/navbar.js';
import { showToast } from '../ui/toast.js';

export function renderProfilePage(container, { onBack, onDeleted, onChatClick, onSignOut }) {
    const guest = isGuest();
    const authed = isAuthenticated();
    const name = getDisplayName();
    const initial = getAvatarInitial();

    container.innerHTML = `
    <div class="profile-page">
      <div id="profile-navbar"></div>
      <div class="profile-content">
        <button class="btn btn-ghost btn-sm mb-2" id="profile-back-btn">← Back to Games</button>
        <h1 style="font-size:1.8rem; font-weight:800; margin-bottom:24px;">Your Profile</h1>

        ${guest ? `
        <div class="profile-card">
          <div class="profile-avatar-section">
            <div class="profile-avatar">${initial}</div>
            <div class="profile-info-text">
              <h3>${name}</h3>
              <p>👤 Guest Account</p>
              <p style="margin-top:4px; color:var(--orange-primary); font-size:0.82rem;">
                [!] Guest sessions reset daily. Create an account to save progress.
              </p>
            </div>
          </div>
          <div class="badge badge-guest">Guest</div>
          <div style="margin-top:20px;">
            <p style="color:var(--text-secondary); font-size:0.9rem; line-height:1.6;">
              As a guest, your session is temporary and resets every day.
              To save your stats and access all features, create a free account.
            </p>
          </div>
        </div>
        ` : `
        <div class="profile-card">
          <div class="profile-avatar-section">
            <div class="profile-avatar">${initial}</div>
            <div class="profile-info-text">
              <h3 id="display-name">${name}</h3>
              <p>${currentUser?.email || ''}</p>
            </div>
          </div>

          <form class="profile-form" id="profile-form">
            <div class="form-group">
              <label class="form-label" for="profile-username">Username</label>
              <input id="profile-username" class="input-field" type="text"
                value="${currentProfile?.username || ''}"
                placeholder="Enter username" minlength="3" maxlength="30" />
            </div>
            <div class="form-group">
              <label class="form-label" for="profile-avatar">Avatar URL (optional)</label>
              <input id="profile-avatar" class="input-field" type="url"
                value="${currentProfile?.avatar_url || ''}"
                placeholder="https://example.com/avatar.png" />
            </div>
            <div id="profile-error" class="error-message hidden"></div>
            <button type="submit" class="btn btn-primary" id="save-profile-btn">Save Changes</button>
          </form>
        </div>

        <div class="danger-zone">
          <h4>[!] Danger Zone</h4>
          <p>Permanently delete your account and all associated data. This action cannot be undone.</p>
          <button class="btn btn-danger" id="delete-account-btn">Delete My Account</button>
        </div>
        `}

        <div class="card mt-2" style="text-align:center;">
          <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:12px;">
            Session info: ${guest ? 'Guest (resets daily)' : 'Authenticated user'}
          </p>
          <button class="btn btn-ghost btn-sm" id="profile-signout-btn">Sign Out / Switch Account</button>
        </div>
      </div>
    </div>
  `;

    renderNavbar(container.querySelector('#profile-navbar'), {
        onProfileClick: () => { },
        onChatClick,
        onSignOut,
    });

    container.querySelector('#profile-back-btn').addEventListener('click', onBack);
    container.querySelector('#profile-signout-btn').addEventListener('click', async () => {
        await signOut();
        showToast('Signed out.', 'info');
        onSignOut();
    });

    if (authed) {
        // Save profile
        container.querySelector('#profile-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorEl = container.querySelector('#profile-error');
            errorEl.classList.add('hidden');

            const username = container.querySelector('#profile-username').value.trim();
            const avatar_url = container.querySelector('#profile-avatar').value.trim();
            const btn = container.querySelector('#save-profile-btn');

            if (username.length < 3) {
                errorEl.textContent = 'Username must be at least 3 characters.';
                errorEl.classList.remove('hidden');
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Saving…';
            try {
                await updateProfile({ username, avatar_url: avatar_url || null });
                showToast('Profile updated!', 'success');
                container.querySelector('#display-name').textContent = username;
            } catch (err) {
                errorEl.textContent = err.message;
                errorEl.classList.remove('hidden');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Save Changes';
            }
        });

        // Delete account
        container.querySelector('#delete-account-btn').addEventListener('click', () => {
            const confirmed = window.confirm(
                'Are you sure you want to permanently delete your account? This cannot be undone.'
            );
            if (!confirmed) return;

            deleteAccount()
                .then(() => {
                    showToast('Account deleted.', 'info');
                    onDeleted();
                })
                .catch(err => showToast('Delete failed: ' + err.message, 'error'));
        });
    }
}
