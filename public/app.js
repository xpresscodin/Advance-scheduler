const API_BASE = '';

const calendarElement = document.getElementById('calendar');
const availabilityTableBody = document.getElementById('availabilityTableBody');
const internForm = document.getElementById('internForm');
const availabilityForm = document.getElementById('availabilityForm');
const internSelect = document.getElementById('availabilityIntern');
const trainerSelect = document.getElementById('trainerSelect');
const trainerField = document.getElementById('trainerField');
const availabilityTypeSelect = document.getElementById('availabilityType');
const availabilityRowTemplate = document.getElementById('availabilityRowTemplate');
const generateButton = document.getElementById('generateSchedule');
const openSlotsList = document.getElementById('openSlots');
const summaryTableBody = document.getElementById('summaryTableBody');
const lastGeneratedLabel = document.getElementById('lastGenerated');
const duplicateButton = document.getElementById('duplicateAssignment');
const deleteButton = document.getElementById('deleteAssignment');

let interns = [];
let availabilities = [];
let schedule = { assignments: [], openSlots: [], totalsByIntern: [] };
let calendar;
let selectedEventId = null;

function dayToDate(dayName) {
  const now = new Date();
  const currentDay = now.getDay();
  const desiredDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(dayName);
  if (desiredDay === -1) return now;
  const distance = (desiredDay + 7 - currentDay) % 7;
  const target = new Date(now);
  target.setDate(now.getDate() + distance);
  target.setHours(0, 0, 0, 0);
  return target;
}

function toCalendarEvent(assignment) {
  const intern = interns.find((item) => item.id === assignment.internId);
  const trainer = assignment.trainerId ? interns.find((item) => item.id === assignment.trainerId) : null;
  const startDate = dayToDate(assignment.day);
  const [startHour, startMinute] = assignment.start.split(':').map(Number);
  const [endHour, endMinute] = assignment.end.split(':').map(Number);
  const start = new Date(startDate);
  start.setHours(startHour, startMinute, 0, 0);
  const end = new Date(startDate);
  end.setHours(endHour, endMinute, 0, 0);

  const titleParts = [];
  if (intern) titleParts.push(intern.name);
  if (trainer) titleParts.push(`+ ${trainer.name}`);
  const title = titleParts.join(' ');

  return {
    id: assignment.id,
    title: title || 'Unassigned',
    start,
    end,
    extendedProps: {
      station: assignment.station,
      type: assignment.type,
      internId: assignment.internId,
      trainerId: assignment.trainerId || null,
      day: assignment.day
    },
    classNames: [assignment.type === 'training' ? 'training-event' : 'independent-event']
  };
}

function renderCalendar() {
  if (calendar) {
    calendar.destroy();
  }
  calendar = new FullCalendar.Calendar(calendarElement, {
    initialView: 'timeGridWeek',
    nowIndicator: true,
    slotMinTime: '06:00:00',
    slotMaxTime: '22:00:00',
    allDaySlot: false,
    editable: true,
    droppable: false,
    eventDurationEditable: false,
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'timeGridWeek,timeGridDay'
    },
    events: schedule.assignments.map(toCalendarEvent),
    eventClick(info) {
      selectedEventId = info.event.id;
      duplicateButton.disabled = false;
      deleteButton.disabled = false;
    },
    eventDrop(info) {
      const event = info.event;
      persistEventUpdate(event).catch((error) => {
        alert(error.message || 'Unable to update assignment.');
        info.revert();
      });
    }
  });
  calendar.render();
}

