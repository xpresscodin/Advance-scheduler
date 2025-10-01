const loginForm = document.getElementById('loginForm');
const loginStatus = document.getElementById('loginStatus');
const loginUsernameInput = document.getElementById('loginUsername');
const loginPasswordInput = document.getElementById('loginPassword');
const forgotPasswordLink = document.getElementById('forgotPasswordLink');
const resetForm = document.getElementById('resetForm');
const resetUsernameInput = document.getElementById('resetUsername');
const resetEmailInput = document.getElementById('resetEmail');

const params = new URLSearchParams(window.location.search);
const redirectTo = params.get('redirect') ? decodeURIComponent(params.get('redirect')) : '/';

function showStatus(message, type = 'info') {
  if (!loginStatus) return;
  loginStatus.textContent = message;
  loginStatus.className = 'status-message';
  if (type === 'success') {
    loginStatus.classList.add('success');
  } else if (type === 'error') {
    loginStatus.classList.add('error');
  }
  loginStatus.hidden = false;
}

function clearStatus() {
  if (!loginStatus) return;
  loginStatus.hidden = true;
  loginStatus.textContent = '';
  loginStatus.className = 'status-message';
}

function revealResetLink() {
  if (forgotPasswordLink) {
    forgotPasswordLink.hidden = false;
  }
}

function hideResetLink() {
  if (forgotPasswordLink) {
    forgotPasswordLink.hidden = true;
  }
  if (resetForm) {
    resetForm.hidden = true;
  }
}

async function handleLogin(event) {
  event.preventDefault();
  clearStatus();
  const username = loginUsernameInput.value.trim();
  const password = loginPasswordInput.value;
  if (!username || !password) {
    showStatus('Enter both your username and password.', 'error');
    return;
  }
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      showStatus(result.error || 'Invalid username or password.', 'error');
      if (typeof result.failedAttempts === 'number' && result.failedAttempts >= 5) {
        revealResetLink();
      }
      return;
    }
    window.location.href = redirectTo || '/';
  } catch (error) {
    console.error(error);
    showStatus('Unable to sign in right now. Please try again shortly.', 'error');
  }
}

async function handleReset(event) {
  event.preventDefault();
  clearStatus();
  const username = resetUsernameInput.value.trim();
  const email = resetEmailInput.value.trim();
  if (!username || !email) {
    showStatus('Provide both username and email to request a reset.', 'error');
    return;
  }
  try {
    const response = await fetch('/api/auth/request-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, email })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      showStatus(result.error || 'Unable to send reset instructions.', 'error');
      return;
    }
    let message = 'A temporary password was sent to your email.';
    if (result.temporaryPassword) {
      message += ` Temporary password: ${result.temporaryPassword}`;
    }
    showStatus(message, 'success');
    if (loginUsernameInput) {
      loginUsernameInput.value = username;
    }
    if (resetForm) {
      resetForm.hidden = true;
    }
    hideResetLink();
  } catch (error) {
    console.error(error);
    showStatus('Unable to send reset instructions.', 'error');
  }
}

function handleForgotClick() {
  if (resetForm) {
    resetForm.hidden = false;
  }
  if (forgotPasswordLink) {
    forgotPasswordLink.hidden = true;
  }
  if (resetUsernameInput && loginUsernameInput) {
    resetUsernameInput.value = loginUsernameInput.value.trim();
  }
  resetEmailInput?.focus();
}

async function checkExistingSession() {
  try {
    const response = await fetch('/api/auth/session', { credentials: 'include' });
    if (response.ok) {
      window.location.href = redirectTo || '/';
    }
  } catch (error) {
    // Ignore network errors here; the form will remain available.
  }
}

if (loginForm) {
  loginForm.addEventListener('submit', handleLogin);
}

if (forgotPasswordLink) {
  forgotPasswordLink.addEventListener('click', handleForgotClick);
}

if (resetForm) {
  resetForm.addEventListener('submit', handleReset);
}

hideResetLink();
checkExistingSession();
