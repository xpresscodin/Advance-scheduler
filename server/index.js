const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_PATH = path.join(DATA_DIR, 'store.json');
const CLIENT_DIR = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SESSION_DURATION_MS = 1000 * 60 * 60 * 12;
const MAX_FAILED_ATTEMPTS = 5;

const sessions = new Map();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, admin) {
  if (!admin?.passwordHash || !admin?.passwordSalt) {
    return false;
  }
  try {
    const derived = crypto.scryptSync(password, admin.passwordSalt, 64);
    const stored = Buffer.from(admin.passwordHash, 'hex');
    if (derived.length !== stored.length) {
      return false;
    }
    return crypto.timingSafeEqual(derived, stored);
  } catch (error) {
    return false;
  }
}

function generateTemporaryPassword() {
  return `Temp-${crypto.randomBytes(4).toString('hex')}`;
}

function sanitizeAdmin(admin) {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    username: admin.username,
    requirePasswordChange: Boolean(admin.requirePasswordChange)
  };
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return header.split(';').reduce((acc, part) => {
    const [name, ...valueParts] = part.trim().split('=');
    if (!name) return acc;
    acc[name] = decodeURIComponent(valueParts.join('='));
    return acc;
  }, {});
}

function createSession(adminId) {
  const sessionId = crypto.randomBytes(18).toString('hex');
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  sessions.set(sessionId, { adminId, expiresAt });
  return { sessionId, expiresAt };
}

function destroySession(sessionId) {
  if (sessionId) {
    sessions.delete(sessionId);
  }
}

function getSessionInfo(req, data) {
  const cookies = parseCookies(req);
  const sid = cookies.sid;
  if (!sid) return null;
  const entry = sessions.get(sid);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    sessions.delete(sid);
    return null;
  }
  entry.expiresAt = Date.now() + SESSION_DURATION_MS;
  const admin = (data.admins || []).find((item) => item.id === entry.adminId);
  if (!admin) {
    sessions.delete(sid);
    return null;
  }
  return { admin, sessionId: sid };
}

function createSeedAdmin() {
  const { hash, salt } = hashPassword('ChangeMe123!');
  return {
    id: 'admin-default',
    name: 'Administrator',
    email: 'admin@example.com',
    username: 'admin',
    passwordHash: hash,
    passwordSalt: salt,
    requirePasswordChange: true,
    failedAttempts: 0,
    lockedUntil: null
  };
}

