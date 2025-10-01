const API_BASE = '';

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const calendarElement = document.getElementById('calendar');
const adminAlert = document.getElementById('adminAlert');
const adminWelcome = document.getElementById('adminWelcome');
const adminContact = document.getElementById('adminContact');
const togglePasswordFormButton = document.getElementById('togglePasswordForm');
const changePasswordForm = document.getElementById('changePasswordForm');
const cancelPasswordChangeButton = document.getElementById('cancelPasswordChange');
const logoutButton = document.getElementById('logoutButton');
const createAdminForm = document.getElementById('createAdminForm');
const adminTable = document.getElementById('adminTable');
const adminTableBody = document.getElementById('adminTableBody');
const adminTableEmpty = document.getElementById('adminTableEmpty');
const newAdminCredentials = document.getElementById('newAdminCredentials');
const internForm = document.getElementById('internForm');
const availabilityForm = document.getElementById('availabilityForm');
const internSelect = document.getElementById('availabilityIntern');
const trainerSelect = document.getElementById('trainerSelect');
const trainerField = document.getElementById('trainerField');
const availabilityTypeSelect = document.getElementById('availabilityType');
const availabilityTable = document.getElementById('availabilityTable');
const availabilityTableBody = document.getElementById('availabilityTableBody');
const availabilityEmpty = document.getElementById('availabilityEmpty');
const availabilitySearch = document.getElementById('availabilitySearch');
const generateButton = document.getElementById('generateSchedule');
const openSlotsList = document.getElementById('openSlots');
const summaryTableBody = document.getElementById('summaryTableBody');
const daySummaryBody = document.getElementById('daySummaryBody');
const lastGeneratedLabel = document.getElementById('lastGenerated');
const duplicateButton = document.getElementById('duplicateAssignment');
const deleteButton = document.getElementById('deleteAssignment');
const exportTeamsButton = document.getElementById('exportTeams');
const exportExcelButton = document.getElementById('exportExcel');
const dailyRosterContainer = document.getElementById('dailyRoster');
const stationToggleButton = document.getElementById('toggleStations');

let interns = [];
let availabilities = [];
let schedule = { assignments: [], openSlots: [], totalsByIntern: [] };
let calendar;
let selectedEventId = null;
let showStations = true;
let currentAdmin = null;
let requirePasswordChange = false;
const referenceWeekStart = getReferenceWeekStart();
const DAY_INDEX = new Map(WEEK_DAYS.map((day, index) => [day, index]));

if (changePasswordForm) {
  changePasswordForm.dataset.visible = 'false';
}

