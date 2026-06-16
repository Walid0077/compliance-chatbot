const { Router } = require('express');
const store = require('../storage/escalations');

const router = Router();

// GET /api/escalations — list, optional ?status=open|in_review|closed and ?sessionId=...
router.get('/', (req, res) => {
  try {
    const { status, sessionId } = req.query;
    const escalations = store.listEscalations({ status, sessionId });
    const stats = store.getEscalationStats();
    res.json({ escalations, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/escalations/:id — single record
router.get('/:id', (req, res) => {
  try {
    const record = store.getEscalation(req.params.id);
    if (!record) return res.status(404).json({ error: 'Escalation not found' });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/escalations — manual creation (oversight or future tool integration)
router.post('/', (req, res) => {
  try {
    const {
      sessionId,
      userQuery,
      agentResponse,
      decision,
      trigger,
      destinations,
      source,
    } = req.body || {};

    if (!userQuery && !agentResponse) {
      return res.status(400).json({ error: 'userQuery or agentResponse is required' });
    }

    const record = store.createEscalation({
      sessionId,
      userQuery,
      agentResponse,
      decision,
      trigger,
      destinations,
      source: source || 'manual',
    });
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/escalations/:id — status, notes, resolution
router.patch('/:id', (req, res) => {
  try {
    const updated = store.updateEscalation(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Escalation not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
