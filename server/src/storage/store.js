const fs = require('fs');
const path = require('path');
const config = require('../config');

function ensureDir() {
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }
}

function sessionFile(sessionId) {
  return path.join(config.dataDir, `${sessionId}.json`);
}

function readSession(sessionId) {
  const file = sessionFile(sessionId);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function saveMessage(sessionId, role, text, metadata = {}) {
  ensureDir();
  const file = sessionFile(sessionId);
  let session = readSession(sessionId);

  if (!session) {
    session = {
      id: sessionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
  }

  session.updatedAt = new Date().toISOString();
  session.messages.push({
    role,
    text,
    timestamp: new Date().toISOString(),
    ...metadata,
  });

  fs.writeFileSync(file, JSON.stringify(session, null, 2), 'utf8');
  return session;
}

function getSession(sessionId) {
  return readSession(sessionId);
}

function getAllSessions() {
  ensureDir();
  const files = fs.readdirSync(config.dataDir).filter((f) => f.endsWith('.json'));
  return files
    .map((f) => {
      try {
        const session = JSON.parse(fs.readFileSync(path.join(config.dataDir, f), 'utf8'));
        const botMessages = session.messages.filter((m) => m.role === 'bot');
        const confidenceScores = botMessages
          .map((m) => m.confidence)
          .filter((c) => typeof c === 'number');
        const avgConfidence =
          confidenceScores.length > 0
            ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
            : null;
        const intents = botMessages.map((m) => m.intentName).filter(Boolean);
        return {
          id: session.id,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          messageCount: session.messages.length,
          avgConfidence: avgConfidence !== null ? parseFloat(avgConfidence.toFixed(3)) : null,
          topIntent: intents.length > 0 ? mostCommon(intents) : null,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function getAnalytics() {
  ensureDir();
  const files = fs.readdirSync(config.dataDir).filter((f) => f.endsWith('.json'));
  const intentCounts = {};
  const decisionCounts = {};
  const sensitivityCounts = {};
  const routeCounts = {};
  // Daily aggregation of source-coverage. Each entry holds:
  //   withSource: # of bot replies that day with >=1 citation
  //   total: total # of bot replies that day
  const sourcesByDay = {};
  let totalBotMessages = 0;
  let totalMessages = 0;
  let totalBotWithSources = 0;
  let totalHalts = 0;
  let totalSessions = 0;
  let totalEscalated = 0;
  const today = new Date().toISOString().slice(0, 10);
  let activeTodaySessions = 0;

  for (const f of files) {
    try {
      const session = JSON.parse(fs.readFileSync(path.join(config.dataDir, f), 'utf8'));
      totalSessions++;
      totalMessages += session.messages.length;

      if (session.updatedAt && session.updatedAt.slice(0, 10) === today) {
        activeTodaySessions++;
      }

      for (const msg of session.messages) {
        if (msg.role !== 'bot') continue;
        totalBotMessages++;
        const day = (msg.timestamp || '').slice(0, 10);
        if (day) {
          if (!sourcesByDay[day]) sourcesByDay[day] = { withSource: 0, total: 0 };
          sourcesByDay[day].total++;
          if ((msg.sourceCount || 0) > 0) sourcesByDay[day].withSource++;
        }
        if ((msg.sourceCount || 0) > 0) totalBotWithSources++;

        if (msg.intentName) {
          intentCounts[msg.intentName] = (intentCounts[msg.intentName] || 0) + 1;
        }
        if (msg.decision) {
          decisionCounts[msg.decision] = (decisionCounts[msg.decision] || 0) + 1;
          if (msg.decision !== 'pass' && msg.decision !== 'unknown') totalHalts++;
        }
        if (msg.sensitivity) {
          sensitivityCounts[msg.sensitivity] = (sensitivityCounts[msg.sensitivity] || 0) + 1;
        }
        if (msg.route) {
          routeCounts[msg.route] = (routeCounts[msg.route] || 0) + 1;
        }
        if (msg.escalationId) {
          totalEscalated++;
        }
      }
    } catch {
      // skip
    }
  }

  // Source coverage = share of bot replies grounded in at least one RAG
  // citation. Higher is better; the intent is a single, demo-ready
  // proxy for "how often are answers backed by sources we can show?"
  const sourceCoverage = totalBotMessages > 0
    ? parseFloat((totalBotWithSources / totalBotMessages).toFixed(3))
    : null;

  // Halt rate = share of bot replies where the intake gate stopped the
  // request (refusal / emergency / out-of-scope). A governance proxy
  // for "what fraction of traffic is being filtered at the door?"
  const haltRate = totalBotMessages > 0
    ? parseFloat((totalHalts / totalBotMessages).toFixed(3))
    : null;

  const sourceCoverageTrend = Object.entries(sourcesByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([day, { withSource, total }]) => ({
      date: day,
      coverage: parseFloat((withSource / total).toFixed(3)),
      messageCount: total,
    }));

  const intentDistribution = Object.entries(intentCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([intent, count]) => ({ intent, count }));

  const toRanked = (obj) =>
    Object.entries(obj)
      .sort(([, a], [, b]) => b - a)
      .map(([key, count]) => ({ key, count }));

  return {
    totalSessions,
    totalMessages,
    totalBotMessages,
    activeTodaySessions,
    totalEscalated,
    sourceCoverage,
    haltRate,
    sourceCoverageTrend,
    intentDistribution,
    decisionDistribution: toRanked(decisionCounts),
    sensitivityDistribution: toRanked(sensitivityCounts),
    routeDistribution: toRanked(routeCounts),
  };
}

function mostCommon(arr) {
  const map = {};
  let maxVal = arr[0];
  let maxCount = 1;
  for (const v of arr) {
    map[v] = (map[v] || 0) + 1;
    if (map[v] > maxCount) {
      maxVal = v;
      maxCount = map[v];
    }
  }
  return maxVal;
}

module.exports = { saveMessage, getSession, getAllSessions, getAnalytics };