function getReferenceWeekStart() {
  const now = new Date();
  const result = new Date(now);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day; // align to Monday
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function redirectToLogin() {
  const redirect = encodeURIComponent(window.location.pathname || '/');
  window.location.href = `login.html?redirect=${redirect}`;
}

async function apiRequest(path, options = {}) {
  const init = { credentials: 'include', ...options };
  init.headers = { ...(options.headers || {}) };
  const response = await fetch(`${API_BASE}${path}`, init);
  if (response.status === 401 || response.status === 403) {
    redirectToLogin();
    throw new Error('Unauthorized');
  }
  return response;
}

function showAdminAlert(message, type = 'info') {
  if (!adminAlert) return;
  adminAlert.textContent = message;
  adminAlert.className = 'status-message';
  if (type === 'success') {
    adminAlert.classList.add('success');
  } else if (type === 'error') {
    adminAlert.classList.add('error');
  }
  adminAlert.hidden = false;
}

function clearAdminAlert() {
  if (!adminAlert) return;
  adminAlert.hidden = true;
  adminAlert.textContent = '';
  adminAlert.className = 'status-message';
}

function updateAdminOverview() {
  if (!adminWelcome || !adminContact) {
    return;
  }

  if (!currentAdmin) {
    adminWelcome.textContent = '';
    adminContact.textContent = '';
    return;
  }

  adminWelcome.textContent = `Signed in as ${currentAdmin.name}`;
  adminContact.textContent = currentAdmin.email;

  if (togglePasswordFormButton) {
    togglePasswordFormButton.disabled = requirePasswordChange;
  }

  if (changePasswordForm) {
    changePasswordForm.hidden = !requirePasswordChange && changePasswordForm.dataset.visible !== 'true';
    if (requirePasswordChange) {
      changePasswordForm.dataset.visible = 'true';
    }
  }

  if (requirePasswordChange) {
    showAdminAlert('A temporary password is in use. Update it now to continue managing schedules.', 'error');
  }
}

function renderAdminTable(admins = []) {
  if (!adminTableBody || !adminTable || !adminTableEmpty) {
    return;
  }

  adminTableBody.innerHTML = '';

  if (!admins.length) {
    adminTable.hidden = true;
    adminTableEmpty.hidden = false;
    return;
  }

  const sorted = admins.slice().sort((a, b) => a.name.localeCompare(b.name));
  sorted.forEach((admin) => {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    nameCell.textContent = admin.name;
    row.appendChild(nameCell);

    const emailCell = document.createElement('td');
    emailCell.textContent = admin.email;
    row.appendChild(emailCell);

    const usernameCell = document.createElement('td');
    usernameCell.textContent = admin.username;
    row.appendChild(usernameCell);

    const requireChangeCell = document.createElement('td');
    requireChangeCell.textContent = admin.requirePasswordChange ? 'Yes' : 'No';
    row.appendChild(requireChangeCell);

    adminTableBody.appendChild(row);
  });

  adminTable.hidden = false;
  adminTableEmpty.hidden = true;
}

async function loadSession() {
  try {
    const response = await apiRequest('/api/auth/session');
    const data = await response.json();
    currentAdmin = data.admin;
    requirePasswordChange = Boolean(data.admin?.requirePasswordChange);
    updateAdminOverview();
  } catch (error) {
    if (error.message === 'Unauthorized') {
      return;
    }
    console.error(error);
    showAdminAlert('Unable to load admin session.', 'error');
  }
}

async function loadAdmins() {
  try {
    const response = await apiRequest('/api/auth/admins');
    const admins = await response.json();
    renderAdminTable(admins);
  } catch (error) {
    if (error.message === 'Unauthorized') {
      return;
    }
    console.error(error);
    showAdminAlert('Unable to load admin list.', 'error');
  }
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

  const parsedStation = Number.parseInt(assignment.station, 10);
  const stationSort = Number.isFinite(parsedStation) ? parsedStation : Number.MAX_SAFE_INTEGER;
  const titleParts = [];
  if (intern) titleParts.push(intern.name);
  if (trainer) titleParts.push(`+ ${trainer.name}`);
  const title = titleParts.join(' ');

  const peopleCount = trainer ? 2 : 1;
  const classes = ['schedule-event'];

  if (assignment.type === 'training') {
    classes.push('event-training');
  } else {
    if (endHour === 19 && endMinute === 0) {
      classes.push('event-end-19');
    } else if (startHour === 7) {
      classes.push('event-start-7');
    } else if (startHour >= 8 && startHour <= 18) {
      classes.push('event-daytime');
    } else {
      classes.push('event-neutral');
    }
  }

  if (classes.length === 1) {
    classes.push('event-neutral');
  }

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
      day: assignment.day,
      startTime: assignment.start,
      endTime: assignment.end,
      peopleCount,
      stationSort
    },
    classNames: classes
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
    eventOverlap: false,
    slotEventOverlap: false,
    eventOrderStrict: true,
    eventOrder(a, b) {
      const stationA = a.extendedProps.stationSort ?? Number.MAX_SAFE_INTEGER;
      const stationB = b.extendedProps.stationSort ?? Number.MAX_SAFE_INTEGER;
      if (stationA !== stationB) {
        return stationA - stationB;
      }

      const internCompare = (a.extendedProps.internName || '').localeCompare(b.extendedProps.internName || '');
      if (internCompare !== 0) {
        return internCompare;
      }

      return (a.extendedProps.trainerName || '').localeCompare(b.extendedProps.trainerName || '');
    },
    eventContent(arg) {
      const { station, trainerName, internName, peopleCount } = arg.event.extendedProps;
      const names = trainerName ? `${internName} + ${trainerName}` : internName;
      const participantLabel = peopleCount === 1 ? '1 person' : `${peopleCount} people`;
      const metaParts = [];
      if (station) {
        metaParts.push(`<span class="event-station">Station ${station}</span>`);
      }
      metaParts.push(`<span class="event-count">${participantLabel}</span>`);
      const metaHtml = metaParts.join('<span class="event-meta-separator">•</span>');
      return {
        html: `
          <div class="event-time">${arg.timeText}</div>
          <div class="event-name">${names}</div>
          <div class="event-meta">${metaHtml}</div>
        `
      };
    },
    eventClick(info) {
      selectedEventId = info.event.id;
      duplicateButton.disabled = false;
      deleteButton.disabled = false;
    },
    eventDidMount(info) {
      const { internName, trainerName, day, startTime, endTime, station, peopleCount } = info.event.extendedProps;
      const participants = trainerName ? `${internName} + ${trainerName}` : internName;
      const rangeLabel = startTime && endTime ? `${formatTimeLabel(startTime)} – ${formatTimeLabel(endTime)}` : '';
      const lines = [participants];
      if (day && rangeLabel) {
        lines.push(`${day} · ${rangeLabel}`);
      } else if (day) {
        lines.push(day);
      }
      if (station) {
        lines.push(`Station ${station}`);
      }
      if (peopleCount) {
        const countLabel = peopleCount === 1 ? '1 person' : `${peopleCount} people`;
        lines.push(countLabel);
      }
      info.el.setAttribute('title', lines.join('\n'));

      info.el.style.width = '100%';
      info.el.style.left = '0';
      info.el.style.right = '0';

      const harness = info.el.closest('.fc-timegrid-event-harness');
      if (harness) {
        harness.style.width = '100%';
        harness.style.left = '0';
        harness.style.right = '0';
      }
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
  try {
    const response = await apiRequest(`/api/schedule/assignment/${event.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Failed to update assignment');
    }
  } catch (error) {
    if (error.message === 'Unauthorized') {
      return;
    }
    throw error;
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
  try {
    const response = await apiRequest('/api/interns');
    interns = await response.json();
    renderInternOptions();
  } catch (error) {
    if (error.message === 'Unauthorized') {
      return;
    }
    console.error(error);
    showAdminAlert('Unable to load interns.', 'error');
  }
}

function renderInternOptions() {
  if (!internSelect || !trainerSelect) return;
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
  try {
    const response = await apiRequest('/api/availabilities');
    availabilities = await response.json();
    renderAvailabilityTable();
  } catch (error) {
    if (error.message === 'Unauthorized') {
      return;
    }
    console.error(error);
    showAdminAlert('Unable to load submitted availability.', 'error');
  }
}

function renderAvailabilityTable() {
  if (!availabilityTable || !availabilityTableBody || !availabilityEmpty) {
    return;
  }

  availabilityTableBody.innerHTML = '';

  const query = (availabilitySearch?.value || '').trim().toLowerCase();

  if (availabilitySearch) {
    availabilitySearch.disabled = !availabilities.length;
  }

  if (!availabilities.length) {
    availabilityTable.hidden = true;
    availabilityEmpty.textContent = 'No availability submitted yet.';
    availabilityEmpty.hidden = false;
    return;
  }

  const internMap = new Map(interns.map((intern) => [intern.id, intern]));

  const sorted = availabilities
    .slice()
    .sort((a, b) => {
      const internNameA = internMap.get(a.internId)?.name || '';
      const internNameB = internMap.get(b.internId)?.name || '';
      const nameOrder = internNameA.localeCompare(internNameB);
      if (nameOrder !== 0) return nameOrder;
      const dayOrder = (DAY_INDEX.get(a.day) ?? 0) - (DAY_INDEX.get(b.day) ?? 0);
      if (dayOrder !== 0) return dayOrder;
      return a.start.localeCompare(b.start);
    });

  const filtered = sorted.filter((entry) => {
    if (!query) return true;
    const internName = internMap.get(entry.internId)?.name || '';
    const trainerName = entry.trainerId ? internMap.get(entry.trainerId)?.name || '' : '';
    const fields = [internName, trainerName, entry.day, entry.start, entry.end, entry.notes || ''];
    return fields.some((value) => value.toLowerCase().includes(query));
  });

  if (!filtered.length) {
    availabilityTable.hidden = true;
    availabilityEmpty.textContent = 'No availability matches your search.';
    availabilityEmpty.hidden = false;
    return;
  }

  availabilityEmpty.textContent = 'No availability submitted yet.';

  filtered.forEach((entry) => {
    const intern = internMap.get(entry.internId);
    const trainer = entry.trainerId ? internMap.get(entry.trainerId) : null;
    const row = document.createElement('tr');

    const internCell = document.createElement('td');
    internCell.textContent = intern?.name || 'Unknown intern';
    row.appendChild(internCell);

    const dayCell = document.createElement('td');
    dayCell.textContent = entry.day;
    row.appendChild(dayCell);

    const timeCell = document.createElement('td');
    timeCell.textContent = `${entry.start} – ${entry.end}`;
    row.appendChild(timeCell);

    const typeCell = document.createElement('td');
    typeCell.textContent = entry.sessionType === 'training' ? 'Training' : 'Independent';
    row.appendChild(typeCell);

    const trainerCell = document.createElement('td');
    trainerCell.textContent = trainer?.name || (entry.sessionType === 'training' ? 'Trainer pending' : '');
    row.appendChild(trainerCell);

    const notesCell = document.createElement('td');
    notesCell.textContent = entry.notes || '';
    row.appendChild(notesCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions';
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'danger small';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => deleteAvailability(entry.id));
    actionsCell.appendChild(removeButton);
    row.appendChild(actionsCell);

    availabilityTableBody.appendChild(row);
  });

  availabilityTable.hidden = false;
  availabilityEmpty.hidden = true;
}

async function deleteAvailability(id) {
  const confirmed = confirm('Remove this availability entry?');
  if (!confirmed) return;
  try {
    await apiRequest(`/api/availabilities/${id}`, { method: 'DELETE' });
    await loadAvailabilities();
  } catch (error) {
    if (error.message === 'Unauthorized') {
      return;
    }
    console.error(error);
    showAdminAlert('Unable to remove availability entry.', 'error');
  }
}

async function refreshSchedule({ reloadReference = false } = {}) {
  try {
    if (reloadReference) {
      await loadInterns();
      await loadAvailabilities();
    }
    const response = await apiRequest('/api/schedule');
    schedule = await response.json();
    updateLastGenerated();
    renderCalendar();
    renderOpenSlots();
    renderSummary();
    renderDaySummary();
    renderDailyRoster();
    updateExportButtons();
  } catch (error) {
    if (error.message === 'Unauthorized') {
      return;
    }
    console.error(error);
    showAdminAlert('Unable to load the schedule.', 'error');
  }
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
    const response = await apiRequest('/api/schedule/generate', { method: 'POST' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Failed to generate schedule');
    }
    schedule = await response.json();
    await loadInterns();
    await loadAvailabilities();
    updateLastGenerated();
    renderCalendar();
    renderOpenSlots();
    renderSummary();
    renderDaySummary();
    renderDailyRoster();
  } catch (error) {
    if (error.message === 'Unauthorized') {
      return;
    }
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
  try {
    const response = await apiRequest('/api/interns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unable to add intern' }));
      throw new Error(error.error || 'Unable to add intern');
    }
    document.getElementById('internName').value = '';
    document.getElementById('internTrainer').checked = false;
    document.getElementById('internRequiresTrainer').checked = false;
    await loadInterns();
  } catch (error) {
    if (error.message === 'Unauthorized') {
      return;
    }
    alert(error.message || 'Unable to add intern');
  }
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
  try {
    const response = await apiRequest('/api/availabilities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unable to submit availability' }));
      throw new Error(error.error || 'Unable to submit availability');
    }
    availabilityForm.reset();
    trainerField.hidden = true;
    await loadAvailabilities();
  } catch (error) {
    if (error.message === 'Unauthorized') {
      return;
    }
    alert(error.message || 'Unable to submit availability');
  }
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
  try {
    const response = await apiRequest('/api/schedule/assignment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unable to duplicate assignment' }));
      throw new Error(error.error || 'Unable to duplicate assignment');
    }
    await refreshSchedule();
  } catch (error) {
    if (error.message === 'Unauthorized') {
      return;
    }
    alert(error.message || 'Unable to duplicate assignment');
  }
}

async function deleteSelectedAssignment() {
  if (!selectedEventId) return;
  const confirmed = confirm('Delete this assignment from the schedule?');
  if (!confirmed) return;
  try {
    const response = await apiRequest(`/api/schedule/assignment/${selectedEventId}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unable to delete assignment' }));
      throw new Error(error.error || 'Unable to delete assignment');
    }
    selectedEventId = null;
    duplicateButton.disabled = true;
    deleteButton.disabled = true;
    await refreshSchedule({ reloadReference: true });
  } catch (error) {
    if (error.message === 'Unauthorized') {
      return;
    }
    alert(error.message || 'Unable to delete assignment');
  }
}

function showPasswordForm() {
  if (!changePasswordForm) return;
  changePasswordForm.hidden = false;
  changePasswordForm.dataset.visible = 'true';
  const currentInput = changePasswordForm.querySelector('#currentPassword');
  if (currentInput) {
    currentInput.focus();
  }
}

function hidePasswordForm() {
  if (!changePasswordForm || requirePasswordChange) return;
  changePasswordForm.reset();
  changePasswordForm.hidden = true;
  changePasswordForm.dataset.visible = 'false';
}

async function handlePasswordChange(event) {
  event.preventDefault();
  clearAdminAlert();
  const currentPassword = changePasswordForm.querySelector('#currentPassword')?.value || '';
  const newPassword = changePasswordForm.querySelector('#newPassword')?.value || '';
  if (newPassword.length < 8) {
    showAdminAlert('Choose a password that is at least 8 characters long.', 'error');
    return;
  }
  try {
    const response = await apiRequest('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || 'Unable to update password');
    }
    requirePasswordChange = false;
    if (changePasswordForm) {
      changePasswordForm.reset();
      if (!requirePasswordChange) {
        changePasswordForm.hidden = true;
        changePasswordForm.dataset.visible = 'false';
      }
    }
    updateAdminOverview();
    showAdminAlert('Password updated successfully.', 'success');
  } catch (error) {
    if (error.message === 'Unauthorized') {
      return;
    }
    showAdminAlert(error.message || 'Unable to update password.', 'error');
  }
}

async function handleCreateAdmin(event) {
  event.preventDefault();
  clearAdminAlert();
  if (newAdminCredentials) {
    newAdminCredentials.hidden = true;
    newAdminCredentials.textContent = '';
  }
  const name = document.getElementById('adminName')?.value.trim();
  const email = document.getElementById('adminEmail')?.value.trim();
  const username = document.getElementById('adminUsername')?.value.trim();
  const password = document.getElementById('adminPassword')?.value.trim();
  if (!name || !email || !username) {
    showAdminAlert('Provide name, email, and username for the new admin.', 'error');
    return;
  }
  try {
    const response = await apiRequest('/api/auth/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, username, password: password || undefined })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || 'Unable to create admin');
    }
    if (createAdminForm) {
      createAdminForm.reset();
    }
    if (newAdminCredentials && result.temporaryPassword) {
      newAdminCredentials.textContent = `Temporary password for ${result.admin?.username || username}: ${result.temporaryPassword}`;
      newAdminCredentials.hidden = false;
    }
    showAdminAlert('Admin credentials created successfully.', 'success');
    await loadAdmins();
  } catch (error) {
    if (error.message === 'Unauthorized') {
      return;
    }
    showAdminAlert(error.message || 'Unable to create admin.', 'error');
  }
}

async function handleLogout(event) {
  event.preventDefault();
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    // Ignore unauthorized redirect, as apiRequest already handled it
  } finally {
    window.location.href = 'login.html';
  }
}

