/**
 * retriever.js
 * -----------------------------------------------------------------------
 * The "R" in RAG. Given a user question and a populated VectorStore,
 * embeds the question and returns the most semantically similar chunks.
 *
 * This is deliberately a thin module — its only job is semantic search.
 * It does NOT talk to Groq and does NOT know about conversation memory;
 * that orchestration lives in ragPipeline.js.
 * -----------------------------------------------------------------------
 */

const config = require('../utils/config');
const { embedText } = require('./embeddingService');

/**
 * @param {string} query - The user's question (already resolved for
 *   follow-up context if needed — see ragPipeline.js).
 * @param {import('./vectorStore')} vectorStore
 * @returns {Promise<Array<{id, text, documentName, section, page, score}>>}
 */
async function retrieveRelevantChunks(query, vectorStore) {
  if (vectorStore.isEmpty()) {
    throw new Error('Vector store is empty. Run ingestion before querying.');
  }

  const queryVector = await embedText(query);
  const topK = config.retrieval.topK;

  const results = vectorStore.search(queryVector, topK);

  // Filter out chunks that are too dissimilar to be genuinely relevant —
  // this is what lets the assistant say "I don't know" instead of forcing
  // an answer out of irrelevant context.
  const relevant = results.filter((r) => r.score >= config.retrieval.minSimilarity);

  return relevant;
}

module.exports = { retrieveRelevantChunks };
