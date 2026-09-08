# RAG Chat Implementation Guide

This document explains how this project is built, in the order in which the functionality should be implemented and understood.

## Section 1: Implementation Flow

### 1. Define the feature

The feature is a document question-answering system:

1. Read documents from `data/`.
2. Split documents into smaller, overlapping chunks.
3. Convert every chunk into an embedding vector.
4. Store the chunks and vectors in ChromaDB.
5. Convert a user's question into an embedding vector.
6. Search ChromaDB for the most similar chunks.
7. Add the retrieved chunks to the model prompt.
8. Ask the chat model to generate the final answer.
9. Return the answer and source metadata to the chat UI.

The important distinction is:

- Ingestion is an offline or occasional operation.
- Retrieval and answer generation happen for every chat question.




1. Chunk = small piece of a document.
2. Embedding = representation of the meaning of text.
4. Vector = numerical list representing that text.
6. Vector database = stores those vectors and helps find similar information. 

### 2. Create the project configuration

The configuration layer makes the application reproducible and keeps environment-specific values outside the source code.

Files involved:

- `package.json`: dependencies and commands.
- `tsconfig.json`: TypeScript settings and the `@/*` import alias.
- `next.config.js`: allows the ChromaDB package to run in the Next.js server environment.
- `.env.local`: secrets and service URLs. This file should not be committed.
- `next-env.d.ts`: Next.js TypeScript support.

Required external services in the current implementation:

- ChromaDB at `http://localhost:8000`.
- Ollama at `http://localhost:11434`.
- Ollama models `nomic-embed-text` and `llama3.2`.

The Gemini client also exists in `lib/gemini.ts`, but the active chat route and batch ingestion script currently use Ollama. Keep the embedding provider consistent between ingestion and querying; vectors made by different embedding models should not be mixed in one collection.

### 3. Install dependencies

From the project root:

```bash
npm install
```

Start ChromaDB in a separate terminal:

```bash
docker run -p 8000:8000 chromadb/chroma
```

Start Ollama and download the models used by `lib/ollama.ts`:

```bash
ollama serve
ollama pull nomic-embed-text
ollama pull llama3.2
```

### 4. Create the shared service layer

The service layer hides external integrations from routes and scripts.

#### `lib/ollama.ts`

This file creates two model clients:

- `getEmbeddings()`: turns text into vectors with `nomic-embed-text`.
- `getChatModel()`: generates answers with `llama3.2`.

Both ingestion and chat must use the same embedding function.

#### `lib/gemini.ts`

This is an alternative model service using Gemini. It provides:

- `getEmbeddings()` for Gemini embeddings.
- `getChatModel()` for Gemini chat generation.

If Gemini is selected as the provider, use it consistently in both ingestion and chat, configure `GOOGLE_API_KEY`, and do not mix its vectors with Ollama vectors.

#### `lib/chroma.ts`

This file owns the ChromaDB connection:

1. Read `CHROMA_URL`, or use `http://localhost:8000`.
2. Read `CHROMA_COLLECTION`, or use `my_docs`.
3. Create the collection if it does not exist.
4. Return the collection to ingestion and chat code.

### 5. Implement document ingestion

Ingestion prepares the searchable knowledge base.

The main implementation is `scripts/ingest-all.ts`:

1. Scan the complete `data/` directory recursively.
2. Find `.txt` and `.pdf` files.
3. Extract plain text from each file.
4. Split text using `RecursiveCharacterTextSplitter`.
5. Use `chunkSize: 500` and `chunkOverlap: 80`.
6. Create an embedding for every chunk.
7. Store `ids`, `embeddings`, `documents`, and `metadatas` in ChromaDB.
8. Save the source file and chunk index as metadata.
9. Use `upsert`, so rerunning ingestion updates existing chunk IDs.

Run it with:

```bash
npm run ingest-all
```

The smaller `scripts/ingest.ts` demonstrates the same process for only `data/sample.txt`. It is useful as a learning example, but it is not currently registered as an npm command in `package.json`.

