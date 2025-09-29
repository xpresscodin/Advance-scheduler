const http = require('http');
const fs = require('fs');
const path = require('path');

 codex/create-web-application-for-schedule-management-veybv8
const DEFAULT_DATA_PATH = path.join(__dirname, 'data', 'store.json');
const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'advance-scheduler') : path.join(__dirname, 'data');
const DATA_PATH = path.join(DATA_DIR, 'store.json');
 
 codex/create-web-application-for-schedule-management-fa0x4a
const DEFAULT_DATA_PATH = path.join(__dirname, 'data', 'store.json');
const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'advance-scheduler') : path.join(__dirname, 'data');
const DATA_PATH = path.join(DATA_DIR, 'store.json');

codex/create-web-application-for-schedule-management-ew0h25
const DEFAULT_DATA_PATH = path.join(__dirname, 'data', 'store.json');
const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'advance-scheduler') : path.join(__dirname, 'data');
const DATA_PATH = path.join(DATA_DIR, 'store.json');

const DATA_PATH = path.join(__dirname, 'data', 'store.json');
 main
 main
 main
const CLIENT_DIR = path.join(__dirname, '..', 'client');
const PORT = process.env.PORT || 3000;

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function ensureStore() {
 codex/create-web-application-for-schedule-management-veybv8
 
codex/create-web-application-for-schedule-management-fa0x4a

codex/create-web-application-for-schedule-management-ew0h25
 main
 main
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DATA_PATH)) {
    return;
  }

  if (process.env.VERCEL && fs.existsSync(DEFAULT_DATA_PATH)) {
    fs.copyFileSync(DEFAULT_DATA_PATH, DATA_PATH);
    return;
  }

  const initial = {
    interns: [],
    availabilities: [],
    schedule: { assignments: [], generatedAt: null, openSlots: [] },
    settings: { maxStations: 9, dayStart: '07:00', dayEnd: '22:00' }
  };
  fs.writeFileSync(DATA_PATH, JSON.stringify(initial, null, 2));
  codex/create-web-application-for-schedule-management-veybv8
 
 codex/create-web-application-for-schedule-management-fa0x4a


  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(DATA_PATH, JSON.stringify({
      interns: [],
      availabilities: [],
      schedule: { assignments: [], generatedAt: null, openSlots: [] },
      settings: { maxStations: 9, dayStart: '07:00', dayEnd: '22:00' }
    }, null, 2));
  }
main
 main
  main
}

function readStore() {
  ensureStore();
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  return JSON.parse(raw);
}

function writeStore(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.connection.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
  });
}

