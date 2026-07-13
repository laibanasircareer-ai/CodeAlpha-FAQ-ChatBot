/**
 * chatRoutes.js
 * -----------------------------------------------------------------------
 * HTTP layer for the chat feature. Routes are intentionally "dumb" —
 * they validate the request shape, delegate to ragPipeline, and format
 * the HTTP response. All real logic lives in the services/ layer.
 * -----------------------------------------------------------------------
 */

const express = require('express');
const { answerQuestion, clearSession } = require('../services/ragPipeline');

/**
 * @param {import('../services/vectorStore')} vectorStore - injected so
 *   routes never need to know how/where it was built.
 */
function createChatRouter(vectorStore) {
  const router = express.Router();

  // POST /api/chat  { question: string, sessionId: string }
  router.post('/chat', async (req, res) => {
    try {
      const { question, sessionId } = req.body || {};

      if (typeof question !== 'string' || !question.trim()) {
        return res.status(400).json({
          error: 'A non-empty "question" field (string) is required.',
        });
      }

      if (!vectorStore || vectorStore.isEmpty()) {
        return res.status(503).json({
          error:
            'The knowledge base is still loading. Please wait a moment and try again.',
        });
      }

      const result = await answerQuestion({
        question: question.trim(),
        sessionId: sessionId || 'default',
        vectorStore,
      });

      return res.json(result);
    } catch (err) {
      console.error('[chatRoutes] /chat error:', err);
      return res.status(500).json({
        error: err.message || 'Something went wrong while generating an answer.',
      });
    }
  });

  // POST /api/chat/clear  { sessionId: string }
  router.post('/chat/clear', (req, res) => {
    const { sessionId } = req.body || {};
    clearSession(sessionId || 'default');
    return res.json({ cleared: true });
  });

  // GET /api/health
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      vectorStoreReady: !!vectorStore && !vectorStore.isEmpty(),
      chunkCount: vectorStore ? vectorStore.size() : 0,
    });
  });

  return router;
}

module.exports = createChatRouter;