### 6. Implement runtime ingestion

`app/api/ingest/route.ts` exposes a `POST /api/ingest` endpoint for adding text without running the batch script.

Request shape:

```json
{
  "text": "Text to add to the knowledge base",
  "source": "manual-upload.txt"
}
```

Runtime flow:

1. Parse and validate `text`.
2. Split the text into overlapping chunks.
3. Embed the chunks.
4. Get the ChromaDB collection.
5. Upsert the vectors and source metadata.
6. Return the number of chunks added.

Note: this route currently imports Gemini embeddings while the batch script and chat route use Ollama. Select one provider and align this route before using it in production.

### 7. Implement the chat route

`app/api/chat/route.ts` is the main online RAG route. It runs on every question.

#### Retrieve

1. Accept a JSON body containing `question`.
2. Validate that the question is a non-empty string.
3. Embed the question with `getEmbeddings()`.
4. Query ChromaDB with that vector.
5. Request the top four results with `nResults: 4`.

#### Augment

1. Read the returned documents.
2. Label each result as a chunk.
3. Join the chunks into a context string.
4. Insert the context and user question into the model prompt.

#### Generate

1. Create the chat model with `getChatModel()`.
2. Invoke the model with the prompt.
3. Return the generated answer and retrieved source metadata.
4. Return HTTP 400 for invalid input and HTTP 500 for server failures.

The runtime sequence is:

```text
question
   |
   v
validate request
   |
   v
embed question
   |
   v
similarity search in ChromaDB
   |
   v
build context prompt
   |
   v
invoke chat model
   |
   v
answer + sources
```

### 8. Build the frontend

`app/page.tsx` is the client-side chat screen.

1. Keep messages in React state.
2. Read the question from the input field.
3. Send `POST /api/chat` with `{ question }`.
4. Add the user's message immediately.
5. Show a loading state while the route runs.
6. Add the assistant answer and sources to the message list.
7. Show an error message when the request fails.
8. Allow Enter to submit the question.

`app/layout.tsx` and `app/globals.css` provide the shared page shell and styling.

### 9. Add authentication and persistence later

`app/api/auth/route.ts` currently acts as a test route. It is not yet authenticating users.

`lib/mongodb.ts` is currently empty. MongoDB is not part of the active RAG flow yet.

A later production flow could add:

1. User registration and login.
2. Session or token validation in API routes.
3. Chat history stored in MongoDB.
4. User-specific Chroma collections or metadata filters.
5. Access control around ingestion.

### 10. Verify the complete feature

Run the services first, then ingest documents, then start Next.js:

```bash
npm run ingest-all
npm run dev
```

Open `http://localhost:3000` and ask a question related to a document under `data/`.

A successful test proves that:

- The document was found and extracted.
- Chunks were created.
- Embeddings were generated.
- ChromaDB accepted the vectors.
- The question was embedded with the same embedding provider.
- Similar chunks were retrieved.
- The chat model returned an answer.
- The UI displayed the answer and sources.

## Section 2: Scratch Architecture, Serial by Project File

### A. Project structure

```text
Rag-gemini-chat/
|
|-- package.json              Dependencies and npm commands
|-- tsconfig.json             TypeScript and @/* path alias
|-- next.config.js            Next.js server package configuration
|-- README.md                 Existing short project overview
|-- RAG_IMPLEMENTATION_GUIDE.md  This detailed implementation flow
|
|-- data/
|   |-- sample.txt            Example knowledge document
|   `-- document/index.txt    Another text document
|
|-- lib/
|   |-- ollama.ts             Active embedding and chat model service
|   |-- gemini.ts             Alternative Gemini model service
|   |-- chroma.ts             ChromaDB client and collection service
|   `-- mongodb.ts            Reserved; currently empty
|
|-- scripts/
|   |-- ingest-all.ts         Batch ingestion for all TXT and PDF files
|   `-- ingest.ts             Example ingestion for sample.txt
|
`-- app/
    |-- layout.tsx             Root HTML/layout wrapper
    |-- page.tsx               Chat UI
    |-- globals.css             Global styles
    `-- api/
        |-- chat/route.ts      Retrieval, augmentation, and generation
        |-- ingest/route.ts    Add text through an HTTP endpoint
        `-- auth/route.ts      Test endpoint; authentication pending
```

