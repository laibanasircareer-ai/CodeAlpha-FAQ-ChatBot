/**
 * ragPipeline.js
 * -----------------------------------------------------------------------
 * The orchestration layer. This is where retrieval, conversation memory,
 * and Groq generation come together into a single "ask a question, get an
 * answer with citations" operation. Routes call THIS module — they never
 * talk to retriever.js or groqService.js directly.
 * -----------------------------------------------------------------------
 */

const config = require('../utils/config');
const { retrieveRelevantChunks } = require('./retriever');
const { generateAnswer } = require('./groqService');

/**
 * In-memory conversation store, keyed by sessionId. Fine for a portfolio
 * / single-instance deployment; would move to Redis for multi-instance
 * production use.
 * @type {Map<string, Array<{role: 'user'|'assistant', content: string}>>}
 */
const conversations = new Map();

function getHistory(sessionId) {
  return conversations.get(sessionId) || [];
}

function appendToHistory(sessionId, role, content) {
  const history = getHistory(sessionId);
  history.push({ role, content });

  // Keep only the last N turns (a "turn" = one user + one assistant message)
  const maxMessages = config.memory.turns * 2;
  const trimmed = history.slice(-maxMessages);
  conversations.set(sessionId, trimmed);
}

/**
 * Builds a search-friendly query that resolves short follow-up questions
 * ("Why?", "What about contractors?") using the previous exchange, so
 * retrieval doesn't go looking for the wrong thing.
 */
function buildRetrievalQuery(question, history) {
  const isLikelyFollowUp = question.trim().split(/\s+/).length <= 4;
  if (!isLikelyFollowUp || history.length === 0) return question;

  const lastUserTurn = [...history].reverse().find((m) => m.role === 'user');
  const lastAssistantTurn = [...history].reverse().find((m) => m.role === 'assistant');

  const priorContext = [lastUserTurn?.content, lastAssistantTurn?.content]
    .filter(Boolean)
    .join(' ');

  return `${priorContext} ${question}`.trim();
}

/**
 * Formats retrieved chunks into a single context string for the LLM
 * prompt, and a separate structured citation list for the UI.
 */
function formatContextAndCitations(chunks) {
  const contextText = chunks
    .map(
      (c, i) =>
        `[Source ${i + 1}: ${c.documentName}, Section: ${c.section}, Page ${c.page}]\n${c.text}`
    )
    .join('\n\n');

  const citations = chunks.map((c) => ({
    document: c.documentName,
    section: c.section,
    page: c.page,
    relevance: Number(c.score.toFixed(3)),
  }));

  return { contextText, citations };
}

/**
 * Main entry point: answers a user question using RAG + memory.
 *
 * @param {Object} params
 * @param {string} params.question
 * @param {string} params.sessionId
 * @param {import('./vectorStore')} params.vectorStore
 * @returns {Promise<{answer: string, citations: Array, foundAnswer: boolean}>}
 */
async function answerQuestion({ question, sessionId, vectorStore }) {
  if (!question || !question.trim()) {
    throw new Error('Question cannot be empty.');
  }

  const history = getHistory(sessionId);
  const retrievalQuery = buildRetrievalQuery(question, history);

  const chunks = await retrieveRelevantChunks(retrievalQuery, vectorStore);

  // No relevant chunks at all -> short-circuit with the fixed fallback
  // answer without even calling Groq. Saves an API call and guarantees
  // the exact required wording.
  if (chunks.length === 0) {
    appendToHistory(sessionId, 'user', question);
    appendToHistory(sessionId, 'assistant', config.fallbackAnswer);
    return { answer: config.fallbackAnswer, citations: [], foundAnswer: false };
  }

  const { contextText, citations } = formatContextAndCitations(chunks);

  const answer = await generateAnswer({
    contextText,
    history,
    question,
  });

  appendToHistory(sessionId, 'user', question);
  appendToHistory(sessionId, 'assistant', answer);

  const foundAnswer = !answer.includes("couldn't find that information");

  return {
    answer,
    citations: foundAnswer ? citations : [],
    foundAnswer,
  };
}

function clearSession(sessionId) {
  conversations.delete(sessionId);
}

module.exports = { answerQuestion, clearSession };