async function persistEventUpdate(event) {
  const body = buildPayloadFromEvent(event);
  const response = await fetch(`${API_BASE}/api/schedule/assignment/${event.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to update assignment');
  }
  await refreshSchedule();
}

function buildPayloadFromEvent(event) {
  const start = event.start;
  const end = event.end;
  const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][start.getDay()];
  const toTimeString = (date) => `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  return {
    day,
    start: toTimeString(start),
    end: toTimeString(end)
  };
}

async function loadInterns() {
  const response = await fetch(`${API_BASE}/api/interns`);
  interns = await response.json();
  renderInternOptions();
}

function renderInternOptions() {
  internSelect.innerHTML = '';
  trainerSelect.innerHTML = '<option value="">Select trainer</option>';
  interns.forEach((intern) => {
    const option = document.createElement('option');
    option.value = intern.id;
    option.textContent = intern.name;
    internSelect.appendChild(option);
    if (intern.isTrainer) {
      const trainerOption = document.createElement('option');
      trainerOption.value = intern.id;
      trainerOption.textContent = intern.name;
      trainerSelect.appendChild(trainerOption);
    }
  });
}

async function loadAvailabilities() {
  const response = await fetch(`${API_BASE}/api/availabilities`);
  availabilities = await response.json();
  renderAvailabilityTable();
}

function renderAvailabilityTable() {
  availabilityTableBody.innerHTML = '';
  availabilities
    .sort((a, b) => {
      const internA = interns.find((item) => item.id === a.internId)?.name || '';
      const internB = interns.find((item) => item.id === b.internId)?.name || '';
      if (internA !== internB) return internA.localeCompare(internB);
      if (a.day !== b.day) return a.day.localeCompare(b.day);
      return a.start.localeCompare(b.start);
    })
    .forEach((availability) => {
      const clone = availabilityRowTemplate.content.cloneNode(true);
      clone.querySelector('.availability-name').textContent = interns.find((intern) => intern.id === availability.internId)?.name || '';
      clone.querySelector('.availability-day').textContent = availability.day;
      clone.querySelector('.availability-time').textContent = `${availability.start} – ${availability.end}`;
      clone.querySelector('.availability-type').textContent = availability.sessionType === 'training' ? 'Training' : 'Independent';
      const deleteButton = clone.querySelector('button');
      deleteButton.addEventListener('click', () => deleteAvailability(availability.id));
      availabilityTableBody.appendChild(clone);
    });
}

async function deleteAvailability(id) {
  const confirmed = confirm('Remove this availability entry?');
  if (!confirmed) return;
  await fetch(`${API_BASE}/api/availabilities/${id}`, { method: 'DELETE' });
  await loadAvailabilities();
}

async function refreshSchedule() {
  const response = await fetch(`${API_BASE}/api/schedule`);
  schedule = await response.json();
  updateLastGenerated();
  renderCalendar();
  renderOpenSlots();
  renderSummary();
}

function renderOpenSlots() {
  openSlotsList.innerHTML = '';
  if (!schedule.openSlots || schedule.openSlots.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'All stations filled in scheduled hours.';
    openSlotsList.appendChild(empty);
    return;
  }
  schedule.openSlots.forEach((slot) => {
    const item = document.createElement('li');
    const label = `${slot.day} · ${slot.start} – ${slot.end}`;
    item.innerHTML = `<span>${label}</span><span>${slot.availableStations} open</span>`;
    openSlotsList.appendChild(item);
  });
}

function renderSummary() {
  summaryTableBody.innerHTML = '';
  if (!schedule.totalsByIntern) return;
  schedule.totalsByIntern
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((row) => {
      const tr = document.createElement('tr');
      const requestedCell = document.createElement('td');
      requestedCell.textContent = row.requestedHours;
      const assignedCell = document.createElement('td');
      assignedCell.textContent = row.assignedHours;
      tr.innerHTML = `<td>${row.name}</td>`;
      tr.appendChild(requestedCell);
      tr.appendChild(assignedCell);
      summaryTableBody.appendChild(tr);
    });
}

function updateLastGenerated() {
  if (!schedule.generatedAt) {
    lastGeneratedLabel.textContent = 'No schedule generated yet.';
    return;
  }
  const formatted = new Date(schedule.generatedAt).toLocaleString();
  lastGeneratedLabel.textContent = `Generated on ${formatted}`;
}

async function generateSchedule() {
  generateButton.disabled = true;
  generateButton.textContent = 'Generating…';
  try {
    const response = await fetch(`${API_BASE}/api/schedule/generate`, { method: 'POST' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Failed to generate schedule');
    }
    schedule = await response.json();
    updateLastGenerated();
    renderCalendar();
    renderOpenSlots();
    renderSummary();
  } catch (error) {
    alert(error.message);
  } finally {
    generateButton.disabled = false;
    generateButton.textContent = 'Generate fresh schedule';
  }
}

async function createIntern(event) {
  event.preventDefault();
  const name = document.getElementById('internName').value.trim();
  if (!name) return;
  const payload = {
    name,
    isTrainer: document.getElementById('internTrainer').checked,
    requiresTrainer: document.getElementById('internRequiresTrainer').checked
  };
  const response = await fetch(`${API_BASE}/api/interns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    alert('Unable to add intern');
    return;
  }
  document.getElementById('internName').value = '';
  document.getElementById('internTrainer').checked = false;
  document.getElementById('internRequiresTrainer').checked = false;
  await loadInterns();
}

async function submitAvailability(event) {
  event.preventDefault();
  const payload = {
    internId: internSelect.value,
    day: document.getElementById('availabilityDay').value,
    start: document.getElementById('availabilityStart').value,
    end: document.getElementById('availabilityEnd').value,
    sessionType: availabilityTypeSelect.value,
    trainerId: availabilityTypeSelect.value === 'training' ? trainerSelect.value : null,
    notes: document.getElementById('availabilityNotes').value.trim()
  };
  const response = await fetch(`${API_BASE}/api/availabilities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unable to submit availability' }));
    alert(error.error || 'Unable to submit availability');
    return;
  }
  availabilityForm.reset();
  trainerField.hidden = true;
  await loadAvailabilities();
}

function handleSessionTypeChange() {
  const type = availabilityTypeSelect.value;
  if (type === 'training') {
    trainerField.hidden = false;
  } else {
    trainerField.hidden = true;
  }
}

async function duplicateSelectedAssignment() {
  if (!selectedEventId) return;
  const event = calendar.getEventById(selectedEventId);
  if (!event) return;
  const payload = buildPayloadFromEvent(event);
  payload.internId = event.extendedProps.internId;
  payload.trainerId = event.extendedProps.trainerId;
  payload.station = event.extendedProps.station;
  const response = await fetch(`${API_BASE}/api/schedule/assignment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unable to duplicate assignment' }));
    alert(error.error || 'Unable to duplicate assignment');
    return;
  }
  await refreshSchedule();
}

async function deleteSelectedAssignment() {
  if (!selectedEventId) return;
  const confirmed = confirm('Delete this assignment from the schedule?');
  if (!confirmed) return;
  const response = await fetch(`${API_BASE}/api/schedule/assignment/${selectedEventId}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    alert('Unable to delete assignment');
    return;
  }
  selectedEventId = null;
  duplicateButton.disabled = true;
  deleteButton.disabled = true;
  await refreshSchedule();
}

function attachEventHandlers() {
  internForm.addEventListener('submit', createIntern);
  availabilityForm.addEventListener('submit', submitAvailability);
  availabilityTypeSelect.addEventListener('change', handleSessionTypeChange);
  generateButton.addEventListener('click', generateSchedule);
  duplicateButton.addEventListener('click', duplicateSelectedAssignment);
  deleteButton.addEventListener('click', deleteSelectedAssignment);
}

async function bootstrap() {
  attachEventHandlers();
  await loadInterns();
  await loadAvailabilities();
  await refreshSchedule();
}

bootstrap();
