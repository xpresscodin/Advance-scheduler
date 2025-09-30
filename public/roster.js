const API_BASE = '';

const rosterContainer = document.getElementById('rosterContainer');
const lastGeneratedLabel = document.getElementById('lastGenerated');

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

let interns = [];
let schedule = { assignments: [], generatedAt: null };

async function loadData() {
  try {
    const [internResponse, scheduleResponse] = await Promise.all([
      fetch(`${API_BASE}/api/interns`),
      fetch(`${API_BASE}/api/schedule`)
    ]);

    if (!internResponse.ok) {
      throw new Error('Unable to load interns');
    }
    if (!scheduleResponse.ok) {
      throw new Error('Unable to load schedule');
    }

    interns = await internResponse.json();
    schedule = await scheduleResponse.json();

    updateLastGenerated();
    renderRoster();
  } catch (error) {
    renderError(error.message || 'Unable to load roster.');
  }
}

function updateLastGenerated() {
  if (!lastGeneratedLabel) return;
  if (!schedule.generatedAt) {
    lastGeneratedLabel.textContent = 'No schedule generated yet.';
    return;
  }
  const formatted = new Date(schedule.generatedAt).toLocaleString();
  lastGeneratedLabel.textContent = `Generated on ${formatted}`;
}

function renderError(message) {
  if (!rosterContainer) return;
  rosterContainer.innerHTML = '';
  const error = document.createElement('p');
  error.className = 'muted';
  error.textContent = message;
  rosterContainer.appendChild(error);
}

function renderRoster() {
  if (!rosterContainer) return;
  rosterContainer.innerHTML = '';

  const assignments = schedule.assignments || [];
  if (assignments.length === 0) {
    renderError('Generate a schedule to review the weekly roster.');
    return;
  }

  const assignmentsByDay = new Map();
  WEEK_DAYS.forEach((day) => assignmentsByDay.set(day, []));

  assignments.forEach((assignment) => {
    const intern = interns.find((item) => item.id === assignment.internId);
    const trainer = assignment.trainerId ? interns.find((item) => item.id === assignment.trainerId) : null;
    const entry = {
      start: assignment.start,
      end: assignment.end,
      station: assignment.station,
      internName: intern?.name || 'Unassigned',
      trainerName: trainer?.name || null,
      type: assignment.type
    };
    if (!assignmentsByDay.has(assignment.day)) {
      assignmentsByDay.set(assignment.day, []);
    }
    assignmentsByDay.get(assignment.day).push(entry);
  });

  let hasAssignments = false;

  WEEK_DAYS.forEach((day) => {
    const entries = assignmentsByDay.get(day) || [];
    if (entries.length === 0) {
      return;
    }
    hasAssignments = true;

    entries.sort((a, b) => {
      if (a.start !== b.start) return a.start.localeCompare(b.start);
      if (a.station !== b.station) return String(a.station).localeCompare(String(b.station));
      return a.internName.localeCompare(b.internName);
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
    rosterContainer.appendChild(section);
  });

  if (!hasAssignments) {
    renderError('Generate a schedule to review the weekly roster.');
  }
}

loadData();
