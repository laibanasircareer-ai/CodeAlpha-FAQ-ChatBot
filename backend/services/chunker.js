/**
 * chunker.js
 * -----------------------------------------------------------------------
 * Splits page-level text into overlapping word-count-based chunks and
 * attaches metadata (document name, inferred section title, page number,
 * chunk id) to every chunk. This is what actually gets embedded and
 * retrieved later.
 *
 * Why word-count chunking with overlap?
 *  - It's simple, fast, and works well for policy-manual style text that
 *    doesn't have a rigid structure Claude/JS could reliably parse.
 *  - Overlap (default 50 words) prevents a sentence that straddles a
 *    chunk boundary from losing context in either half.
 * -----------------------------------------------------------------------
 */

const config = require('../utils/config');

// Matches lines like "1.9.4. EMAILS" or "1.0. POLICY STATEMENT..." which are
// the section headers used throughout both source PDFs (numbered headings
// in ALL CAPS or Title Case, e.g. "1.2 MONITORING PROCESS").
const SECTION_HEADER_REGEX = /^\s*(\d+(\.\d+)*\.?)\s+([A-Z][A-Za-z0-9 ,&/()'-]{2,80})\s*$/;

/**
 * Attempts to detect a section title within a block of page text by
 * scanning for numbered-heading patterns. Falls back to "General" if none
 * is found on that page.
 */
function detectSectionTitle(pageText, previousSection) {
  const lines = pageText.split(/(?<=[.:])\s+(?=\d+\.\d)/); // rough split, best-effort
  for (const line of lines) {
    const match = line.trim().match(SECTION_HEADER_REGEX);
    if (match) return match[3].trim();
  }
  return previousSection || 'General';
}

/**
 * Splits an array of words into overlapping chunks of minWords–maxWords.
 */
function splitWordsIntoChunks(words, minWords, maxWords, overlapWords) {
  const chunks = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + maxWords, words.length);
    const chunkWords = words.slice(start, end);

    // Avoid creating a tiny trailing chunk; merge it into the previous one.
    if (chunkWords.length < minWords * 0.4 && chunks.length > 0) {
      chunks[chunks.length - 1].words.push(...chunkWords);
      break;
    }

    chunks.push({ words: chunkWords, startWord: start, endWord: end });

    if (end === words.length) break;
    start = end - overlapWords; // step forward, but re-include the overlap
  }

  return chunks;
}

/**
 * Turns loaded documents (array of { documentName, pages }) into an array
 * of chunk objects ready for embedding.
 *
 * @param {Array<{documentName: string, pages: string[]}>} documents
 * @returns {Array<{id: string, text: string, documentName: string, section: string, page: number}>}
 */
function chunkDocuments(documents) {
  const { minWords, maxWords, overlapWords } = config.chunking;
  const allChunks = [];

  for (const doc of documents) {
    let chunkIndex = 0;
    let runningSection = 'General';

    // We chunk PAGE BY PAGE (rather than across the whole document) so that
    // every chunk can be confidently attributed to a single page number,
    // which the UI needs for citations.
    doc.pages.forEach((pageText, pageIdx) => {
      const cleanText = pageText.replace(/\s+/g, ' ').trim();
      if (!cleanText) return;

      runningSection = detectSectionTitle(cleanText, runningSection);

      const words = cleanText.split(' ');
      const pageChunks = splitWordsIntoChunks(words, minWords, maxWords, overlapWords);

      pageChunks.forEach((c) => {
        const text = c.words.join(' ').trim();
        if (!text) return;
        chunkIndex += 1;
        allChunks.push({
          id: `${doc.documentName}-p${pageIdx + 1}-c${chunkIndex}`,
          text,
          documentName: doc.documentName,
          section: runningSection,
          page: pageIdx + 1,
        });
      });
    });
  }

  console.log(`[chunker] Created ${allChunks.length} chunks from ${documents.length} document(s)`);
  return allChunks;
}

module.exports = { chunkDocuments };
