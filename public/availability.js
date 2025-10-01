const API_BASE = '';

const internSelect = document.getElementById('availabilityIntern');
const daySelect = document.getElementById('availabilityDay');
const startInput = document.getElementById('availabilityStart');
const endInput = document.getElementById('availabilityEnd');
const typeSelect = document.getElementById('availabilityType');
const notesInput = document.getElementById('availabilityNotes');
const trainerField = document.getElementById('trainerField');
const trainerSelect = document.getElementById('trainerSelect');
const availabilityForm = document.getElementById('availabilityForm');
const statusElement = document.getElementById('status');
const availabilityTable = document.getElementById('availabilityTable');
const availabilityTableBody = document.getElementById('availabilityTableBody');
const emptyState = document.getElementById('emptyState');
const availabilityRowTemplate = document.getElementById('availabilityRowTemplate');
const addWindowButton = document.getElementById('addWindowButton');
const submitAvailabilityButton = document.getElementById('submitAvailabilityButton');
const pendingSection = document.getElementById('pendingSection');
const pendingList = document.getElementById('pendingList');
const pendingWindowTemplate = document.getElementById('pendingWindowTemplate');

const dependentControls = Array.from(availabilityForm.querySelectorAll('input, textarea, select, button')).filter(
  (element) => element.id !== 'availabilityIntern'
);

let interns = [];
let availabilities = [];
let selectedInternId = '';
let pendingWindows = [];

function timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function showStatus(message, type = 'info') {
  statusElement.textContent = message;
  statusElement.className = 'status-message';
  if (type === 'success') {
    statusElement.classList.add('success');
  } else if (type === 'error') {
    statusElement.classList.add('error');
  }
  statusElement.hidden = false;
}

function clearStatus() {
  statusElement.hidden = true;
  statusElement.textContent = '';
  statusElement.className = 'status-message';
}

function setDependentControlsEnabled(enabled) {
  dependentControls.forEach((element) => {
    element.disabled = !enabled;
  });
  updatePendingSection();
}

function clearPendingWindows() {
  pendingWindows = [];
  updatePendingSection();
}

function removePendingWindow(index) {
  pendingWindows.splice(index, 1);
  updatePendingSection();
}

function updatePendingSection() {
  if (!pendingList || !pendingSection || !submitAvailabilityButton || !pendingWindowTemplate) {
    return;
  }

  pendingList.innerHTML = '';

  if (!selectedInternId || pendingWindows.length === 0) {
    pendingSection.hidden = true;
    submitAvailabilityButton.disabled = !selectedInternId;
    return;
  }

  pendingSection.hidden = false;

  pendingWindows.forEach((entry, index) => {
    const fragment = pendingWindowTemplate.content.cloneNode(true);
    fragment.querySelector('.pending-item-time').textContent = `${entry.day}: ${entry.start} – ${entry.end}`;
    const metaParts = [];
    const typeLabel = entry.sessionType === 'training' ? 'Training' : 'Independent';
    metaParts.push(typeLabel);
    if (entry.sessionType === 'training' && entry.trainerId) {
      const trainerName = interns.find((intern) => intern.id === entry.trainerId)?.name || 'Trainer';
      metaParts.push(`Trainer: ${trainerName}`);
    }
    fragment.querySelector('.pending-item-meta').textContent = metaParts.join(' • ');
    const notesElement = fragment.querySelector('.pending-item-notes');
    if (entry.notes) {
      notesElement.textContent = entry.notes;
      notesElement.hidden = false;
    } else {
      notesElement.hidden = true;
    }
    const removeButton = fragment.querySelector('button');
    removeButton.addEventListener('click', () => removePendingWindow(index));
    pendingList.appendChild(fragment);
  });

  submitAvailabilityButton.disabled = false;
}

function buildEntryFromForm() {
  const start = startInput.value;
  const end = endInput.value;

  if (!start || !end) {
    showStatus('Select both a start and end time before continuing.', 'error');
    return null;
  }

  if (timeToMinutes(end) <= timeToMinutes(start)) {
    showStatus('End time must be later than start time.', 'error');
    return null;
  }

  const sessionType = typeSelect.value;
  const isTraining = sessionType === 'training';
  if (isTraining && !trainerSelect.value) {
    showStatus('Select a trainer to include a training session.', 'error');
    return null;
  }

  return {
    day: daySelect.value,
    start,
    end,
    sessionType,
    trainerId: isTraining ? trainerSelect.value : null,
    notes: notesInput.value.trim()
  };
}