function sendJSON(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(payload);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(text);
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html';
    case '.css':
      return 'text/css';
    case '.js':
      return 'application/javascript';
    case '.json':
      return 'application/json';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function timeToNumber(timeStr) {
  const [hour, minute] = timeStr.split(':').map(Number);
  return hour + minute / 60;
}

function formatHourLabel(hour) {
  const end = hour + 1;
  const toLabel = (value) => {
    const period = value >= 12 ? 'P.M.' : 'A.M.';
    const normalized = value % 12 === 0 ? 12 : value % 12;
    return `${normalized}:00 ${period}`;
  };
  return `${toLabel(hour)} – ${toLabel(end)}`;
}

function pad(num) {
  return num.toString().padStart(2, '0');
}

function numberToTime(num) {
  const hour = Math.floor(num);
  const minute = Math.round((num - hour) * 60);
  return `${pad(hour)}:${pad(minute)}`;
}

function getHourSlots(day, start, end) {
  const slots = [];
  let cursor = timeToNumber(start);
  const endNum = timeToNumber(end);
  while (cursor < endNum) {
    slots.push({ day, hour: cursor });
    cursor += 1;
  }
  return slots;
}

function generateId(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildSchedule(data) {
  const { interns, availabilities, settings } = data;
  const maxStations = settings?.maxStations || 9;
  const internMap = Object.fromEntries(interns.map((intern) => [intern.id, intern]));

  const assignedHours = {};
  const requestedHours = {};
  interns.forEach((intern) => {
    assignedHours[intern.id] = 0;
    requestedHours[intern.id] = 0;
  });

  const slotCandidates = new Map();
  availabilities.forEach((availability) => {
    const { internId, day, start, end } = availability;
    const intern = internMap[internId];
    if (!intern) return;
    const slots = getHourSlots(day, start, end);
    requestedHours[internId] = (requestedHours[internId] || 0) + slots.length;
    slots.forEach(({ day: slotDay, hour }) => {
      const key = `${slotDay}-${hour}`;
      if (!slotCandidates.has(key)) {
        slotCandidates.set(key, []);
      }
      slotCandidates.get(key).push({
        availability,
        intern,
        hour
      });
    });
  });

  const assignments = [];
  const openSlots = [];
  const waitlistedBySlot = {};

  const scheduledParticipants = new Map();

  function sortCandidates(candidates) {
    return candidates.sort((a, b) => {
      const aAssigned = assignedHours[a.intern.id] || 0;
      const bAssigned = assignedHours[b.intern.id] || 0;
      const aRequested = requestedHours[a.intern.id] || 1;
      const bRequested = requestedHours[b.intern.id] || 1;
      const aRatio = aAssigned / aRequested;
      const bRatio = bAssigned / bRequested;
      if (aRatio !== bRatio) {
        return aRatio - bRatio;
      }
      if (aAssigned !== bAssigned) {
        return aAssigned - bAssigned;
      }
      return a.intern.name.localeCompare(b.intern.name);
    });
  }

  function canPlaceParticipant(participantId, key) {
    if (!participantId) return true;
    const scheduled = scheduledParticipants.get(key);
    if (!scheduled) return true;
    return !scheduled.has(participantId);
  }

  function markParticipants(participants, key) {
    if (!scheduledParticipants.has(key)) {
      scheduledParticipants.set(key, new Set());
    }
    const store = scheduledParticipants.get(key);
    participants.forEach((id) => id && store.add(id));
  }

  const orderedKeys = Array.from(slotCandidates.keys()).sort((a, b) => {
    const [dayA, hourA] = a.split('-');
    const [dayB, hourB] = b.split('-');
    const dayComparison = DAY_ORDER.indexOf(dayA) - DAY_ORDER.indexOf(dayB);
    if (dayComparison !== 0) return dayComparison;
    return Number(hourA) - Number(hourB);
  });

  orderedKeys.forEach((key) => {
    const [day, hour] = key.split('-');
    const numericHour = Number(hour);
    const candidates = slotCandidates.get(key) || [];
    const trainingCandidates = candidates.filter((item) => item.availability.sessionType === 'training');
    const independentCandidates = candidates.filter((item) => item.availability.sessionType !== 'training');

    const slotAssignments = [];

    // Process training sessions first to guarantee trainer pairing.
    trainingCandidates.forEach((candidate) => {
      const { availability, intern } = candidate;
      const trainer = internMap[availability.trainerId];
      if (!trainer) {
        return;
      }
      const trainerAvailability = availabilities.find((entry) => entry.internId === trainer.id && entry.day === day && timeToNumber(entry.start) <= numericHour && timeToNumber(entry.end) > numericHour);
      if (!trainerAvailability) {
        return;
      }
      if (!canPlaceParticipant(intern.id, key) || !canPlaceParticipant(trainer.id, key)) {
        return;
      }
      slotAssignments.push({
        id: generateId('assign'),
        day,
        hour: numericHour,
        start: numberToTime(numericHour),
        end: numberToTime(numericHour + 1),
        station: slotAssignments.length + 1,
        internId: intern.id,
        trainerId: trainer.id,
        type: 'training',
        source: 'auto'
      });
      assignedHours[intern.id] = (assignedHours[intern.id] || 0) + 1;
      assignedHours[trainer.id] = (assignedHours[trainer.id] || 0) + 1;
      markParticipants([intern.id, trainer.id], key);
    });

    const remainingCapacity = Math.max(maxStations - slotAssignments.length, 0);
    const sortedIndependent = sortCandidates(independentCandidates);

    const waitlisted = [];
    sortedIndependent.forEach((candidate, index) => {
      if (slotAssignments.length >= maxStations) {
        waitlisted.push(candidate.intern.id);
        return;
      }
      const { intern } = candidate;
      if (!canPlaceParticipant(intern.id, key)) {
        waitlisted.push(intern.id);
        return;
      }
      slotAssignments.push({
        id: generateId('assign'),
        day,
        hour: numericHour,
        start: numberToTime(numericHour),
        end: numberToTime(numericHour + 1),
        station: slotAssignments.length + 1,
        internId: intern.id,
        trainerId: null,
        type: 'independent',
        source: 'auto'
      });
      assignedHours[intern.id] = (assignedHours[intern.id] || 0) + 1;
      markParticipants([intern.id], key);
    });

    if (waitlisted.length) {
      waitlistedBySlot[key] = waitlisted;
    }

    slotAssignments.forEach((assignment) => {
      assignments.push(assignment);
    });

    const open = Math.max(maxStations - slotAssignments.length, 0);
    if (open > 0) {
      openSlots.push({
        day,
        hour: numericHour,
        start: numberToTime(numericHour),
        end: numberToTime(numericHour + 1),
        availableStations: open
      });
    }
  });

  const totalsByIntern = interns.map((intern) => ({
    internId: intern.id,
    name: intern.name,
    requestedHours: requestedHours[intern.id] || 0,
    assignedHours: assignedHours[intern.id] || 0
  }));

  const daySummaries = {};
  assignments.forEach((assignment) => {
    if (!daySummaries[assignment.day]) {
      daySummaries[assignment.day] = { assignments: 0, trainings: 0 };
    }
    daySummaries[assignment.day].assignments += 1;
    if (assignment.type === 'training') {
      daySummaries[assignment.day].trainings += 1;
    }
  });

  return {
    assignments,
    openSlots,
    totalsByIntern,
    waitlistedBySlot,
    daySummaries
  };
}

function getAssignmentsByHour(assignments, day, start, end, ignoreId) {
  const startNum = timeToNumber(start);
  const endNum = timeToNumber(end);
  return assignments.filter((assignment) => {
    if (assignment.id === ignoreId) return false;
    if (assignment.day !== day) return false;
    const assignmentStart = timeToNumber(assignment.start);
    const assignmentEnd = timeToNumber(assignment.end);
    return assignmentStart < endNum && assignmentEnd > startNum;
  });
}

function validateAssignmentPlacement(data, candidate, ignoreId = null) {
  const { schedule, settings } = data;
  const maxStations = settings?.maxStations || 9;
  const assignments = schedule.assignments || [];
  const participants = new Set([candidate.internId, candidate.trainerId].filter(Boolean));
  const overlapping = getAssignmentsByHour(assignments, candidate.day, candidate.start, candidate.end, ignoreId);

  for (const assignment of overlapping) {
    const otherParticipants = new Set([assignment.internId, assignment.trainerId].filter(Boolean));
    for (const participant of participants) {
      if (otherParticipants.has(participant)) {
        return { ok: false, reason: 'Participant is already assigned during this time block.' };
      }
    }
  }

  const hourSlots = getHourSlots(candidate.day, candidate.start, candidate.end);
  for (const slot of hourSlots) {
    const keyAssignments = overlapping.filter((assignment) => timeToNumber(assignment.start) <= slot.hour && timeToNumber(assignment.end) > slot.hour);
    const stationCount = keyAssignments.length;
    if (stationCount >= maxStations) {
      return { ok: false, reason: 'All stations are occupied during at least one hour in this range.' };
    }
  }
  return { ok: true };
}

 codex/create-web-application-for-schedule-management-veybv8
async function handleRequest(req, res) {
 
 codex/create-web-application-for-schedule-management-fa0x4a
async function handleRequest(req, res) {

codex/create-web-application-for-schedule-management-ew0h25
async function handleRequest(req, res) {

const server = http.createServer(async (req, res) => {
main
 main
 main
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  try {
    if (pathname === '/api/settings' && req.method === 'GET') {
      const data = readStore();
      return sendJSON(res, 200, data.settings || {});
    }

    if (pathname === '/api/interns' && req.method === 'GET') {
      const data = readStore();
      return sendJSON(res, 200, data.interns || []);
    }

    if (pathname === '/api/interns' && req.method === 'POST') {
      const payload = await parseBody(req);
      if (!payload.name) {
        return sendJSON(res, 400, { error: 'Name is required.' });
      }
      const data = readStore();
      const intern = {
        id: generateId('intern'),
        name: payload.name,
        isTrainer: Boolean(payload.isTrainer),
        requiresTrainer: Boolean(payload.requiresTrainer)
      };
      data.interns.push(intern);
      writeStore(data);
      return sendJSON(res, 201, intern);
    }

    if (pathname === '/api/availabilities' && req.method === 'GET') {
      const data = readStore();
      return sendJSON(res, 200, data.availabilities || []);
    }

    if (pathname === '/api/availabilities' && req.method === 'POST') {
      const payload = await parseBody(req);
 codex/create-web-application-for-schedule-management-veybv8
 
codex/create-web-application-for-schedule-management-fa0x4a

codex/create-web-application-for-schedule-management-ew0h25
 main
 main
      const data = readStore();

      let entries = Array.isArray(payload.entries) ? payload.entries : [];
      if (entries.length === 0) {
        entries = [
          {
            internId: payload.internId,
            day: payload.day,
            start: payload.start,
            end: payload.end,
            sessionType: payload.sessionType,
            trainerId: payload.trainerId,
            notes: payload.notes
          }
        ];
      }

      if (!entries.length) {
        return sendJSON(res, 400, { error: 'At least one availability window is required.' });
      }

      const created = [];

      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index] || {};
        const internId = entry.internId || payload.internId;
        if (!internId) {
          return sendJSON(res, 400, { error: `Entry ${index + 1}: Intern is required.` });
        }
        const intern = data.interns.find((item) => item.id === internId);
        if (!intern) {
          return sendJSON(res, 404, { error: `Entry ${index + 1}: Intern not found.` });
        }

        const day = entry.day || payload.day;
        const start = entry.start || payload.start;
        const end = entry.end || payload.end;
        if (!day || !start || !end) {
          return sendJSON(res, 400, { error: `Entry ${index + 1}: Day, start and end are required.` });
        }

        const startNum = timeToNumber(start);
        const endNum = timeToNumber(end);
        if (Number.isNaN(startNum) || Number.isNaN(endNum) || endNum <= startNum) {
          return sendJSON(res, 400, { error: `Entry ${index + 1}: End time must be later than start time.` });
        }

        const sessionTypeValue = entry.sessionType || payload.sessionType;
        const sessionType = sessionTypeValue === 'training' ? 'training' : 'independent';
        const trainerId = sessionType === 'training' ? entry.trainerId || payload.trainerId : null;
        if (sessionType === 'training' && !trainerId) {
          return sendJSON(res, 400, { error: `Entry ${index + 1}: Training sessions require a trainer.` });
        }

        const rawNotes = entry.notes !== undefined ? entry.notes : payload.notes;
        const notes = typeof rawNotes === 'string' ? rawNotes.trim() : '';

        created.push({
          id: generateId('availability'),
          internId,
          day,
          start,
          end,
          sessionType,
          trainerId: sessionType === 'training' ? trainerId : null,
          notes
        });
      }

      data.availabilities.push(...created);
      writeStore(data);

      if (created.length === 1 && !Array.isArray(payload.entries)) {
        return sendJSON(res, 201, created[0]);
      }

      return sendJSON(res, 201, { created });
  codex/create-web-application-for-schedule-management-veybv8
 
 codex/create-web-application-for-schedule-management-fa0x4a


      if (!payload.internId || !payload.day || !payload.start || !payload.end) {
        return sendJSON(res, 400, { error: 'Intern, day, start and end are required.' });
      }
      const data = readStore();
      const intern = data.interns.find((item) => item.id === payload.internId);
      if (!intern) {
        return sendJSON(res, 404, { error: 'Intern not found.' });
      }
      const startNum = timeToNumber(payload.start);
      const endNum = timeToNumber(payload.end);
      if (endNum <= startNum) {
        return sendJSON(res, 400, { error: 'End time must be later than start time.' });
      }
      if (payload.sessionType === 'training' && !payload.trainerId) {
        return sendJSON(res, 400, { error: 'Training sessions require a trainer.' });
      }
      const availability = {
        id: generateId('availability'),
        internId: payload.internId,
        day: payload.day,
        start: payload.start,
        end: payload.end,
        sessionType: payload.sessionType === 'training' ? 'training' : 'independent',
        trainerId: payload.sessionType === 'training' ? payload.trainerId : null,
        notes: payload.notes || ''
      };
      data.availabilities.push(availability);
      writeStore(data);
      return sendJSON(res, 201, availability);
 main
 main
  main
    }

    if (pathname.startsWith('/api/availabilities/') && req.method === 'DELETE') {
      const id = pathname.split('/').pop();
      const data = readStore();
      const before = data.availabilities.length;
      data.availabilities = data.availabilities.filter((item) => item.id !== id);
      if (data.availabilities.length === before) {
        return sendJSON(res, 404, { error: 'Availability not found.' });
      }
      writeStore(data);
      return sendJSON(res, 200, { success: true });
    }

    if (pathname === '/api/schedule' && req.method === 'GET') {
      const data = readStore();
      return sendJSON(res, 200, data.schedule || { assignments: [], openSlots: [] });
    }

    if (pathname === '/api/schedule/generate' && req.method === 'POST') {
      const data = readStore();
      const result = buildSchedule(data);
      data.schedule = {
        assignments: result.assignments,
        openSlots: result.openSlots,
        totalsByIntern: result.totalsByIntern,
        waitlistedBySlot: result.waitlistedBySlot,
        daySummaries: result.daySummaries,
        generatedAt: new Date().toISOString()
      };
      writeStore(data);
      return sendJSON(res, 200, data.schedule);
    }

    if (pathname.startsWith('/api/schedule/assignment/') && req.method === 'PUT') {
      const id = pathname.split('/').pop();
      const payload = await parseBody(req);
      const data = readStore();
      const assignment = data.schedule.assignments.find((item) => item.id === id);
      if (!assignment) {
        return sendJSON(res, 404, { error: 'Assignment not found.' });
      }
      const candidate = {
        ...assignment,
        day: payload.day || assignment.day,
        start: payload.start || assignment.start,
        end: payload.end || assignment.end,
        station: payload.station || assignment.station
      };
      const validation = validateAssignmentPlacement(data, candidate, id);
      if (!validation.ok) {
        return sendJSON(res, 400, { error: validation.reason });
      }
      Object.assign(assignment, candidate, { source: 'manual' });
      writeStore(data);
      return sendJSON(res, 200, assignment);
    }

    if (pathname === '/api/schedule/assignment' && req.method === 'POST') {
      const payload = await parseBody(req);
      const data = readStore();
      if (!payload.internId || !payload.day || !payload.start || !payload.end) {
        return sendJSON(res, 400, { error: 'Intern, day, start and end are required.' });
      }
      const assignment = {
        id: generateId('assign'),
        internId: payload.internId,
        trainerId: payload.trainerId || null,
        type: payload.trainerId ? 'training' : 'independent',
        day: payload.day,
        start: payload.start,
        end: payload.end,
        station: payload.station || (data.schedule.assignments.length % (data.settings?.maxStations || 9)) + 1,
        source: 'manual'
      };
      const validation = validateAssignmentPlacement(data, assignment, null);
      if (!validation.ok) {
        return sendJSON(res, 400, { error: validation.reason });
      }
      data.schedule.assignments.push(assignment);
      writeStore(data);
      return sendJSON(res, 201, assignment);
    }

    if (pathname.startsWith('/api/schedule/assignment/') && req.method === 'DELETE') {
      const id = pathname.split('/').pop();
      const data = readStore();
      const before = data.schedule.assignments.length;
      data.schedule.assignments = data.schedule.assignments.filter((item) => item.id !== id);
      if (data.schedule.assignments.length === before) {
        return sendJSON(res, 404, { error: 'Assignment not found.' });
      }
      writeStore(data);
      return sendJSON(res, 200, { success: true });
    }

    // Static assets
    let filePath = path.join(CLIENT_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!filePath.startsWith(CLIENT_DIR)) {
      return sendText(res, 403, 'Forbidden');
    }
    fs.readFile(filePath, (err, content) => {
      if (err) {
        sendText(res, 404, 'Not Found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': getMimeType(filePath),
        'Access-Control-Allow-Origin': '*'
      });
      res.end(content);
    });
  } catch (error) {
    console.error('Server error', error);
    sendJSON(res, 500, { error: 'Internal server error', details: error.message });
  }
 codex/create-web-application-for-schedule-management-veybv8
 
 codex/create-web-application-for-schedule-management-fa0x4a

codex/create-web-application-for-schedule-management-ew0h25
 main
  main
}

function createServer() {
  return http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      console.error('Unhandled server error', error);
      if (!res.headersSent) {
        sendJSON(res, 500, { error: 'Internal server error', details: error.message });
      } else {
        res.end();
      }
    });
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`Advance Scheduler API running on http://localhost:${PORT}`);
  });
}

module.exports = handleRequest;
module.exports.createServer = createServer;
 codex/create-web-application-for-schedule-management-veybv8
 
codex/create-web-application-for-schedule-management-fa0x4a


});

server.listen(PORT, () => {
  console.log(`Advance Scheduler API running on http://localhost:${PORT}`);
});
main
 main
  main
