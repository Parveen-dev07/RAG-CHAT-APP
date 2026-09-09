# RAG Chat — Gemini + ChromaDB + LangChain (Next.js)

A small, minimal project to understand a real RAG (Retrieval-Augmented Generation)
workflow end to end:

```
docs (data/sample.txt)
      │  split into chunks
      ▼
 embeddings (Gemini text-embedding-004)
      │
      ▼
 ChromaDB  (vector database)
      ▲
      │  similarity search on question's embedding
 user question
      │
      ▼
 Gemini chat model (answers using retrieved chunks as context)
      │
      ▼
 chat UI (Next.js frontend)
```

## Project structure

```
rag-gemini-chat/
├── app/
│   ├── page.tsx              # chat UI (frontend)
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── chat/route.ts     # POST /api/chat  -> the actual RAG flow
│       └── ingest/route.ts   # POST /api/ingest -> add more text at runtime
├── lib/
│   ├── gemini.ts              # Gemini embeddings + chat model setup
│   └── chroma.ts              # ChromaDB vector store connection
├── scripts/
│   └── ingest.ts              # one-off script: chunk + embed + store sample.txt
├── data/
│   └── sample.txt              # sample document to ingest (replace with your own)
└── .env.local.example
```

## 1. Install dependencies

```bash
npm install
```

## 2. Set your Gemini API key

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and paste your key (from https://aistudio.google.com/app/apikey):

```
GOOGLE_API_KEY=your_gemini_api_key_here
```

## 3. Run a local ChromaDB server

ChromaDB needs to run as its own server. Easiest way, with Docker:

```bash
docker run -p 8000:8000 chromadb/chroma
```

No Docker? Install and run it with Python instead:

```bash
pip install chromadb
chroma run --path ./chroma-data --port 8000
```

Leave this running in its own terminal — it's your vector database.

## 4. Ingest the sample document

In a new terminal, with the ChromaDB server still running:

```bash
npm run ingest
```

This reads `data/sample.txt`, splits it into ~500-character chunks, embeds
each chunk with Gemini, and stores the vectors in your ChromaDB collection.
Swap in your own `.txt` file (or add more loaders) to use your own content.

## 5. Start the app

```bash
npm run dev
```

Open http://localhost:3000 and ask a question, e.g. **"What is RAG?"** or
**"What does ChromaDB do?"** — the answer will be grounded in `sample.txt`.

## Employee-profile access

Employee records now require a sign-in using either the employee ID or full
name plus password. After sign-in, ask **"my details"** (or use the signed-in
employee ID); employees cannot retrieve another employee's profile.

The starter passwords in the employee documents are `GEEK@EMP` followed by the
three-digit ID, for example `GEEK@EMP003` for `GEEK-EMP-003`. Replace them with
real, unique passwords before deploying. Set a strong `EMPLOYEE_SESSION_SECRET`
in `.env` for production, then run `npm run ingest-all` so password fields are
removed from existing Chroma embeddings.

Each employee record has a `Role` field: `Employee` for standard staff and
`HR` for the HR profile. Static privileged profiles are kept separately in
`data/document/company/admin.txt` and `data/document/company/owner.txt`.
Their starter IDs/passwords are `GEEK-EMP-001` / `GEEK@ADMIN001` and
`GEEK-EMP-002` / `GEEK@OWNER002`; replace both before deployment.

## How the RAG flow works (the important part)

**`lib/gemini.ts`** — creates two Gemini clients:
- an embeddings model (`text-embedding-004`) that turns text into vectors
- a chat model (`gemini-2.0-flash`) that generates natural-language answers

**`lib/chroma.ts`** — connects LangChain's Chroma wrapper to your running
ChromaDB server and collection.

**`scripts/ingest.ts`** (offline, run once / whenever docs change):
1. Load raw text
2. Split into overlapping chunks (`RecursiveCharacterTextSplitter`)
3. Embed each chunk and store it in ChromaDB

**`app/api/chat/route.ts`** (online, runs on every question):
1. **Retrieve** — embed the user's question, run `similaritySearch` against
   ChromaDB, get back the top 4 most relevant chunks
2. **Augment** — stuff those chunks into a prompt as "context"
3. **Generate** — send the prompt to Gemini's chat model and return the answer

That's the entire RAG loop. Everything else in the project (the chat UI,
the extra `/api/ingest` route) is just plumbing around this core flow.

## Extending this

- Replace `data/sample.txt` with your own notes, or add a PDF/CSV loader
  from LangChain's document loaders
- Use `/api/ingest` to add new text without re-running the script
- Swap `gemini-2.0-flash` for another Gemini model in `.env.local`
- Add streaming responses, chat history, or multiple collections per user