function renderInternOptions() {
  const previousSelection = internSelect.value;
  internSelect.innerHTML = '<option value="">Select your name</option>';
  const sorted = [...interns].sort((a, b) => a.name.localeCompare(b.name));
  sorted.forEach((intern) => {
    const option = document.createElement('option');
    option.value = intern.id;
    option.textContent = intern.name;
    internSelect.appendChild(option);
  });

  if (interns.some((intern) => intern.id === previousSelection)) {
    internSelect.value = previousSelection;
    selectedInternId = previousSelection;
  } else {
    internSelect.value = '';
    selectedInternId = '';
  }
}

function renderTrainerOptions() {
  trainerSelect.innerHTML = '<option value="">Select a trainer</option>';
  const trainers = interns.filter((intern) => intern.isTrainer);
  trainers.forEach((trainer) => {
    const option = document.createElement('option');
    option.value = trainer.id;
    option.textContent = trainer.name;
    trainerSelect.appendChild(option);
  });
  trainerSelect.disabled = trainers.length === 0;
}

function evaluateFormState() {
  if (interns.length === 0) {
    internSelect.disabled = true;
    setDependentControlsEnabled(false);
    showStatus('No interns are available yet. Please contact an administrator to be added before submitting availability.', 'error');
    availabilityTable.hidden = true;
    return;
  }

  internSelect.disabled = false;
  const hasSelection = Boolean(selectedInternId);
  setDependentControlsEnabled(hasSelection);
  if (!hasSelection) {
    clearPendingWindows();
    availabilityTable.hidden = true;
  }
}

function renderAvailabilityTable() {
  if (!selectedInternId) {
    availabilityTable.hidden = true;
    return;
  }

  const entries = availabilities
    .filter((availability) => availability.internId === selectedInternId)
    .sort((a, b) => {
      if (a.day !== b.day) return a.day.localeCompare(b.day);
      return a.start.localeCompare(b.start);
    });

  availabilityTable.hidden = false;
  availabilityTableBody.innerHTML = '';

  if (entries.length === 0) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;

  entries.forEach((availability) => {
    const fragment = availabilityRowTemplate.content.cloneNode(true);
    fragment.querySelector('.availability-day').textContent = availability.day;
    fragment.querySelector('.availability-time').textContent = `${availability.start} – ${availability.end}`;
    const typeLabel = availability.sessionType === 'training' ? 'Training' : 'Independent';
    const trainerName = availability.trainerId
      ? interns.find((intern) => intern.id === availability.trainerId)?.name || 'Trainer'
      : null;
    fragment.querySelector('.availability-type').textContent = trainerName ? `${typeLabel} (${trainerName})` : typeLabel;
    const deleteButton = fragment.querySelector('button');
    deleteButton.addEventListener('click', () => {
      deleteAvailability(availability.id, deleteButton);
    });
    availabilityTableBody.appendChild(fragment);
  });
}

async function loadInterns() {
  try {
    const response = await fetch(`${API_BASE}/api/interns`);
    if (!response.ok) {
      throw new Error('Unable to load intern list.');
    }
    interns = await response.json();
    renderInternOptions();
    renderTrainerOptions();
    evaluateFormState();
    renderAvailabilityTable();
  } catch (error) {
    console.error(error);
    showStatus(error.message || 'Unable to load intern list.', 'error');
    internSelect.disabled = true;
    setDependentControlsEnabled(false);
  }
}