function attachEventHandlers() {
  if (togglePasswordFormButton) {
    togglePasswordFormButton.addEventListener('click', () => {
      if (requirePasswordChange) {
        showPasswordForm();
        return;
      }
      const isVisible = changePasswordForm?.dataset.visible === 'true';
      if (isVisible) {
        hidePasswordForm();
      } else {
        showPasswordForm();
      }
    });
  }
  if (cancelPasswordChangeButton) {
    cancelPasswordChangeButton.addEventListener('click', (event) => {
      event.preventDefault();
      hidePasswordForm();
    });
  }
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', handlePasswordChange);
  }
  if (createAdminForm) {
    createAdminForm.addEventListener('submit', handleCreateAdmin);
  }
  if (logoutButton) {
    logoutButton.addEventListener('click', handleLogout);
  }
  internForm.addEventListener('submit', createIntern);
  availabilityForm.addEventListener('submit', submitAvailability);
  availabilityTypeSelect.addEventListener('change', handleSessionTypeChange);
  generateButton.addEventListener('click', generateSchedule);
  duplicateButton.addEventListener('click', duplicateSelectedAssignment);
  deleteButton.addEventListener('click', deleteSelectedAssignment);
  if (stationToggleButton) {
    stationToggleButton.addEventListener('click', toggleStationVisibility);
  }
  if (exportExcelButton) {
    exportExcelButton.addEventListener('click', exportScheduleAsExcel);
  }
  if (exportTeamsButton) {
    exportTeamsButton.addEventListener('click', exportScheduleForTeams);
  }
  if (availabilitySearch) {
    availabilitySearch.addEventListener('input', () => {
      renderAvailabilityTable();
    });
  }
}

