// Server-side reconstruction of Graham's Step 0 / Step 2 classifications.
//
// Why this exists: Dialogflow CX does not surface code-action return
// values to the detectIntent caller. So the server re-derives the
// classification by (a) matching the canonical response markers from
// the Orchestrator codeBlock and (b) scanning Graham's [STATUS ALIGNMENT]
// line plus the user query. Heuristic but stable enough for analytics.
//
// Keep the markers and HIGH_SENSITIVITY_TRIGGERS in sync with
// playbooks/Orchestrator_Agent/Orchestrator_Agent.json (codeBlock).

const REFUSAL_MARKER = 'This request cannot be supported because it seeks to bypass';
const EMERGENCY_MARKER = 'URGENT ESCALATION:';
const OUT_OF_SCOPE_MARKER = 'This falls outside my compliance domain';

// Server-side mirror of the Orchestrator codeBlock's keyword lists. We
// run the gate here too so the dashboard stays accurate even when the
// agent paraphrases the canonical halt messages (which LLMs do) or when
// the codeBlock has not yet been deployed to the live agent.
// Keep in sync with files/intake_gate.py.
const REFUSAL_TRIGGERS = [
  'how to hide', 'how to bypass', 'how to evade', 'how to circumvent',
  'how to manipulate', 'how to falsify', 'how to misrepresent',
  'how can i hide', 'how can we hide',
  'without being noticed', 'without getting caught',
  'without telling', 'without notifying', 'without consent',
  'without authorization', 'without approval',
  'bypass the audit', 'skip the audit', 'skip compliance',
  'cover up', 'conceal from', 'destroy evidence',
  'delete logs', 'hide records', 'falsify records',
];

const EMERGENCY_TRIGGERS = [
  'data breach', 'stolen records', 'stolen credentials',
  'compromised credentials', 'credentials leaked',
  'unauthorized access', 'unauthorized data access',
  'ransomware',
  'regulatory investigation', 'regulator investigation',
  'regulatory fine', 'regulatory penalty',
  'lawsuit', 'being sued',
  'wrongful termination', 'discrimination claim',
  'illegal data processing', 'illegal processing',
  'data exfiltration', 'data exfiltrated',
];

const OUT_OF_SCOPE_TRIGGERS = [
  'write code', 'write a function', 'debug this code',
  'stack trace', 'react component', 'sql query for',
  'marketing campaign', 'ad copy', 'seo strategy',
  'social media post',
  'tell me a joke', 'play a game',
  'recommend a restaurant',
  'relationship advice', 'dating advice',
  'investment advice', 'stock pick',
];

const HIGH_SENSITIVITY_TRIGGERS = [
  'is it allowed', 'is this allowed', 'are we allowed',
  'is it compliant', 'is this compliant',
  'approval to', 'permission to',
  'creates liability', 'liability for',
  'train ai', 'train our model', 'training data',
  'data for training', 'data for ai training',
  'employee monitoring', 'monitor employees',
  'automated decision', 'automated decision-making',
  'algorithmic management',
  'biometric', 'facial recognition',
  "children's data", 'health data', 'medical records',
  'special category', 'racial data', 'religious data',
  'sexual orientation', 'union membership',
  'high-risk ai', 'ai system classification',
  'dpia', 'data protection impact assessment',
  'conformity assessment',
  'cross-border', 'third country', 'international transfer',
  'standard contractual clauses',
  'vendor approval', 'processor approval', 'sub-processor',
  'data processing agreement',
  'regulatory fine', 'enforcement action',
  'customer-facing legal', 'public commitment',
];

function detectIntakeDecision(replyText) {
  if (!replyText) return 'unknown';
  if (replyText.includes(EMERGENCY_MARKER)) return 'emergency';
  if (replyText.includes(REFUSAL_MARKER)) return 'refusal';
  if (replyText.includes(OUT_OF_SCOPE_MARKER)) return 'out_of_scope';
  return 'pass';
}

