/**
 * server.js
 * -----------------------------------------------------------------------
 * Application entry point. Boots Express, builds/loads the vector store
 * (ingesting PDFs on first run), wires up routes, and starts listening.
 * -----------------------------------------------------------------------
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const config = require('./utils/config');
const { buildVectorStore } = require('./services/ingest');
const createChatRouter = require('./routes/chatRoutes');

async function start() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // Serve the vanilla frontend as static files.
  app.use(express.static(path.join(__dirname, '..', 'frontend')));

  console.log('=================================================');
  console.log(' CODE Pakistan Policy Assistant — starting up');
  console.log('=================================================');

  let vectorStore;
  try {
    vectorStore = await buildVectorStore();
    console.log(`[server] Knowledge base ready: ${vectorStore.size()} chunks indexed.`);
  } catch (err) {
    console.error('[server] FATAL: could not build the knowledge base.');
    console.error(err.message);
    console.error(
      'Make sure the "knowledge/" folder contains the IT Policy and Duty of Care PDFs.'
    );
    process.exit(1);
  }

  app.use('/api', createChatRouter(vectorStore));

  // Fallback: any non-API route serves the SPA's index.html.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
  });

  // Centralized error handler — catches anything that slipped past routes.
  app.use((err, req, res, next) => {
    console.error('[server] Unhandled error:', err);
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  });

  app.listen(config.server.port, () => {
    console.log(`[server] Listening on http://localhost:${config.server.port}`);
    if (!config.groq.apiKey) {
      console.warn(
        '[server] WARNING: GROQ_API_KEY is not set. Chat requests will fail until you add it to .env'
      );
    }
  });
}

start();