function sortAssignments(assignments) {
  return assignments
    .slice()
    .sort((a, b) => {
      const dayOrder = (DAY_INDEX.get(a.day) ?? 0) - (DAY_INDEX.get(b.day) ?? 0);
      if (dayOrder !== 0) return dayOrder;
      const startComparison = a.start.localeCompare(b.start);
      if (startComparison !== 0) return startComparison;
      return (a.station || 0) - (b.station || 0);
    });
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildAssignmentDate(day, time) {
  const base = dayToDate(day);
  const [hour, minute] = time.split(':').map(Number);
  const result = new Date(base);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function escapeCsv(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function downloadCsv(filename, headers, rows) {
  const headerLine = headers.map(escapeCsv).join(',');
  const lines = rows.map((row) => row.map(escapeCsv).join(','));
  const csvContent = [headerLine, ...lines].join('\r\n');
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function formatTimeLabel(time) {
  const [hourPart, minutePart] = time.split(':');
  let hour = Number(hourPart);
  const minute = Number(minutePart);
  const period = hour >= 12 ? 'P.M.' : 'A.M.';
  hour = hour % 12 || 12;
  const minuteLabel = minute.toString().padStart(2, '0');
  return `${hour}:${minuteLabel} ${period}`;
}

function formatTimeRange(start, end) {
  return `${formatTimeLabel(start)} – ${formatTimeLabel(end)}`;
}

function exportScheduleAsExcel() {
  if (!schedule.assignments || schedule.assignments.length === 0) return;

  const headers = WEEK_DAYS.slice();
  const internMap = new Map(interns.map((intern) => [intern.id, intern]));
  const grouped = new Map();

  sortAssignments(schedule.assignments).forEach((assignment) => {
    const intern = internMap.get(assignment.internId);
    const name = intern?.name || 'Unassigned';
    if (!grouped.has(name)) {
      grouped.set(name, {
        name,
        entries: new Map()
      });
    }
    const group = grouped.get(name);
    if (!group.entries.has(assignment.day)) {
      group.entries.set(assignment.day, []);
    }
    group.entries.get(assignment.day).push(assignment);
  });

  const rows = [];
  const ordered = Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));

  ordered.forEach((group) => {
    const nameRow = [];
    const timeRow = [];

    headers.forEach((day) => {
      const entries = group.entries.get(day) || [];
      if (!entries.length) {
        nameRow.push('');
        timeRow.push('');
        return;
      }
      nameRow.push(group.name);
      const times = entries
        .slice()
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((entry) => formatTimeRange(entry.start, entry.end));
      timeRow.push(times.join('\n'));
    });

    rows.push(nameRow, timeRow);
  });

  downloadCsv('advance-scheduler-week.csv', headers, rows);
}

function exportScheduleForTeams() {
  if (!schedule.assignments || schedule.assignments.length === 0) return;
  const headers = [
    'Team member',
    'Shift start',
    'Shift end',
    'Station',
    'Session type',
    'Trainer',
    'Notes'
  ];
  const rows = sortAssignments(schedule.assignments).map((assignment) => {
    const intern = interns.find((item) => item.id === assignment.internId);
    const trainer = assignment.trainerId
      ? interns.find((item) => item.id === assignment.trainerId)
      : null;
    const startDate = buildAssignmentDate(assignment.day, assignment.start);
    const endDate = buildAssignmentDate(assignment.day, assignment.end);
    const stationLabel = assignment.station ? `Station ${assignment.station}` : '';
    const startIso = `${formatDate(startDate)}T${assignment.start}`;
    const endIso = `${formatDate(endDate)}T${assignment.end}`;
    const sessionLabel = assignment.type === 'training' ? 'Training pair' : 'Independent';
    const trainerName = trainer?.name || '';
    const notesParts = [assignment.day];
    if (stationLabel) notesParts.push(stationLabel);
    if (trainerName) notesParts.push(`Trainer: ${trainerName}`);
    return [
      intern?.name || 'Unassigned',
      startIso,
      endIso,
      stationLabel,
      sessionLabel,
      trainerName,
      notesParts.join(' • ')
    ];
  });
  downloadCsv('advance-scheduler-teams.csv', headers, rows);
}

function updateExportButtons() {
  const hasAssignments = Boolean(schedule.assignments && schedule.assignments.length > 0);
  if (exportExcelButton) {
    exportExcelButton.disabled = !hasAssignments;
  }
  if (exportTeamsButton) {
    exportTeamsButton.disabled = !hasAssignments;
  }
}

async function bootstrap() {
  attachEventHandlers();
  updateStationToggle();
  await loadSession();
  if (!currentAdmin) {
    return;
  }
  await loadAdmins();
  await loadInterns();
  await loadAvailabilities();
  await refreshSchedule();
}

bootstrap();