function sanitizeManualExclusions(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }
  const seen = new Set();
  const sanitized = [];
  entries.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const internId = entry.internId;
    const day = entry.day;
    const start = entry.start;
    const end = entry.end;
    if (!internId || !day || !start || !end) {
      return;
    }
    const key = `${internId}|${day}|${start}|${end}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    sanitized.push({ internId, day, start, end });
  });
  return sanitized;
}

function ensureManualExclusions(schedule) {
  if (!schedule || typeof schedule !== 'object') {
    return [];
  }
  if (!Array.isArray(schedule.manualExclusions)) {
    schedule.manualExclusions = [];
  }
  schedule.manualExclusions = sanitizeManualExclusions(schedule.manualExclusions);
  return schedule.manualExclusions;
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DATA_PATH)) {
    return;
  }

  const initial = {
    interns: [],
    availabilities: [],
    schedule: { assignments: [], generatedAt: null, openSlots: [], manualExclusions: [] },
    settings: { maxStations: 9, dayStart: '07:00', dayEnd: '22:00' },
    admins: [createSeedAdmin()]
  };
  fs.writeFileSync(DATA_PATH, JSON.stringify(initial, null, 2));
}

function readStore() {
  ensureStore();
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  const data = JSON.parse(raw);
  let updated = false;

  if (!data.settings) {
    data.settings = { maxStations: 9, dayStart: '07:00', dayEnd: '22:00' };
    updated = true;
  }

  if (!data.schedule) {
    data.schedule = { assignments: [], generatedAt: null, openSlots: [], manualExclusions: [] };
    updated = true;
  }

  if (!Array.isArray(data.schedule.manualExclusions)) {
    data.schedule.manualExclusions = [];
    updated = true;
  } else {
    const sanitizedManual = sanitizeManualExclusions(data.schedule.manualExclusions);
    if (sanitizedManual.length !== data.schedule.manualExclusions.length) {
      updated = true;
    }
    data.schedule.manualExclusions = sanitizedManual;
  }

  if (!Array.isArray(data.admins) || data.admins.length === 0) {
    data.admins = [createSeedAdmin()];
    updated = true;
  } else {
    data.admins = data.admins.map((admin) => {
      const result = { ...admin };
      if (!result.id) {
        result.id = generateId('admin');
        updated = true;
      }
      if (typeof result.failedAttempts !== 'number') {
        result.failedAttempts = 0;
        updated = true;
      }
      if (result.requirePasswordChange === undefined) {
        result.requirePasswordChange = false;
        updated = true;
      }
      return result;
    });
  }

  if (updated) {
    writeStore(data);
  }

  return data;
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

function sendJSON(res, statusCode, data, headers = {}) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    ...headers
  });
  res.end(payload);
}

function sendText(res, statusCode, text, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain',
    ...headers
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

function rangesOverlap(startA, endA, startB, endB) {
  const aStart = timeToNumber(startA);
  const aEnd = timeToNumber(endA);
  const bStart = timeToNumber(startB);
  const bEnd = timeToNumber(endB);
  return aStart < bEnd && bStart < aEnd;
}

function addManualExclusion(schedule, internId, day, start, end) {
  if (!internId || !day || !start || !end) {
    return;
  }
  const manualExclusions = ensureManualExclusions(schedule);
  manualExclusions.push({ internId, day, start, end });
  schedule.manualExclusions = sanitizeManualExclusions(manualExclusions);
}

function clearManualExclusionsForRange(schedule, internId, day, start, end) {
  if (!internId || !day || !start || !end) {
    return;
  }
  const manualExclusions = ensureManualExclusions(schedule);
  schedule.manualExclusions = manualExclusions.filter((entry) => {
    if (entry.internId !== internId || entry.day !== day) {
      return true;
    }
    return !rangesOverlap(entry.start, entry.end, start, end);
  });
}

function generateId(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildSchedule(data) {
  const { interns, availabilities, settings } = data;
  const maxStations = settings?.maxStations || 9;
  const internMap = Object.fromEntries(interns.map((intern) => [intern.id, intern]));

  const manualExclusionsRaw = Array.isArray(data.schedule?.manualExclusions)
    ? sanitizeManualExclusions(data.schedule.manualExclusions)
    : [];
  const filteredManualExclusions = manualExclusionsRaw.filter((entry) => internMap[entry.internId]);
  if (data.schedule) {
    data.schedule.manualExclusions = filteredManualExclusions;
  }

  const manualExclusionKeys = new Set();
  filteredManualExclusions.forEach((entry) => {
    getHourSlots(entry.day, entry.start, entry.end).forEach(({ day: slotDay, hour }) => {
      manualExclusionKeys.add(`${entry.internId}|${slotDay}|${hour}`);
    });
  });

  const assignedHours = {};
  const assignedHoursByDay = {};
  const requestedHours = {};
  interns.forEach((intern) => {
    assignedHours[intern.id] = 0;
    assignedHoursByDay[intern.id] = {};
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
      const exclusionKey = `${internId}|${slotDay}|${hour}`;
      if (manualExclusionKeys.has(exclusionKey)) {
        return;
      }
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

  function sortCandidates(candidates, day) {
    return candidates.sort((a, b) => {
      const aAssigned = assignedHours[a.intern.id] || 0;
      const bAssigned = assignedHours[b.intern.id] || 0;
      const aRequested = requestedHours[a.intern.id] || 1;
      const bRequested = requestedHours[b.intern.id] || 1;
      const aDayHours = assignedHoursByDay[a.intern.id]?.[day] || 0;
      const bDayHours = assignedHoursByDay[b.intern.id]?.[day] || 0;
      if (aDayHours !== bDayHours) {
        return aDayHours - bDayHours;
      }
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

    const sortedTraining = sortCandidates([...trainingCandidates], day);

    const slotAssignments = [];

    // Process training sessions first to guarantee trainer pairing.
    sortedTraining.forEach((candidate) => {
      const { availability, intern } = candidate;
      const trainer = internMap[availability.trainerId];
      if (!trainer) {
        return;
      }
      const traineeExclusionKey = `${intern.id}|${day}|${hour}`;
      if (manualExclusionKeys.has(traineeExclusionKey)) {
        return;
      }
      const trainerAvailability = availabilities.find((entry) => entry.internId === trainer.id && entry.day === day && timeToNumber(entry.start) <= numericHour && timeToNumber(entry.end) > numericHour);
      if (!trainerAvailability) {
        return;
      }
      const trainerExclusionKey = `${trainer.id}|${day}|${hour}`;
      if (manualExclusionKeys.has(trainerExclusionKey)) {
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
      assignedHoursByDay[intern.id][day] = (assignedHoursByDay[intern.id][day] || 0) + 1;
      assignedHoursByDay[trainer.id][day] = (assignedHoursByDay[trainer.id][day] || 0) + 1;
      markParticipants([intern.id, trainer.id], key);
    });

    const sortedIndependent = sortCandidates(independentCandidates, day);

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
      assignedHoursByDay[intern.id][day] = (assignedHoursByDay[intern.id][day] || 0) + 1;
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

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'true'
    });
    res.end();
    return;
  }

  let data;
  try {
    data = readStore();
  } catch (error) {
    console.error('Unable to read data store', error);
    sendJSON(res, 500, { error: 'Unable to read data store.' });
    return;
  }

  const sessionInfo = getSessionInfo(req, data);
  const currentAdmin = sessionInfo?.admin || null;
  const sessionId = sessionInfo?.sessionId || null;

  try {
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const payload = await parseBody(req);
      const username = (payload.username || '').trim();
      const password = payload.password || '';
      if (!username || !password) {
        return sendJSON(res, 400, { error: 'Username and password are required.' });
      }
      const admin = data.admins.find((item) => item.username.toLowerCase() === username.toLowerCase());
      if (!admin || !verifyPassword(password, admin)) {
        if (admin) {
          admin.failedAttempts = Math.min(MAX_FAILED_ATTEMPTS, (admin.failedAttempts || 0) + 1);
          writeStore(data);
          return sendJSON(res, 401, {
            error: 'Invalid username or password.',
            failedAttempts: admin.failedAttempts
          });
        }
        return sendJSON(res, 401, { error: 'Invalid username or password.', failedAttempts: 0 });
      }

      admin.failedAttempts = 0;
      writeStore(data);
      const { sessionId: newSessionId } = createSession(admin.id);
      return sendJSON(
        res,
        200,
        { admin: sanitizeAdmin(admin) },
        {
          'Set-Cookie': `sid=${newSessionId}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_DURATION_MS / 1000)}; SameSite=Lax`
        }
      );
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      destroySession(sessionId);
      return sendJSON(
        res,
        200,
        { success: true },
        { 'Set-Cookie': 'sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax' }
      );
    }

    if (pathname === '/api/auth/session' && req.method === 'GET') {
      if (!currentAdmin) {
        return sendJSON(res, 401, { error: 'Not authenticated.' });
      }
      return sendJSON(res, 200, { admin: sanitizeAdmin(currentAdmin) });
    }

    if (pathname === '/api/auth/change-password' && req.method === 'POST') {
      if (!currentAdmin) {
        return sendJSON(res, 401, { error: 'Not authenticated.' });
      }
      const payload = await parseBody(req);
      const currentPassword = payload.currentPassword || '';
      const newPassword = payload.newPassword || '';
      if (!newPassword || newPassword.length < 8) {
        return sendJSON(res, 400, { error: 'New password must be at least 8 characters long.' });
      }
      if (!verifyPassword(currentPassword, currentAdmin)) {
        return sendJSON(res, 400, { error: 'Current password is incorrect.' });
      }
      const { hash, salt } = hashPassword(newPassword);
      currentAdmin.passwordHash = hash;
      currentAdmin.passwordSalt = salt;
      currentAdmin.requirePasswordChange = false;
      currentAdmin.failedAttempts = 0;
      writeStore(data);
      return sendJSON(res, 200, { success: true });
    }

    if (pathname === '/api/auth/admins' && req.method === 'GET') {
      if (!currentAdmin) {
        return sendJSON(res, 401, { error: 'Not authenticated.' });
      }
      const admins = (data.admins || []).map(sanitizeAdmin).sort((a, b) => a.name.localeCompare(b.name));
      return sendJSON(res, 200, admins);
    }

    if (pathname === '/api/auth/admins' && req.method === 'POST') {
      if (!currentAdmin) {
        return sendJSON(res, 401, { error: 'Not authenticated.' });
      }
      const payload = await parseBody(req);
      const name = (payload.name || '').trim();
      const email = (payload.email || '').trim();
      const username = (payload.username || '').trim();
      const suppliedPassword = (payload.password || '').trim();

      if (!name || !email || !username) {
        return sendJSON(res, 400, { error: 'Name, email, and username are required.' });
      }

      const existing = data.admins.find((admin) => admin.username.toLowerCase() === username.toLowerCase());
      if (existing) {
        return sendJSON(res, 409, { error: 'An admin with that username already exists.' });
      }

      const temporaryPassword = suppliedPassword && suppliedPassword.length >= 8 ? suppliedPassword : generateTemporaryPassword();
      const { hash, salt } = hashPassword(temporaryPassword);

      const newAdmin = {
        id: generateId('admin'),
        name,
        email,
        username,
        passwordHash: hash,
        passwordSalt: salt,
        requirePasswordChange: true,
        failedAttempts: 0,
        lockedUntil: null
      };

      data.admins.push(newAdmin);
      writeStore(data);
      return sendJSON(res, 201, { admin: sanitizeAdmin(newAdmin), temporaryPassword });
    }

    if (pathname === '/api/auth/request-reset' && req.method === 'POST') {
      const payload = await parseBody(req);
      const username = (payload.username || '').trim();
      const email = (payload.email || '').trim();
      if (!username || !email) {
        return sendJSON(res, 400, { error: 'Username and email are required.' });
      }
      const admin = data.admins.find(
        (item) => item.username.toLowerCase() === username.toLowerCase() && item.email.toLowerCase() === email.toLowerCase()
      );
      if (!admin) {
        return sendJSON(res, 404, { error: 'No admin account matches that username and email.' });
      }
      const temporaryPassword = generateTemporaryPassword();
      const { hash, salt } = hashPassword(temporaryPassword);
      admin.passwordHash = hash;
      admin.passwordSalt = salt;
      admin.requirePasswordChange = true;
      admin.failedAttempts = 0;
      writeStore(data);
      return sendJSON(res, 200, { message: 'Temporary password issued.', temporaryPassword });
    }

    if (pathname === '/api/settings' && req.method === 'GET') {
      if (!currentAdmin) {
        return sendJSON(res, 401, { error: 'Not authenticated.' });
      }
      return sendJSON(res, 200, data.settings || {});
    }

    if (pathname === '/api/interns' && req.method === 'GET') {
      return sendJSON(res, 200, data.interns || []);
    }

    if (pathname === '/api/interns' && req.method === 'POST') {
      if (!currentAdmin) {
        return sendJSON(res, 401, { error: 'Not authenticated.' });
      }
      const payload = await parseBody(req);
      if (!payload.name) {
        return sendJSON(res, 400, { error: 'Name is required.' });
      }
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
      const internId = url.searchParams.get('internId');
      if (internId) {
        const filtered = (data.availabilities || []).filter((entry) => entry.internId === internId);
        return sendJSON(res, 200, filtered);
      }
      if (!currentAdmin) {
        return sendJSON(res, 401, { error: 'Not authenticated.' });
      }
      return sendJSON(res, 200, data.availabilities || []);
    }

    if (pathname === '/api/availabilities' && req.method === 'POST') {
      const payload = await parseBody(req);

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
    }

    if (pathname.startsWith('/api/availabilities/') && req.method === 'DELETE') {
      const id = pathname.split('/').pop();
      const before = data.availabilities.length;
      data.availabilities = data.availabilities.filter((item) => item.id !== id);
      if (data.availabilities.length === before) {
        return sendJSON(res, 404, { error: 'Availability not found.' });
      }
      writeStore(data);
      return sendJSON(res, 200, { success: true });
    }

    if (pathname === '/api/schedule' && req.method === 'GET') {
      if (!currentAdmin) {
        return sendJSON(res, 401, { error: 'Not authenticated.' });
      }
      return sendJSON(res, 200, data.schedule || { assignments: [], openSlots: [], manualExclusions: [] });
    }

    if (pathname === '/api/schedule/generate' && req.method === 'POST') {
      if (!currentAdmin) {
        return sendJSON(res, 401, { error: 'Not authenticated.' });
      }
      const result = buildSchedule(data);
      const manualExclusions = Array.isArray(data.schedule?.manualExclusions)
        ? data.schedule.manualExclusions
        : [];
      data.schedule = {
        assignments: result.assignments,
        openSlots: result.openSlots,
        totalsByIntern: result.totalsByIntern,
        waitlistedBySlot: result.waitlistedBySlot,
        daySummaries: result.daySummaries,
        generatedAt: new Date().toISOString(),
        manualExclusions
      };
      writeStore(data);
      return sendJSON(res, 200, data.schedule);
    }

    if (pathname.startsWith('/api/schedule/assignment/') && req.method === 'PUT') {
      if (!currentAdmin) {
        return sendJSON(res, 401, { error: 'Not authenticated.' });
      }
      const id = pathname.split('/').pop();
      const payload = await parseBody(req);
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
      clearManualExclusionsForRange(data.schedule, assignment.internId, assignment.day, assignment.start, assignment.end);
      if (assignment.trainerId) {
        clearManualExclusionsForRange(data.schedule, assignment.trainerId, assignment.day, assignment.start, assignment.end);
      }
      ensureManualExclusions(data.schedule);
      writeStore(data);
      return sendJSON(res, 200, assignment);
    }

    if (pathname === '/api/schedule/assignment' && req.method === 'POST') {
      if (!currentAdmin) {
        return sendJSON(res, 401, { error: 'Not authenticated.' });
      }
      const payload = await parseBody(req);
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
      clearManualExclusionsForRange(data.schedule, assignment.internId, assignment.day, assignment.start, assignment.end);
      if (assignment.trainerId) {
        clearManualExclusionsForRange(data.schedule, assignment.trainerId, assignment.day, assignment.start, assignment.end);
      }
      ensureManualExclusions(data.schedule);
      data.schedule.assignments.push(assignment);
      writeStore(data);
      return sendJSON(res, 201, assignment);
    }

    if (pathname.startsWith('/api/schedule/assignment/') && req.method === 'DELETE') {
      if (!currentAdmin) {
        return sendJSON(res, 401, { error: 'Not authenticated.' });
      }
      const id = pathname.split('/').pop();
      const index = data.schedule.assignments.findIndex((item) => item.id === id);
      if (index === -1) {
        return sendJSON(res, 404, { error: 'Assignment not found.' });
      }
      const [removed] = data.schedule.assignments.splice(index, 1);
      if (removed) {
        addManualExclusion(data.schedule, removed.internId, removed.day, removed.start, removed.end);
        if (removed.trainerId) {
          addManualExclusion(data.schedule, removed.trainerId, removed.day, removed.start, removed.end);
        }
      }
      ensureManualExclusions(data.schedule);
      writeStore(data);
      return sendJSON(res, 200, { success: true });
    }

    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');

    if ((pathname === '/' || pathname === '/index.html' || pathname === '/roster.html') && !currentAdmin) {
      res.writeHead(302, { Location: '/login.html' });
      res.end();
      return;
    }

    if (pathname === '/login.html' && currentAdmin) {
      res.writeHead(302, { Location: '/' });
      res.end();
      return;
    }

    const filePath = path.join(CLIENT_DIR, relativePath);
    if (!filePath.startsWith(CLIENT_DIR)) {
      return sendText(res, 403, 'Forbidden');
    }

    fs.readFile(filePath, (err, content) => {
      if (err) {
        sendText(res, 404, 'Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
      res.end(content);
    });
  } catch (error) {
    console.error('Server error', error);
    sendJSON(res, 500, { error: 'Internal server error', details: error.message });
  }
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
