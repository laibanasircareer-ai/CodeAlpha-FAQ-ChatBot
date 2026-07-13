/**
 * pdfLoader.js
 * -----------------------------------------------------------------------
 * Responsible for ONE thing: reading PDF files from disk and turning them
 * into structured, page-aware text. Nothing in this file knows about
 * chunking, embeddings, or retrieval — single responsibility principle.
 *
 * We use `pdf-parse` because it gives us a low-level `pagerender` hook,
 * which lets us capture text PAGE BY PAGE instead of one giant blob.
 * Page numbers are essential later for accurate source citations.
 * -----------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

/**
 * Extracts text from a single PDF, page by page.
 * @param {string} filePath - Absolute path to the PDF file.
 * @returns {Promise<{ pages: string[], fullText: string }>}
 */
async function extractPdfPages(filePath) {
  const buffer = fs.readFileSync(filePath);
  const pages = [];

  // pagerender is called once per page during parsing; we intercept it to
  // capture per-page text before pdf-parse concatenates everything.
  const options = {
    pagerender: async (pageData) => {
      const textContent = await pageData.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(' ');
      pages.push(pageText);
      return pageText;
    },
  };

  const data = await pdfParse(buffer, options);

  return {
    pages,
    fullText: data.text,
    numPages: data.numpages,
  };
}

/**
 * Loads every PDF found in the knowledge directory.
 * @param {string} knowledgeDir
 * @returns {Promise<Array<{ documentName: string, fileName: string, pages: string[] }>>}
 */
async function loadKnowledgeBase(knowledgeDir) {
  if (!fs.existsSync(knowledgeDir)) {
    throw new Error(`Knowledge directory not found: ${knowledgeDir}`);
  }

  const files = fs
    .readdirSync(knowledgeDir)
    .filter((f) => f.toLowerCase().endsWith('.pdf'));

  if (files.length === 0) {
    throw new Error(
      `No PDF files found in ${knowledgeDir}. Please add the IT Policy and Duty of Care PDFs.`
    );
  }

  const documents = [];

  for (const fileName of files) {
    const filePath = path.join(knowledgeDir, fileName);
    try {
      const { pages } = await extractPdfPages(filePath);
      const documentName = path.basename(fileName, '.pdf');
      documents.push({ documentName, fileName, pages });
      console.log(`[pdfLoader] Loaded "${documentName}" (${pages.length} pages)`);
    } catch (err) {
      // A single corrupt PDF shouldn't crash the whole ingestion pipeline.
      console.error(`[pdfLoader] Failed to read ${fileName}:`, err.message);
    }
  }

  if (documents.length === 0) {
    throw new Error('All PDF files failed to load. Check that they are valid, unencrypted PDFs.');
  }

  return documents;
}

module.exports = { extractPdfPages, loadKnowledgeBase };
