const resetForm = document.getElementById('resetRequestForm');
const resetStatus = document.getElementById('resetStatus');
const usernameInput = document.getElementById('resetUsername');
const emailInput = document.getElementById('resetEmail');

function showStatus(message, type = 'info') {
  if (!resetStatus) return;
  resetStatus.textContent = message;
  resetStatus.className = 'status-message';
  if (type === 'success') {
    resetStatus.classList.add('success');
  } else if (type === 'error') {
    resetStatus.classList.add('error');
  }
  resetStatus.hidden = false;
}

function clearStatus() {
  if (!resetStatus) return;
  resetStatus.hidden = true;
  resetStatus.textContent = '';
  resetStatus.className = 'status-message';
}

async function handleResetRequest(event) {
  event.preventDefault();
  clearStatus();
  const username = usernameInput.value.trim();
  const email = emailInput.value.trim();
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
    resetForm.reset();
  } catch (error) {
    console.error(error);
    showStatus('Unable to send reset instructions right now. Please try again shortly.', 'error');
  }
}

if (resetForm) {
  resetForm.addEventListener('submit', handleResetRequest);
}

usernameInput?.focus();
