import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db/schema.js';
import authRouter from './routes/auth.js';
import profilesRouter from './routes/profiles.js';
import vocabularyRouter from './routes/vocabulary.js';
import sentencesRouter from './routes/sentences.js';
import adminRouter from './routes/admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// In dev, allow the Vite dev server. In prod, same origin serves everything.
if (!isProd) {
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173', credentials: true }));
}

app.use(express.json());

// API routes
app.use('/api/auth', authRouter);
app.use('/api/profiles', profilesRouter);
app.use('/api/profiles/:profileId/vocabulary', vocabularyRouter);
app.use('/api/profiles/:profileId/sentences', sentencesRouter);
app.use('/api/admin', adminRouter);
app.get('/api/health', (_, res) => res.json({ ok: true }));

// Serve built frontend in production
const frontendDist = join(__dirname, '../../frontend/dist');
if (isProd && existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(join(frontendDist, 'index.html'));
  });
}

// 404 for unmatched API routes
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

initDb(process.env.DB_PATH || './data/fluenttype.db');
app.listen(PORT, () => console.log(`FluentType running on http://localhost:${PORT} [${isProd ? 'production' : 'dev'}]`));
