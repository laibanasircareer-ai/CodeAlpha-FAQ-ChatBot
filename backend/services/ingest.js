/**
 * ingest.js
 * -----------------------------------------------------------------------
 * Orchestrates the offline/startup half of the RAG pipeline:
 *   PDFs -> extract text -> chunk -> embed -> populate VectorStore
 *
 * A content hash of the source PDFs is stored alongside the cached
 * vectors. If the PDFs haven't changed since the last run, we skip
 * re-embedding entirely and just load the cache — this makes server
 * restarts near-instant during development.
 * -----------------------------------------------------------------------
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const config = require('../utils/config');
const { loadKnowledgeBase } = require('./pdfLoader');
const { chunkDocuments } = require('./chunker');
const { embedBatch } = require('./embeddingService');
const VectorStore = require('./vectorStore');

/** Computes a simple hash of all PDF file contents to detect changes. */
function hashKnowledgeDir(knowledgeDir) {
  const files = fs
    .readdirSync(knowledgeDir)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .sort();

  const hash = crypto.createHash('sha256');
  for (const f of files) {
    hash.update(fs.readFileSync(path.join(knowledgeDir, f)));
  }
  return hash.digest('hex');
}

/**
 * Builds (or loads from cache) a fully-populated VectorStore.
 * @returns {Promise<VectorStore>}
 */
async function buildVectorStore() {
  const store = new VectorStore();
  const { knowledgeDir, vectorCacheFile } = config.paths;

  const currentHash = hashKnowledgeDir(knowledgeDir);
  const hashFile = vectorCacheFile + '.hash';

  const cacheIsFresh =
    fs.existsSync(vectorCacheFile) &&
    fs.existsSync(hashFile) &&
    fs.readFileSync(hashFile, 'utf-8').trim() === currentHash;

  if (cacheIsFresh && store.loadFromDisk(vectorCacheFile)) {
    return store;
  }

  console.log('[ingest] No fresh cache found — running full ingestion pipeline...');

  // 1. Extract text from PDFs
  const documents = await loadKnowledgeBase(knowledgeDir);

  // 2. Chunk into overlapping, metadata-tagged passages
  const chunks = chunkDocuments(documents);

  // 3. Generate embeddings for every chunk (local model, free)
  const texts = chunks.map((c) => c.text);
  const vectors = await embedBatch(texts);

  // 4. Populate the vector store
  const chunksWithVectors = chunks.map((chunk, i) => ({ ...chunk, vector: vectors[i] }));
  store.addChunks(chunksWithVectors);

  // 5. Persist cache for fast future startups
  store.saveToDisk(vectorCacheFile);
  fs.writeFileSync(hashFile, currentHash, 'utf-8');

  return store;
}

module.exports = { buildVectorStore };

// Allows running `npm run ingest` standalone to pre-warm the cache.
if (require.main === module) {
  buildVectorStore()
    .then((store) => {
      console.log(`[ingest] Done. Vector store contains ${store.size()} chunks.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[ingest] Ingestion failed:', err);
      process.exit(1);
    });
}
