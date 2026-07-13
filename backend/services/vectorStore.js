/**
 * vectorStore.js
 * -----------------------------------------------------------------------
 * A lightweight, dependency-free, in-memory vector database.
 *
 * WHY IN-MEMORY INSTEAD OF FAISS/CHROMADB?
 * This project's corpus is two short PDFs — a few dozen chunks, a few
 * thousand vectors at most. At that scale:
 *   - FAISS requires native bindings (node-gyp / Python), which adds
 *     heavy install friction for a portfolio project meant to "just run".
 *   - ChromaDB requires running a separate server process/container.
 *   - A flat in-memory array + brute-force cosine similarity is O(n) per
 *     query, which for n ≈ 50-200 chunks completes in well under a
 *     millisecond — indistinguishable from an ANN index at this scale.
 * This keeps the project zero-infrastructure while still demonstrating
 * the real mechanics of vector search. Swapping this module for a FAISS
 * or Chroma-backed implementation later is a drop-in change because the
 * rest of the app only depends on the addChunks/search interface below.
 *
 * We DO persist the computed vectors to a JSON cache file on disk so that
 * restarting the server doesn't require re-embedding every chunk with the
 * local model (which, while free, is not instant).
 * -----------------------------------------------------------------------
 */

const fs = require('fs');

class VectorStore {
  constructor() {
    /** @type {Array<{id:string, text:string, documentName:string, section:string, page:number, vector:number[]}>} */
    this.items = [];
  }

  /**
   * Adds chunks with their pre-computed embedding vectors.
   */
  addChunks(chunksWithVectors) {
    this.items.push(...chunksWithVectors);
  }

  isEmpty() {
    return this.items.length === 0;
  }

  size() {
    return this.items.length;
  }

  /**
   * Cosine similarity between two equal-length vectors.
   * Since our embeddings are already L2-normalized (normalize: true in
   * embeddingService), cosine similarity reduces to a plain dot product —
   * but we compute it generically here in case that ever changes.
   */
  static cosineSimilarity(a, b) {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Returns the topK most similar chunks to the query vector.
   * @param {number[]} queryVector
   * @param {number} topK
   * @returns {Array<{...chunk, score:number}>}
   */
  search(queryVector, topK = 4) {
    const scored = this.items.map((item) => ({
      ...item,
      score: VectorStore.cosineSimilarity(queryVector, item.vector),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /** Persists the current store (chunks + vectors) to a JSON file. */
  saveToDisk(filePath) {
    fs.writeFileSync(filePath, JSON.stringify(this.items), 'utf-8');
    console.log(`[vectorStore] Cached ${this.items.length} vectors to ${filePath}`);
  }

  /** Loads a previously-persisted store from disk, if it exists. */
  loadFromDisk(filePath) {
    if (!fs.existsSync(filePath)) return false;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      this.items = JSON.parse(raw);
      console.log(`[vectorStore] Loaded ${this.items.length} cached vectors from ${filePath}`);
      return true;
    } catch (err) {
      console.warn('[vectorStore] Failed to load cache, will re-embed:', err.message);
      return false;
    }
  }
}

module.exports = VectorStore;