### B. Serial startup order

```text
1. npm install
      |
2. Start ChromaDB
      |
3. Start Ollama and required models
      |
4. Put TXT/PDF documents in data/
      |
5. Run npm run ingest-all
      |
6. ChromaDB stores chunks + vectors + metadata
      |
7. Run npm run dev
      |
8. Browser loads app/page.tsx
      |
9. User submits a question
      |
10. page.tsx calls POST /api/chat
      |
11. chat route embeds the question
      |
12. chat route searches ChromaDB
      |
13. chat route builds the context prompt
      |
14. chat route calls the chat model
      |
15. JSON answer returns to page.tsx
      |
16. UI renders answer and sources
```

### C. Ingestion scratch flow

```text
file in data/
   |
   v
findFiles()
   |
   v
extractText()
   |
   v
RecursiveCharacterTextSplitter
   |  chunkSize = 500
   |  overlap = 80
   v
getEmbeddings().embedDocuments(chunks)
   |
   v
getOrCreateCollection()
   |
   v
collection.upsert({ ids, embeddings, documents, metadatas })
   |
   v
searchable ChromaDB collection
```

### D. Chat scratch flow

```text
browser input
   |
   v
POST /api/chat { question }
   |
   v
getEmbeddings().embedQuery(question)
   |
   v
collection.query({ queryEmbeddings, nResults: 4 })
   |
   v
retrieved documents + metadata
   |
   v
context string
   |
   v
prompt = context + question
   |
   v
getChatModel().invoke(prompt)
   |
   v
{ answer, sources }
   |
   v
React message state
```

### E. Responsibility table

| Layer | File | Responsibility |
|---|---|---|
| Configuration | `package.json`, `tsconfig.json`, `next.config.js` | Runtime, dependencies, aliases, and build settings |
| Model service | `lib/ollama.ts` or `lib/gemini.ts` | Embedding and chat model clients |
| Vector service | `lib/chroma.ts` | ChromaDB connection and collection access |
| Batch ingestion | `scripts/ingest-all.ts` | Convert files into searchable vectors |
| Runtime ingestion | `app/api/ingest/route.ts` | Add submitted text to the vector store |
| RAG API | `app/api/chat/route.ts` | Retrieve context and generate answers |
| Frontend | `app/page.tsx` | Send questions and render responses |
| Future auth | `app/api/auth/route.ts` | Authentication endpoint placeholder |
| Future database | `lib/mongodb.ts` | MongoDB service placeholder |

### F. Current project checks

Before extending the project, keep these facts in mind:

- `scripts/ingest-all.ts` and `app/api/chat/route.ts` use Ollama.
- `app/api/ingest/route.ts` uses Gemini embeddings.
- `lib/gemini.ts` is available but is not the active provider for chat.
- `npm run ingest` is mentioned in older comments and the README, but `package.json` currently defines `ingest-all` only.
- `CHROMA_URL` and `CHROMA_COLLECTION` are optional because `lib/chroma.ts` has defaults.
- Embedding dimensions and vector space must remain compatible across ingestion and querying.
- Authentication, MongoDB persistence, streaming, and chat history are not implemented yet.

### G. Recommended production improvements

1. Choose one model provider and use it in every ingestion and query path.
2. Move Ollama URLs and model names into environment variables.
3. Protect the ingestion endpoint with authentication.
4. Validate and sanitize source names and uploaded content.
5. Add document IDs and versioning for reliable re-ingestion and deletion.
6. Add retrieval scores and citations to the response.
7. Add tests for chunking, invalid requests, ingestion, and retrieval.
8. Add streaming responses for a better chat experience.
9. Add MongoDB persistence only when user accounts and chat history are needed.
