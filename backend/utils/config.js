/**
 * config.js
 * -----------------------------------------------------------------------
 * Centralized configuration for the entire backend. Every other module
 * reads its settings from here instead of touching process.env directly.
 * This keeps environment-variable parsing/validation in exactly one place.
 * -----------------------------------------------------------------------
 */

require('dotenv').config();
const path = require('path');

const config = {
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
  },

  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    temperature: 0.2, // low temperature -> factual, deterministic policy answers
    maxTokens: 700,
  },

  embedding: {
    // Free, local, no-API-key-required sentence embedding model.
    // 384-dimension vectors, fast on CPU, good semantic quality for short passages.
    model: process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
  },

  chunking: {
    minWords: parseInt(process.env.CHUNK_MIN_WORDS, 10) || 300,
    maxWords: parseInt(process.env.CHUNK_MAX_WORDS, 10) || 500,
    overlapWords: parseInt(process.env.CHUNK_OVERLAP_WORDS, 10) || 50,
  },

  retrieval: {
    topK: parseInt(process.env.TOP_K_CHUNKS, 10) || 4,
    minSimilarity: 0.15, // below this, we treat retrieval as "no relevant context"
  },

  memory: {
    turns: parseInt(process.env.CONVERSATION_MEMORY_TURNS, 10) || 4,
  },

  paths: {
    knowledgeDir: path.join(__dirname, '..', '..', 'knowledge'),
    // Cached embeddings are persisted to disk so the server doesn't have to
    // re-embed every chunk on every restart (embedding generation is the
    // slowest part of startup).
    vectorCacheFile: path.join(__dirname, '..', '..', 'knowledge', '.vector-cache.json'),
  },

  fallbackAnswer:
    "I couldn't find that information in the provided CODE Pakistan policy documents.",
};

module.exports = config;
