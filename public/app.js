const API_BASE = '';

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const calendarElement = document.getElementById('calendar');
const availabilityAccordion = document.getElementById('availabilityAccordion');
const internForm = document.getElementById('internForm');
const availabilityForm = document.getElementById('availabilityForm');
const internSelect = document.getElementById('availabilityIntern');
const trainerSelect = document.getElementById('trainerSelect');
const trainerField = document.getElementById('trainerField');
const availabilityTypeSelect = document.getElementById('availabilityType');
const generateButton = document.getElementById('generateSchedule');
const openSlotsList = document.getElementById('openSlots');
const summaryTableBody = document.getElementById('summaryTableBody');
const daySummaryBody = document.getElementById('daySummaryBody');
const lastGeneratedLabel = document.getElementById('lastGenerated');
const duplicateButton = document.getElementById('duplicateAssignment');
const deleteButton = document.getElementById('deleteAssignment');
const dailyRosterContainer = document.getElementById('dailyRoster');
const stationToggleButton = document.getElementById('toggleStations');

let interns = [];
let availabilities = [];
let schedule = { assignments: [], openSlots: [], totalsByIntern: [] };
let calendar;
let selectedEventId = null;
let showStations = true;
const referenceWeekStart = getReferenceWeekStart();

function getReferenceWeekStart() {
  const now = new Date();
  const result = new Date(now);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day; // align to Monday
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function dayToDate(dayName) {
  const desiredDay = WEEK_DAYS.indexOf(dayName);
  if (desiredDay === -1) return new Date(referenceWeekStart);
  const target = new Date(referenceWeekStart);
  target.setDate(referenceWeekStart.getDate() + desiredDay);
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
    display: 'block',
    extendedProps: {
      station: assignment.station,
      type: assignment.type,
      internId: assignment.internId,
      trainerId: assignment.trainerId || null,
      internName: intern?.name || 'Unassigned',
      trainerName: trainer?.name || null,
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
    firstDay: 1,
    dayHeaderFormat: { weekday: 'long' },
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'timeGridWeek,timeGridDay'
    },
    initialDate: referenceWeekStart,
    events: schedule.assignments.map(toCalendarEvent),
    eventContent(arg) {
      const { station, trainerName, internName } = arg.event.extendedProps;
      const names = trainerName ? `${internName} + ${trainerName}` : internName;
      return {
        html: `
          <div class="event-time">${arg.timeText}</div>
          <div class="event-name">${names}</div>
          <div class="event-station">Station ${station}</div>
        `
      };
    },
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

function updateStationToggle() {
  if (!stationToggleButton) return;
  stationToggleButton.textContent = showStations ? 'Hide station numbers' : 'Show station numbers';
  document.body.classList.toggle('stations-hidden', !showStations);
}

function toggleStationVisibility() {
  showStations = !showStations;
  updateStationToggle();
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
  if (!availabilityAccordion) return;
  availabilityAccordion.innerHTML = '';

  if (availabilities.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No availability submitted yet.';
    availabilityAccordion.appendChild(empty);
    return;
  }

  const grouped = new Map();
  availabilities.forEach((availability) => {
    const intern = interns.find((item) => item.id === availability.internId);
    if (!intern) return;
    if (!grouped.has(intern.id)) {
      grouped.set(intern.id, { intern, entries: [] });
    }
    grouped.get(intern.id).entries.push(availability);
  });

  const orderedGroups = Array.from(grouped.values()).sort((a, b) => a.intern.name.localeCompare(b.intern.name));

  orderedGroups.forEach(({ intern, entries }) => {
    const details = document.createElement('details');
    details.className = 'availability-accordion-item';

    const summary = document.createElement('summary');
    summary.className = 'availability-accordion-summary';
    const summaryName = document.createElement('span');
    summaryName.className = 'availability-accordion-name';
    summaryName.textContent = intern.name;
    const summaryCount = document.createElement('span');
    summaryCount.className = 'availability-accordion-count';
    summaryCount.textContent = `${entries.length} ${entries.length === 1 ? 'window' : 'windows'}`;
    summary.appendChild(summaryName);
    summary.appendChild(summaryCount);
    details.appendChild(summary);

    const slotList = document.createElement('ul');
    slotList.className = 'availability-slot-list';

    entries
      .slice()
      .sort((a, b) => {
        if (a.day !== b.day) return a.day.localeCompare(b.day);
        if (a.start !== b.start) return a.start.localeCompare(b.start);
        return a.end.localeCompare(b.end);
      })
      .forEach((entry) => {
        const item = document.createElement('li');
        item.className = 'availability-slot';

        const time = document.createElement('div');
        time.className = 'availability-slot-time';
        time.textContent = `${entry.day} · ${entry.start} – ${entry.end}`;
        item.appendChild(time);

        const type = document.createElement('div');
        type.className = 'availability-slot-type';
        type.textContent = entry.sessionType === 'training' ? 'Training' : 'Independent';
        item.appendChild(type);

        if (entry.notes) {
          const notes = document.createElement('div');
          notes.className = 'availability-slot-notes';
          notes.textContent = entry.notes;
          item.appendChild(notes);
        }

        const actions = document.createElement('div');
        actions.className = 'availability-slot-actions';
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'danger small';
        removeButton.textContent = 'Remove';
        removeButton.addEventListener('click', (event) => {
          event.stopPropagation();
          deleteAvailability(entry.id);
        });
        actions.appendChild(removeButton);
        item.appendChild(actions);

        slotList.appendChild(item);
      });

    details.appendChild(slotList);
    availabilityAccordion.appendChild(details);
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
  renderDaySummary();
  renderDailyRoster();
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
  const totals = schedule.totalsByIntern || [];
  if (totals.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.textContent = 'No assignments yet.';
    row.appendChild(cell);
    summaryTableBody.appendChild(row);
    return;
  }

  totals
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${row.name}</td>`;
      const requestedCell = document.createElement('td');
      requestedCell.textContent = row.requestedHours;
      const assignedCell = document.createElement('td');
      assignedCell.textContent = row.assignedHours;
      tr.appendChild(requestedCell);
      tr.appendChild(assignedCell);
      summaryTableBody.appendChild(tr);
    });
}

function renderDaySummary() {
  if (!daySummaryBody) return;
  daySummaryBody.innerHTML = '';
  const daySummaries = schedule.daySummaries || {};
  const orderedDays = WEEK_DAYS;
  let hasData = false;

  orderedDays.forEach((day) => {
    const summary = daySummaries[day];
    if (!summary) return;
    hasData = true;
    const row = document.createElement('tr');
    const dayCell = document.createElement('td');
    dayCell.textContent = day;
    row.appendChild(dayCell);
    const assignmentsCell = document.createElement('td');
    assignmentsCell.textContent = summary.assignments;
    row.appendChild(assignmentsCell);
    const trainingCell = document.createElement('td');
    trainingCell.textContent = summary.trainings;
    row.appendChild(trainingCell);
    daySummaryBody.appendChild(row);
  });

  if (!hasData) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.textContent = 'Generate a schedule to view distribution by day.';
    row.appendChild(cell);
    daySummaryBody.appendChild(row);
  }
}

function renderDailyRoster() {
  if (!dailyRosterContainer) return;
  dailyRosterContainer.innerHTML = '';

  const assignmentsByDay = new Map();
  WEEK_DAYS.forEach((day) => assignmentsByDay.set(day, []));

  schedule.assignments.forEach((assignment) => {
    if (!assignmentsByDay.has(assignment.day)) {
      assignmentsByDay.set(assignment.day, []);
    }
    const intern = interns.find((item) => item.id === assignment.internId);
    const trainer = assignment.trainerId ? interns.find((item) => item.id === assignment.trainerId) : null;
    assignmentsByDay.get(assignment.day).push({
      start: assignment.start,
      end: assignment.end,
      station: assignment.station,
      internName: intern?.name || 'Unassigned',
      trainerName: trainer?.name || null,
      type: assignment.type
    });
  });

  let hasAssignments = false;

  WEEK_DAYS.forEach((day) => {
    const entries = assignmentsByDay.get(day) || [];
    if (entries.length === 0) return;
    hasAssignments = true;

    entries.sort((a, b) => {
      if (a.start !== b.start) return a.start.localeCompare(b.start);
      if (a.station !== b.station) return String(a.station).localeCompare(String(b.station));
      return (a.internName || '').localeCompare(b.internName || '');
    });

    const section = document.createElement('section');
    section.className = 'roster-day';

    const heading = document.createElement('h4');
    heading.textContent = day;
    section.appendChild(heading);

    const list = document.createElement('ul');
    list.className = 'roster-list';

    entries.forEach((entry) => {
      const item = document.createElement('li');
      item.className = `roster-item ${entry.type === 'training' ? 'training' : 'independent'}`;

      const names = entry.trainerName ? `${entry.internName} + ${entry.trainerName}` : entry.internName;

      item.innerHTML = `
        <span class="roster-time">${entry.start} – ${entry.end}</span>
        <span class="roster-names">${names}</span>
        <span class="roster-station">Station ${entry.station}</span>
      `;

      list.appendChild(item);
    });

    section.appendChild(list);
    dailyRosterContainer.appendChild(section);
  });

  if (!hasAssignments) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Generate a schedule to review the weekly roster.';
    dailyRosterContainer.appendChild(empty);
  }
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
    renderDaySummary();
    renderDailyRoster();
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
  if (stationToggleButton) {
    stationToggleButton.addEventListener('click', toggleStationVisibility);
  }
}

async function bootstrap() {
  attachEventHandlers();
  updateStationToggle();
  await loadInterns();
  await loadAvailabilities();
  await refreshSchedule();
}

bootstrap();
