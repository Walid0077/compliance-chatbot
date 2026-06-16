require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const authMiddleware = require('./middleware/auth');
const healthRouter = require('./routes/health');
const chatRouter = require('./routes/chat');
const historyRouter = require('./routes/history');
const analyticsRouter = require('./routes/analytics');
const escalationsRouter = require('./routes/escalations');
const documentsRouter = require('./routes/documents');

const app = express();

app.use(helmet());
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/health', healthRouter);

app.use(authMiddleware);

app.get('/api/verify', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/chat', chatRouter);
app.use('/api/history', historyRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/escalations', escalationsRouter);
app.use('/api/documents', documentsRouter);

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});
