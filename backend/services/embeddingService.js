/**
 * embeddingService.js
 * -----------------------------------------------------------------------
 * Generates vector embeddings LOCALLY using @xenova/transformers
 * (Transformers.js), a WASM/ONNX port of Hugging Face transformers that
 * runs entirely on CPU in Node.js — no OpenAI key, no paid API, no
 * external network calls once the model is downloaded and cached.
 *
 * Model: Xenova/all-MiniLM-L6-v2
 *  - 384-dimensional sentence embeddings
 *  - ~90MB, fast enough for real-time query embedding
 *  - Well-suited for semantic similarity / retrieval tasks
 *
 * The pipeline is loaded ONCE (singleton) and reused for every embedding
 * call, since model loading is the expensive part.
 * -----------------------------------------------------------------------
 */

const config = require('../utils/config');

let embedderPromise = null;

/**
 * Lazily loads and caches the feature-extraction pipeline.
 * Using dynamic import because @xenova/transformers is an ESM-only package.
 */
function getEmbedder() {
  if (!embedderPromise) {
    embedderPromise = (async () => {
      const { pipeline } = await import('@xenova/transformers');
      console.log(`[embeddingService] Loading local embedding model: ${config.embedding.model} ...`);
      const embedder = await pipeline('feature-extraction', config.embedding.model);
      console.log('[embeddingService] Embedding model ready.');
      return embedder;
    })();
  }
  return embedderPromise;
}

/**
 * Embeds a single string of text.
 * @param {string} text
 * @returns {Promise<number[]>} a 384-dim vector
 */
async function embedText(text) {
  const embedder = await getEmbedder();
  // mean-pooling + normalization gives us a single fixed-length vector
  // that's ready for cosine similarity comparisons.
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * Embeds many chunks of text, reporting progress as it goes.
 * Sequential (not parallel) to keep memory usage predictable on modest
 * hardware — embedding is CPU-bound so parallelism wouldn't help much
 * inside a single Node process anyway.
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
async function embedBatch(texts) {
  const embedder = await getEmbedder();
  const vectors = [];

  for (let i = 0; i < texts.length; i++) {
    const output = await embedder(texts[i], { pooling: 'mean', normalize: true });
    vectors.push(Array.from(output.data));
    if ((i + 1) % 10 === 0 || i === texts.length - 1) {
      console.log(`[embeddingService] Embedded ${i + 1}/${texts.length} chunks`);
    }
  }

  return vectors;
}

module.exports = { embedText, embedBatch };
