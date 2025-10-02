const API_BASE = '';

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const calendarElement = document.getElementById('calendar');
const adminAlert = document.getElementById('adminAlert');
const adminWelcome = document.getElementById('adminWelcome');
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
const dayViewCountsContainer = document.getElementById('dayViewCounts');
const dayViewCountBody = document.getElementById('dayViewCountBody');
const dayViewCountTitle = document.getElementById('dayViewCountTitle');

let interns = [];
let availabilities = [];
let schedule = { assignments: [], openSlots: [], totalsByIntern: [] };
let calendar;
let selectedEventId = null;
let selectedEventElement = null;
let showStations = true;
let currentAdmin = null;
let requirePasswordChange = false;
const referenceWeekStart = getReferenceWeekStart();
const DAY_INDEX = new Map(WEEK_DAYS.map((day, index) => [day, index]));

if (changePasswordForm) {
  changePasswordForm.dataset.visible = 'false';
}

function timeToNumber(time) {
  if (!time) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return hours + minutes / 60;
}

function numberToTime(value) {
  const hour = Math.floor(value);
  const minute = Math.round((value - hour) * 60);
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
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
  if (!adminWelcome) {
    return;
  }

  if (!currentAdmin) {
    adminWelcome.textContent = '';
    return;
  }

  adminWelcome.textContent = currentAdmin.name;

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
    slotDuration: '00:30:00',
    slotLabelInterval: { hours: 1 },
    allDaySlot: false,
    editable: true,
    droppable: false,
    eventDurationEditable: false,
    firstDay: 1,
    expandRows: true,
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
    viewDidMount(info) {
      updateDayViewCounts(info.view);
    },
    datesSet(info) {
      updateDayViewCounts(info.view);
    },
    eventsSet() {
      updateDayViewCounts(calendar.view);
      reapplySelectedEventHighlight();
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
      info.jsEvent.preventDefault();
      selectedEventId = info.event.id;
      applyEventSelection(info.el);
      updateSelectionButtons();
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
      info.el.dataset.eventId = info.event.id;
      if (info.event.id === selectedEventId) {
        applyEventSelection(info.el);
      } else {
        info.el.classList.remove('selected');
      }

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
  updateDayViewCounts(calendar.view);
  reapplySelectedEventHighlight();
}

function applyEventSelection(element) {
  if (selectedEventElement && selectedEventElement !== element) {
    selectedEventElement.classList.remove('selected');
  }
  if (element) {
    element.classList.add('selected');
  }
  selectedEventElement = element || null;
}

function updateSelectionButtons() {
  const hasSelection = Boolean(selectedEventId);
  if (duplicateButton) {
    duplicateButton.disabled = !hasSelection;
  }
  if (deleteButton) {
    deleteButton.disabled = !hasSelection;
  }
}

function clearSelectedEvent() {
  if (selectedEventElement) {
    selectedEventElement.classList.remove('selected');
    selectedEventElement = null;
  }
  selectedEventId = null;
  updateSelectionButtons();
}

function reapplySelectedEventHighlight() {
  if (!selectedEventId || !calendarElement) {
    return;
  }
  const selector = `.schedule-event[data-event-id="${selectedEventId}"]`;
  const element = calendarElement.querySelector(selector);
  if (element) {
    applyEventSelection(element);
  } else {
    clearSelectedEvent();
  }
}

function computeDayHourCounts(day) {
  const counts = new Map();
  (schedule.assignments || []).forEach((assignment) => {
    if (assignment.day !== day) return;
    let cursor = timeToNumber(assignment.start);
    const end = timeToNumber(assignment.end);
    while (cursor < end) {
      const nextBoundary = Math.min(Math.floor(cursor) + 1, end);
      const next = nextBoundary <= cursor ? cursor + 1 : nextBoundary;
      const startKey = numberToTime(cursor);
      const endKey = numberToTime(next);
      const key = `${startKey}-${endKey}`;
      const increment = assignment.trainerId ? 2 : 1;
      if (!counts.has(key)) {
        counts.set(key, {
          count: 0,
          start: cursor,
          end: next
        });
      }
      const existing = counts.get(key);
      existing.count += increment;
      cursor = next;
    }
  });
  return Array.from(counts.entries())
    .map(([range, info]) => ({
      range,
      count: info.count,
      start: info.start,
      end: info.end,
      duration: info.end - info.start
    }))
    .sort((a, b) => a.start - b.start);
}

function updateDayViewCounts(view) {
  if (!dayViewCountsContainer || !dayViewCountBody || !view) {
    return;
  }
  const isDayView = view.type === 'timeGridDay';
  if (!isDayView) {
    dayViewCountsContainer.hidden = true;
    dayViewCountBody.innerHTML = '';
    return;
  }
  const dayIndex = view.currentStart.getDay();
  const normalized = dayIndex === 0 ? 6 : dayIndex - 1;
  const dayName = WEEK_DAYS[normalized];
  const counts = computeDayHourCounts(dayName);
  if (dayViewCountTitle) {
    dayViewCountTitle.textContent = `${dayName} coverage`;
  }
  dayViewCountBody.innerHTML = '';
  if (!counts.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 2;
    cell.textContent = 'No assignments scheduled for this day.';
    row.appendChild(cell);
    dayViewCountBody.appendChild(row);
    dayViewCountsContainer.hidden = false;
    return;
  }

  let maxCount = 0;

  counts.forEach(({ range, count }) => {
    const [start, end] = range.split('-');
    const row = document.createElement('tr');
    const hourCell = document.createElement('td');
    hourCell.textContent = formatTimeRange(start, end);
    const countCell = document.createElement('td');
    countCell.textContent = count === 1 ? '1 person' : `${count} people`;
    row.appendChild(hourCell);
    row.appendChild(countCell);
    dayViewCountBody.appendChild(row);
    if (count > maxCount) {
      maxCount = count;
    }
  });

  const summaryRow = document.createElement('tr');
  summaryRow.classList.add('day-counts-summary');
  const labelCell = document.createElement('td');
  labelCell.textContent = 'Max at any hour';
  const valueCell = document.createElement('td');
  valueCell.textContent = maxCount === 1 ? '1 person' : `${maxCount} people`;
  summaryRow.appendChild(labelCell);
  summaryRow.appendChild(valueCell);
  dayViewCountBody.appendChild(summaryRow);

  dayViewCountsContainer.hidden = false;
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
    clearSelectedEvent();
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
    clearSelectedEvent();
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

function downloadExcelHtml(filename, html) {
  const blob = new Blob([`\uFEFF${html}`], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mergeExcelEntries(entries) {
  if (!entries || entries.length === 0) return [];
  const sorted = entries.slice().sort((a, b) => a.start.localeCompare(b.start));
  const merged = [];
  sorted.forEach((entry) => {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.end === entry.start &&
      previous.type === entry.type &&
      previous.trainerName === entry.trainerName
    ) {
      previous.end = entry.end;
    } else {
      merged.push({ ...entry });
    }
  });
  return merged;
}

function resolveExcelCellStyle(entries) {
  let background = '#1d4ed8';
  let foreground = '#eff6ff';

  if (entries.some((entry) => entry.type === 'training')) {
    background = '#7c3aed';
    foreground = '#f8f5ff';
  } else if (entries.some((entry) => timeToNumber(entry.end) >= 19)) {
    background = '#dc2626';
    foreground = '#fff7ed';
  } else if (entries.some((entry) => Math.round(timeToNumber(entry.start)) === 7)) {
    background = '#15803d';
    foreground = '#f0fdf4';
  }

  return `background:${background};color:${foreground};border:1px solid #cbd5f5;`;
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

  schedule.assignments.forEach((assignment) => {
    const intern = internMap.get(assignment.internId);
    const trainer = assignment.trainerId ? internMap.get(assignment.trainerId) : null;
    const name = intern?.name || 'Unassigned';
    if (!grouped.has(name)) {
      grouped.set(name, { name, entries: new Map() });
    }
    const group = grouped.get(name);
    if (!group.entries.has(assignment.day)) {
      group.entries.set(assignment.day, []);
    }
    group.entries.get(assignment.day).push({
      start: assignment.start,
      end: assignment.end,
      type: assignment.type,
      trainerName: trainer?.name || ''
    });
  });

  const ordered = Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));

  let tableRows = '';

  ordered.forEach((group) => {
    const nameCells = [];
    const timeCells = [];

    headers.forEach((day) => {
      const mergedEntries = mergeExcelEntries(group.entries.get(day) || []);
      if (!mergedEntries.length) {
        nameCells.push('<td></td>');
        timeCells.push('<td></td>');
        return;
      }
      const style = resolveExcelCellStyle(mergedEntries);
      nameCells.push(`<td style="${style}font-weight:600;">${escapeHtml(group.name)}</td>`);
      const lines = mergedEntries
        .map((entry) => {
          const rangeLabel = formatTimeRange(entry.start, entry.end);
          if (entry.type === 'training' && entry.trainerName) {
            return `${escapeHtml(rangeLabel)}<br/><span style="font-size:11px;font-weight:500;">Training w/ ${escapeHtml(entry.trainerName)}</span>`;
          }
          return escapeHtml(rangeLabel);
        })
        .join('<br/>');
      timeCells.push(`<td style="${style}">${lines}</td>`);
    });

    tableRows += `<tr>${nameCells.join('')}</tr><tr>${timeCells.join('')}</tr>`;
  });

  if (!tableRows) {
    tableRows = `<tr><td colspan="${headers.length}" style="text-align:center; padding:12px;">No assignments scheduled.</td></tr>`;
  }

  const headerRow = headers.map((day) => `<th>${day}</th>`).join('');

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: 'Segoe UI', Arial, sans-serif; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #cbd5f5; padding: 8px; vertical-align: top; font-size: 12px; }
      th { background: #0f172a; color: #f8fafc; font-size: 13px; }
    </style>
  </head>
  <body>
    <table>
      <thead><tr>${headerRow}</tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </body>
</html>`;

  downloadExcelHtml('advance-scheduler-week.xls', html);
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
  updateSelectionButtons();
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
