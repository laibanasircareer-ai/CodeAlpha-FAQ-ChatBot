

A production-style **Retrieval-Augmented Generation (RAG)** chatbot that answers
questions strictly from CODE Pakistan's **IT Policy** and **Duty of Care**
documents — with semantic search, source citations, and conversation memory.

Built as a full-stack demonstration of modern AI-engineering practice: local
embeddings, vector search, grounded generation via Groq, and a clean
enterprise-style UI.

---

## 1. Project Overview

| | |
|---|---|
| **Frontend** | HTML / CSS / vanilla JavaScript (no framework) |
| **Backend** | Node.js + Express |
| **LLM** | Groq Chat Completions API (`llama-3.3-70b-versatile`) |
| **Embeddings** | Local, free — `@xenova/transformers` (`Xenova/all-MiniLM-L6-v2`) |
| **Vector store** | In-memory, cosine-similarity, disk-cached |
| **PDF parsing** | `pdf-parse`, page-aware extraction |

The assistant **never** answers from general knowledge. If a question isn't
covered by the two source documents, it replies with exactly:

> "I couldn't find that information in the provided CODE Pakistan policy documents."

---

## 📸 Screenshots

### Home Interface
<img width="1458" height="751" alt="Screenshot 2026-07-13 231513" src="https://github.com/user-attachments/assets/5599c1e4-8288-4105-83e9-824ea82036a5" />

### AI Chat Response with Source Citations
<img width="1439" height="755" alt="Screenshot 2026-07-13 231548" src="https://github.com/user-attachments/assets/0dc55abd-52f5-4241-b861-3fdcff1eb382" />

### Semantic Search & RAG Answer
<img width="1439" height="759" alt="Screenshot 2026-07-13 231626" src="https://github.com/user-attachments/assets/cc7d447c-930a-41ac-9e10-26098ad0b023" />

### Dark Mode
<img width="1461" height="765" alt="Screenshot 2026-07-13 231431" src="https://github.com/user-attachments/assets/56ed3c22-0080-4975-a508-461149dded04" />

---

## 2. Architecture

```
                     ┌─────────────────────────────────────────────┐
                     │              INGESTION (startup)             │
                     │                                               │
   knowledge/*.pdf ──▶  pdfLoader.js  ──▶  chunker.js  ──▶ embeddingService.js
                     │  (extract text,     (300-500 word    (local model,
                     │   page by page)      overlapping       384-dim vectors)
                     │                      chunks + meta)         │
                     │                                               ▼
                     │                                       vectorStore.js
                     │                                    (in-memory + disk cache)
                     └─────────────────────────────────────────────┘
                                              │
                     ┌────────────────────────┼─────────────────────────┐
                     │               QUERY (per request)                 │
                     │                                                    │
   User question ──▶ ragPipeline.js ──▶ retriever.js ──▶ vectorStore.search()
                     │      │            (embed query,        (cosine similarity,
                     │      │             top-K lookup)         top 4 chunks)
                     │      ▼
                     │  groqService.js ──▶ Groq API (grounded answer)
                     │      │
                     │      ▼
                     │  answer + citations + updated conversation memory
                     └────────────────────────────────────────────────────┘
                                              │
                                              ▼
                                    frontend (chat UI, citations,
                                     dark/light mode, quick questions)
```

**Why an in-memory vector store instead of FAISS/ChromaDB?**
The corpus here is two short policy PDFs — on the order of tens of chunks.
At that scale, a flat array with brute-force cosine similarity is O(n) per
query and runs in well under a millisecond, with zero native-binary or
extra-server install friction. The `VectorStore` class exposes a simple
`addChunks()` / `search()` interface, so swapping in FAISS or ChromaDB later
is a drop-in replacement — nothing else in the codebase needs to change.

**Why local embeddings?**
`@xenova/transformers` runs the `all-MiniLM-L6-v2` sentence-embedding model
directly in Node via ONNX/WASM — no OpenAI key, no per-call cost, and no
external network dependency once the model is cached locally.

---

## 3. Project Structure

```
code-pakistan-assistant/
├── frontend/
│   ├── index.html          # UI markup (header, sidebar, chat, composer)
│   ├── style.css            # Design system (CODE Pakistan palette, dark/light)
│   └── script.js             # Chat logic, API calls, citations, theme toggle
│
├── backend/
│   ├── server.js             # Express app entry point
│   ├── routes/
│   │   └── chatRoutes.js     # /api/chat, /api/chat/clear, /api/health
│   ├── services/
│   │   ├── pdfLoader.js      # PDF → page-level text extraction
│   │   ├── chunker.js        # Text → overlapping, metadata-tagged chunks
│   │   ├── embeddingService.js  # Local embedding model wrapper
│   │   ├── vectorStore.js    # In-memory vector DB + cosine similarity
│   │   ├── ingest.js         # Orchestrates PDF→chunk→embed→store (+ caching)
│   │   ├── retriever.js      # Query embedding + top-K semantic search
│   │   ├── groqService.js    # Groq Chat Completions wrapper
│   │   └── ragPipeline.js    # Orchestration: retrieval + memory + generation
│   └── utils/
│       └── config.js         # Centralized environment/config
│
├── knowledge/
│   ├── IT Policy.pdf
│   └── IT Duty of Care.pdf
│
├── .env.example
├── package.json
└── README.md
```

