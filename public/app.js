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
const availabilityListWrapper = document.getElementById('availabilityListWrapper');
const availabilityListTable = document.getElementById('availabilityListTable');
const availabilityListBody = document.getElementById('availabilityListBody');
const availabilityListEmpty = document.getElementById('availabilityListEmpty');
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
const referenceWeekStart = getReferenceWeekStart();
const DAY_INDEX = new Map(WEEK_DAYS.map((day, index) => [day, index]));

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

function renderAvailabilityList() {
  if (!availabilityListBody || !availabilityListEmpty || !availabilityListTable || !availabilityListWrapper) {
    return;
  }

  availabilityListBody.innerHTML = '';

  if (!availabilities.length) {
    availabilityListTable.hidden = true;
    availabilityListWrapper.hidden = true;
    availabilityListEmpty.hidden = false;
    return;
  }

  const internMap = new Map(interns.map((intern) => [intern.id, intern]));
  const sorted = availabilities
    .slice()
    .sort((a, b) => {
      const dayOrder = (DAY_INDEX.get(a.day) ?? 0) - (DAY_INDEX.get(b.day) ?? 0);
      if (dayOrder !== 0) return dayOrder;
      const startOrder = a.start.localeCompare(b.start);
      if (startOrder !== 0) return startOrder;
      const internNameA = internMap.get(a.internId)?.name || a.internId;
      const internNameB = internMap.get(b.internId)?.name || b.internId;
      return internNameA.localeCompare(internNameB);
    });

  sorted.forEach((entry) => {
    const row = document.createElement('tr');
    const intern = internMap.get(entry.internId);
    const trainer = entry.trainerId ? internMap.get(entry.trainerId) : null;

    const cells = [
      intern?.name || 'Unknown intern',
      entry.day,
      entry.start,
      entry.end,
      entry.sessionType === 'training' ? 'Training' : 'Independent',
      trainer?.name || (entry.sessionType === 'training' ? 'Trainer pending' : ''),
      entry.notes || ''
    ];

    cells.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    });

    availabilityListBody.appendChild(row);
  });

  availabilityListTable.hidden = false;
  availabilityListWrapper.hidden = false;
  availabilityListEmpty.hidden = true;
}

function renderAvailabilityTable() {
  if (availabilityAccordion) {
    availabilityAccordion.innerHTML = '';
  }

  renderAvailabilityList();

  if (!availabilityAccordion) return;

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
    const summaryContent = document.createElement('div');
    summaryContent.className = 'availability-accordion-summary-content';
    const summaryName = document.createElement('span');
    summaryName.className = 'availability-accordion-name';
    summaryName.textContent = intern.name;
    summaryContent.appendChild(summaryName);

    const previewText = buildAvailabilityPreview(entries);
    if (previewText) {
      const preview = document.createElement('span');
      preview.className = 'availability-accordion-preview';
      preview.textContent = previewText;
      summaryContent.appendChild(preview);
    }

    summary.appendChild(summaryContent);

    const summaryMeta = document.createElement('div');
    summaryMeta.className = 'availability-accordion-meta';
    const summaryCount = document.createElement('span');
    summaryCount.className = 'availability-accordion-count';
    summaryCount.textContent = `${entries.length} ${entries.length === 1 ? 'window' : 'windows'}`;
    const chevron = document.createElement('span');
    chevron.className = 'availability-accordion-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▾';
    summaryMeta.appendChild(summaryCount);
    summaryMeta.appendChild(chevron);
    summary.appendChild(summaryMeta);
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
    if (entries.length <= 3) {
      details.open = true;
    }
    availabilityAccordion.appendChild(details);
  });
}

function buildAvailabilityPreview(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return '';
  }
  const previewEntries = entries
    .slice()
    .sort((a, b) => {
      const dayIndexA = DAY_INDEX.get(a.day) ?? 0;
      const dayIndexB = DAY_INDEX.get(b.day) ?? 0;
      const dayOrder = dayIndexA - dayIndexB;
      if (dayOrder !== 0) return dayOrder;
      return a.start.localeCompare(b.start);
    })
    .slice(0, 2)
    .map((entry) => {
      const dayLabel = entry.day.slice(0, 3);
      const trainerName =
        entry.sessionType === 'training' && entry.trainerId
          ? interns.find((intern) => intern.id === entry.trainerId)?.name
          : null;
      const typeSuffix =
        entry.sessionType === 'training'
          ? trainerName
            ? ` (Training w/ ${trainerName})`
            : ' (Training)'
          : '';
      return `${dayLabel} ${entry.start} – ${entry.end}${typeSuffix}`;
    });
  const remaining = entries.length - previewEntries.length;
  if (remaining > 0) {
    previewEntries.push(`+${remaining} more`);
  }
  return previewEntries.join(', ');
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
  updateExportButtons();
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
  if (exportExcelButton) {
    exportExcelButton.addEventListener('click', exportScheduleAsExcel);
  }
  if (exportTeamsButton) {
    exportTeamsButton.addEventListener('click', exportScheduleForTeams);
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

function exportScheduleAsExcel() {
  if (!schedule.assignments || schedule.assignments.length === 0) return;
  const headers = ['Day', 'Date', 'Start', 'End', 'Intern', 'Trainer', 'Station', 'Session type', 'Source'];
  const rows = sortAssignments(schedule.assignments).map((assignment) => {
    const intern = interns.find((item) => item.id === assignment.internId);
    const trainer = assignment.trainerId
      ? interns.find((item) => item.id === assignment.trainerId)
      : null;
    const startDate = buildAssignmentDate(assignment.day, assignment.start);
    const endDate = buildAssignmentDate(assignment.day, assignment.end);
    return [
      assignment.day,
      formatDate(startDate),
      assignment.start,
      assignment.end,
      intern?.name || 'Unassigned',
      trainer?.name || '',
      assignment.station ? `Station ${assignment.station}` : '',
      assignment.type === 'training' ? 'Training pair' : 'Independent',
      assignment.source === 'manual' ? 'Manual edit' : 'Auto-generated'
    ];
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
  await loadInterns();
  await loadAvailabilities();
  await refreshSchedule();
}

bootstrap();