async function loadAvailabilities(requestedInternId = selectedInternId) {
  if (!requestedInternId) {
    availabilities = [];
    renderAvailabilityTable();
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/availabilities?internId=${encodeURIComponent(requestedInternId)}`);
    if (!response.ok) {
      throw new Error('Unable to load availability.');
    }
    availabilities = await response.json();
    renderAvailabilityTable();
  } catch (error) {
    console.error(error);
    showStatus(error.message || 'Unable to load availability.', 'error');
  }
}

async function submitAvailability(event) {
  event.preventDefault();
  clearStatus();

  if (!selectedInternId) {
    showStatus('Please choose your name before submitting availability.', 'error');
    return;
  }

  let entriesToSubmit = [...pendingWindows];
  if (entriesToSubmit.length === 0) {
    const singleEntry = buildEntryFromForm();
    if (!singleEntry) {
      return;
    }
    entriesToSubmit = [singleEntry];
  }

  const payload = {
    internId: selectedInternId,
    entries: entriesToSubmit.map((entry) => ({
      day: entry.day,
      start: entry.start,
      end: entry.end,
      sessionType: entry.sessionType,
      trainerId: entry.sessionType === 'training' ? entry.trainerId : null,
      notes: entry.notes || ''
    }))
  };

  submitAvailabilityButton.disabled = true;

  try {
    const response = await fetch(`${API_BASE}/api/availabilities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unable to submit availability.' }));
      throw new Error(error.error || 'Unable to submit availability.');
    }

    const result = await response.json().catch(() => ({}));
    const count = Array.isArray(result.created)
      ? result.created.length
      : result && typeof result === 'object' && result.id
      ? 1
      : payload.entries.length;
    const windowLabel = count === 1 ? 'availability window' : 'availability windows';
    showStatus(`Successfully submitted ${count} ${windowLabel}.`, 'success');
    clearPendingWindows();
    await loadAvailabilities();
    resetFormFields();
  } catch (error) {
    console.error(error);
    showStatus(error.message || 'Unable to submit availability.', 'error');
  } finally {
    submitAvailabilityButton.disabled = false;
  }
}

function resetFormFields() {
  startInput.value = '';
  endInput.value = '';
  notesInput.value = '';
  typeSelect.value = 'independent';
  trainerSelect.value = '';
  trainerField.hidden = true;
}

function handleAddWindow() {
  clearStatus();
  if (!selectedInternId) {
    showStatus('Choose your name before adding time windows.', 'error');
    return;
  }

  const entry = buildEntryFromForm();
  if (!entry) {
    return;
  }

  pendingWindows.push(entry);
  updatePendingSection();
  showStatus(`Added ${entry.day} ${entry.start} – ${entry.end} to the submission list.`, 'success');
  resetFormFields();
}

async function deleteAvailability(id, button) {
  const confirmed = confirm('Remove this availability entry?');
  if (!confirmed) {
    return;
  }

  button.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/api/availabilities/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unable to remove availability.' }));
      throw new Error(error.error || 'Unable to remove availability.');
    }
    showStatus('Availability removed.', 'success');
    await loadAvailabilities();
  } catch (error) {
    console.error(error);
    showStatus(error.message || 'Unable to remove availability.', 'error');
  } finally {
    button.disabled = false;
  }
}

function handleInternChange() {
  const previousInternId = selectedInternId;
  selectedInternId = internSelect.value;
  clearStatus();
  setDependentControlsEnabled(Boolean(selectedInternId));
  if (!selectedInternId || selectedInternId !== previousInternId) {
    clearPendingWindows();
  }
  renderAvailabilityTable();
  if (selectedInternId) {
    showStatus(`You are updating availability for ${internSelect.options[internSelect.selectedIndex].textContent}.`);
    loadAvailabilities(selectedInternId);
  }
}

function handleTypeChange() {
  const isTraining = typeSelect.value === 'training';
  trainerField.hidden = !isTraining;
  if (isTraining) {
    renderTrainerOptions();
    if (trainerSelect.disabled) {
      showStatus('No trainers are currently available. Please submit this session after a trainer is added.', 'error');
    }
  } else {
    trainerSelect.value = '';
  }
}

availabilityForm.addEventListener('submit', submitAvailability);
if (addWindowButton) {
  addWindowButton.addEventListener('click', handleAddWindow);
}
internSelect.addEventListener('change', handleInternChange);
typeSelect.addEventListener('change', handleTypeChange);

renderTrainerOptions();
setDependentControlsEnabled(false);
loadInterns().then(loadAvailabilities);
