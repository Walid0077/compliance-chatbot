const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

// Escalations live as sibling to data/sessions.
const escalationsDir = path.resolve(config.dataDir, '../escalations');

function ensureDir() {
  if (!fs.existsSync(escalationsDir)) {
    fs.mkdirSync(escalationsDir, { recursive: true });
  }
}

function escalationFile(id) {
  return path.join(escalationsDir, `${id}.json`);
}

function makeId() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(4).toString('hex');
  return `esc_${ts}_${rand}`;
}

function readEscalation(id) {
  const file = escalationFile(id);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeEscalation(record) {
  ensureDir();
  fs.writeFileSync(escalationFile(record.id), JSON.stringify(record, null, 2), 'utf8');
  return record;
}

// Defaults applied to a freshly created escalation.
function buildRecord(input = {}) {
  const now = new Date().toISOString();
  return {
    id: input.id || makeId(),
    sessionId: input.sessionId || null,
    createdAt: now,
    updatedAt: now,
    status: input.status || 'open', // 'open' | 'in_review' | 'closed'
    source: input.source || 'manual', // 'auto' | 'manual'
    decision: input.decision || null, // 'emergency' | 'refusal' | null
    trigger: input.trigger || null, // matched keyword, when known
    userQuery: input.userQuery || '',
    agentResponse: input.agentResponse || '',
    destinations: input.destinations || ['legal', 'dpo'],
    notes: [],
    closedBy: null,
    closedAt: null,
    resolution: null,
  };
}

function createEscalation(input) {
  const record = buildRecord(input);
  return writeEscalation(record);
}

function getEscalation(id) {
  return readEscalation(id);
}

function listEscalations({ status, sessionId } = {}) {
  ensureDir();
  const files = fs.readdirSync(escalationsDir).filter((f) => f.endsWith('.json'));
  return files
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(escalationsDir, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((e) => (status ? e.status === status : true))
    .filter((e) => (sessionId ? e.sessionId === sessionId : true))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function updateEscalation(id, patch = {}) {
  const existing = readEscalation(id);
  if (!existing) return null;

  // Whitelist of fields the API is allowed to change.
  const allowed = ['status', 'destinations', 'resolution', 'decision', 'trigger'];
  for (const key of allowed) {
    if (patch[key] !== undefined) existing[key] = patch[key];
  }

  // Append a note if one was provided.
  if (patch.note) {
    existing.notes.push({
      at: new Date().toISOString(),
      by: patch.noteBy || 'oversight',
      text: String(patch.note),
    });
  }

  // Track closure metadata when status transitions to closed.
  if (patch.status === 'closed' && existing.closedAt === null) {
    existing.closedAt = new Date().toISOString();
    existing.closedBy = patch.closedBy || patch.noteBy || 'oversight';
  }

  existing.updatedAt = new Date().toISOString();
  return writeEscalation(existing);
}

function getEscalationStats() {
  const all = listEscalations();
  const stats = {
    total: all.length,
    open: 0,
    inReview: 0,
    closed: 0,
    byDecision: {},
    bySource: {},
  };
  for (const e of all) {
    if (e.status === 'open') stats.open++;
    else if (e.status === 'in_review') stats.inReview++;
    else if (e.status === 'closed') stats.closed++;
    if (e.decision) stats.byDecision[e.decision] = (stats.byDecision[e.decision] || 0) + 1;
    stats.bySource[e.source] = (stats.bySource[e.source] || 0) + 1;
  }
  return stats;
}

module.exports = {
  createEscalation,
  getEscalation,
  listEscalations,
  updateEscalation,
  getEscalationStats,
};