---

## 4. Installation

**Requirements:** Node.js 18+ (for native `--watch` and modern JS features).

```bash
git clone <your-repo-url>
cd code-pakistan-assistant
npm install
```

Then create your local environment file:

```bash
cp .env.example .env
```

Open `.env` and set your Groq API key:

```
GROQ_API_KEY=your_groq_api_key_here
```

Get a free key at **https://console.groq.com/keys**.

---

## 5. Running Locally

```bash
npm start
```

On first run, the server will:
1. Read the PDFs from `knowledge/`
2. Extract and chunk their text
3. Generate embeddings locally (this downloads the ~90MB embedding model
   once, then it's cached by `@xenova/transformers`)
4. Cache the resulting vectors to `knowledge/.vector-cache.json` so future
   restarts are near-instant (the cache auto-invalidates if you edit the PDFs)

Then open:

```
http://localhost:3000
```

Optional: pre-warm the vector cache without starting the server:

```bash
npm run ingest
```

---

## 6. Where to Insert the Groq API Key

`.env` → `GROQ_API_KEY=...`

This is read once in `backend/utils/config.js` and used exclusively by
`backend/services/groqService.js`. It is never sent to the frontend and
never logged.

---

## 7. How the RAG Pipeline Works (Step by Step)

1. **Extraction** — `pdfLoader.js` reads each PDF page-by-page (not as one
   giant blob), so every extracted passage keeps its page number.
2. **Chunking** — `chunker.js` splits each page's text into ~300–500 word
   chunks with a 50-word overlap, and tags each chunk with the document
   name, an inferred section heading, and page number.
3. **Embedding** — `embeddingService.js` turns each chunk into a 384-dimension
   vector using a local sentence-transformer model — no external API call.
4. **Storage** — `vectorStore.js` holds all chunk vectors in memory (and
   persists them to disk so restarts don't require re-embedding).
5. **Retrieval** — On each question, `retriever.js` embeds the query and
   finds the top 3–5 most similar chunks via cosine similarity, discarding
   anything below a minimum relevance threshold.
6. **Grounded generation** — `ragPipeline.js` builds a prompt containing
   *only* the retrieved chunks (never the full documents) plus recent
   conversation turns, and sends it to `groqService.js`, which calls the
   Groq API with a strict system prompt instructing the model to answer
   only from the given context.
7. **Citations** — Each retrieved chunk's document name, section, and page
   number are returned alongside the answer and rendered as citation
   "stamp" cards in the UI.
8. **Memory** — The last few conversation turns are kept per session so
   follow-up questions like "Why?" resolve correctly during retrieval.

---

## 8. Error Handling

- **Missing/unreadable PDFs** → server logs a clear error and exits at
  startup rather than serving an empty knowledge base.
- **Embedding failures** → surfaced with descriptive console errors during
  ingestion; a single corrupt PDF won't crash the whole batch.
- **Groq API failures** (rate limit, network, invalid key) → caught in
  `groqService.js` and returned to the client as a professional error
  message, never a raw stack trace.
- **Invalid requests** (empty question, malformed JSON) → `400` responses
  with a descriptive error from `chatRoutes.js`.
- **Vector store not ready yet** → `503` response so the frontend can retry
  gracefully instead of showing a confusing failure.

---

## 9. Future Improvements

- Swap the in-memory store for FAISS or ChromaDB for larger document sets
- Add hybrid retrieval (BM25 keyword search + semantic search, re-ranked)
- Stream Groq responses token-by-token for a live-typing effect
- Add an admin view to re-upload/re-ingest PDFs without a server restart
- Persist conversation memory in Redis for multi-instance deployments
- Add authentication so only CODE Pakistan staff can access the assistant
- Automated evaluation set (question → expected-source pairs) to track
  retrieval quality over time

---

## 10. Tech Demonstrated

Full-stack development · AI integration · Retrieval-Augmented Generation ·
Semantic search & embeddings · PDF processing · Vector similarity search ·
Clean modular architecture · Conversation-aware prompting

---

*Built as a portfolio project for CODE Pakistan.*
