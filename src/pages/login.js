// src/pages/login.js
// Login / Welcome Page

import { signIn, signUp, createGuestSession } from '../auth.js';
import { showToast } from '../ui/toast.js';

export function renderLoginPage(container) {
  container.innerHTML = `
    <div class="login-page">
      <div class="login-bg-grid"></div>
      <div class="login-container">
        <div class="login-header">
          <div class="login-logo">
            <div>
              <span class="logo-red">RedJ</span><span class="logo-orange">Games</span>
            </div>
            <div class="logo-sub">CLASSIC</div>
          </div>
          <p class="login-tagline">10 classic games. One platform. Play now.</p>
        </div>

        <div class="login-card">
          <button class="guest-btn guest-btn-primary" id="guest-btn">
            <span>Play As Guest</span>
          </button>
          
          <div class="divider">or create an account</div>

          <div class="auth-tabs">
            <div class="auth-tab active" id="tab-signin" role="button" tabindex="0">Sign In</div>
            <div class="auth-tab" id="tab-signup" role="button" tabindex="0">Create Account</div>
          </div>

          <!-- Sign In Form -->
          <form class="auth-form" id="form-signin">
            <div class="form-group">
              <label class="form-label" for="signin-email">Email</label>
              <input id="signin-email" class="input-field" type="email" placeholder="your@email.com" required autocomplete="email" />
            </div>
            <div class="form-group">
              <label class="form-label" for="signin-password">Password</label>
              <input id="signin-password" class="input-field" type="password" placeholder="••••••••" required autocomplete="current-password" />
            </div>
            <div id="signin-error" class="error-message hidden"></div>
            <button type="submit" class="btn btn-primary btn-lg w-full" id="signin-btn">
              Sign In
            </button>
          </form>

          <!-- Sign Up Form -->
          <form class="auth-form hidden" id="form-signup">
            <div class="form-group">
              <label class="form-label" for="signup-username">Username</label>
              <input id="signup-username" class="input-field" type="text" placeholder="CoolPlayer99" required minlength="3" maxlength="30" autocomplete="username" />
            </div>
            <div class="form-group">
              <label class="form-label" for="signup-email">Email</label>
              <input id="signup-email" class="input-field" type="email" placeholder="your@email.com" required autocomplete="email" />
            </div>
            <div class="form-group">
              <label class="form-label" for="signup-password">Password</label>
              <input id="signup-password" class="input-field" type="password" placeholder="Min. 6 characters" required minlength="6" autocomplete="new-password" />
            </div>
            <div id="signup-error" class="error-message hidden"></div>
            <button type="submit" class="btn btn-primary btn-lg w-full" id="signup-btn">
              Create Account
            </button>
          </form>
        </div>
      </div>
    </div>
  `;

  // Tab switching
  const tabSignIn = container.querySelector('#tab-signin');
  const tabSignUp = container.querySelector('#tab-signup');
  const formSignIn = container.querySelector('#form-signin');
  const formSignUp = container.querySelector('#form-signup');

  tabSignIn.addEventListener('click', () => {
    tabSignIn.classList.add('active');
    tabSignUp.classList.remove('active');
    formSignIn.classList.remove('hidden');
    formSignUp.classList.add('hidden');
  });

  tabSignUp.addEventListener('click', () => {
    tabSignUp.classList.add('active');
    tabSignIn.classList.remove('active');
    formSignUp.classList.remove('hidden');
    formSignIn.classList.add('hidden');
  });

  // Sign In
  formSignIn.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = container.querySelector('#signin-btn');
    const errorEl = container.querySelector('#signin-error');
    errorEl.classList.add('hidden');

    const email = container.querySelector('#signin-email').value.trim();
    const password = container.querySelector('#signin-password').value;

    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
      await signIn(email, password);
      // Auth state change will trigger router update
    } catch (err) {
      errorEl.textContent = err.message || 'Sign in failed. Please try again.';
      errorEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });

  // Sign Up
  formSignUp.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = container.querySelector('#signup-btn');
    const errorEl = container.querySelector('#signup-error');
    errorEl.classList.add('hidden');

    const username = container.querySelector('#signup-username').value.trim();
    const email = container.querySelector('#signup-email').value.trim();
    const password = container.querySelector('#signup-password').value;

    if (username.length < 3) {
      errorEl.textContent = 'Username must be at least 3 characters.';
      errorEl.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating account…';

    try {
      await signUp(email, password, username);
      showToast('Account created! Check your email for verification.', 'success');
    } catch (err) {
      errorEl.textContent = err.message || 'Sign up failed. Please try again.';
      errorEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  });

  // Guest
  container.querySelector('#guest-btn').addEventListener('click', () => {
    createGuestSession();
    showToast('Playing as Guest. Stats reset daily.', 'info');
    // Router will handle navigation via auth state change
  });
}