// Server-side replay of the Orchestrator codeBlock's check_intake_gate.
// Lets us classify correctly when the agent paraphrases the verbatim
// halt response (LLMs do this) or when the codeBlock has not been
// deployed yet. Returns the same shape but without the canonical text.
function gateDecisionFromQuery(userMessage) {
  const q = (userMessage || '').toLowerCase();
  if (!q) return { decision: 'pass', matched: null };
  for (const t of REFUSAL_TRIGGERS) {
    if (q.includes(t)) return { decision: 'refusal', matched: t };
  }
  for (const t of EMERGENCY_TRIGGERS) {
    if (q.includes(t)) return { decision: 'emergency', matched: t };
  }
  for (const t of OUT_OF_SCOPE_TRIGGERS) {
    if (q.includes(t)) return { decision: 'out_of_scope', matched: t };
  }
  return { decision: 'pass', matched: null };
}

function extractStatusAlignment(replyText) {
  if (!replyText) return null;
  const m = replyText.match(/\[STATUS ALIGNMENT\]:?\s*([^\n]+)/i);
  return m ? m[1].trim() : null;
}

function findHighSensitivityTrigger(query) {
  const q = (query || '').toLowerCase();
  return HIGH_SENSITIVITY_TRIGGERS.find((t) => q.includes(t)) || null;
}

// Returns { sensitivity, route } where:
//   sensitivity: 'HIGH' | 'STANDARD' | 'N/A'  (N/A when intake gate halted)
//   route:       'A' | 'B' | 'C' | 'GATED'    (GATED when intake gate halted)
function classifyRouting({ userMessage, documentUploaded, decision, replyText }) {
  if (decision && decision !== 'pass') {
    return { sensitivity: 'N/A', route: 'GATED', triggerHigh: null };
  }
  if (documentUploaded) {
    return { sensitivity: 'HIGH', route: 'A', triggerHigh: null };
  }

  // Heuristic 1: trust Graham's own STATUS ALIGNMENT line when it
  // explicitly classifies the inquiry as high-sensitivity / standard.
  const status = extractStatusAlignment(replyText);
  if (status) {
    if (/high.?sensitiv/i.test(status)) return { sensitivity: 'HIGH', route: 'B', triggerHigh: null };
    if (/standard|definitional|educational/i.test(status))
      return { sensitivity: 'STANDARD', route: 'C', triggerHigh: null };
  }

  // Heuristic 2: server-side keyword scan against the user query.
  const triggerHigh = findHighSensitivityTrigger(userMessage);
  if (triggerHigh) return { sensitivity: 'HIGH', route: 'B', triggerHigh };

  return { sensitivity: 'STANDARD', route: 'C', triggerHigh: null };
}

// One-call helper used by the chat route. Combines two signals:
//   * gateDecisionFromQuery — server-side replay of the deterministic gate.
//   * detectIntakeDecision  — canonical-marker scan of the agent reply.
// We prefer the gate. If the gate says pass but the agent's reply
// matches a halt marker (e.g., the agent independently refused), defer
// to the reply. Returns:
//   decision         -- final 'refusal' | 'emergency' | 'out_of_scope' | 'pass' | 'unknown'
//   sensitivity      -- 'HIGH' | 'STANDARD' | 'N/A'
//   route            -- 'A' | 'B' | 'C' | 'GATED'
//   triggerHigh      -- the high-sensitivity keyword that matched, if any
//   gateTrigger      -- the gate keyword that matched the query, if any
//   gateDecision     -- what the deterministic gate said about the query
//   replyDecision    -- what the canonical-marker scan said about the reply
function classify({ userMessage, documentUploaded, replyText }) {
  const gate = gateDecisionFromQuery(userMessage);
  const replyDecision = detectIntakeDecision(replyText);

  const decision = gate.decision !== 'pass' ? gate.decision : replyDecision;

  const { sensitivity, route, triggerHigh } = classifyRouting({
    userMessage,
    documentUploaded,
    decision,
    replyText,
  });

  return {
    decision,
    sensitivity,
    route,
    triggerHigh,
    gateTrigger: gate.matched,
    gateDecision: gate.decision,
    replyDecision,
  };
}

module.exports = {
  classify,
  detectIntakeDecision,
  gateDecisionFromQuery,
  classifyRouting,
  extractStatusAlignment,
  EMERGENCY_TRIGGERS,
  REFUSAL_TRIGGERS,
  OUT_OF_SCOPE_TRIGGERS,
  HIGH_SENSITIVITY_TRIGGERS,
};
