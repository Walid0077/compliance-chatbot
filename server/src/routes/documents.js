const { Router } = require('express');
const documents = require('../storage/documents');

const router = Router();

// GET /api/documents — list all documents with metadata
router.get('/', async (_req, res) => {
  try {
    const list = await documents.listDocuments();
    const gcsError = documents.getLastGcsError();
    res.json({
      documents: list,
      count: list.length,
      source: process.env.GCS_DOCUMENTS_BUCKET && !gcsError ? 'gcs' : 'local',
      gcsBucket: process.env.GCS_DOCUMENTS_BUCKET || null,
      gcsError, // null when GCS unset or last listing succeeded
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents/:filename — download or preview a local document.
// (GCS-backed documents come with absolute URLs already and bypass this.)
router.get('/:filename', (req, res) => {
  try {
    const full = documents.getLocalFilePath(req.params.filename);
    if (!full) return res.status(404).json({ error: 'Document not found' });
    res.sendFile(full);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
