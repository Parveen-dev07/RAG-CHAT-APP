import { ChromaClient } from "chromadb";

// Talks to ChromaDB directly (instead of through LangChain's Chroma wrapper,
// which has known compatibility issues with recent Chroma server versions).
// We handle embeddings ourselves via Gemini, so Chroma just stores/searches vectors.
export function getChromaClient() {
  return new ChromaClient({
    path: process.env.CHROMA_URL || "http://localhost:8000",
  });
}

export async function getOrCreateCollection() {
  const client = getChromaClient();
  const collection = await client.getOrCreateCollection({
    name: process.env.CHROMA_COLLECTION || "my_docs",
    // We provide our own embeddings at write/query time, so no embeddingFunction needed here.
  });
  return collection;
}
