/**
 * Reads data/sample.txt, splits it into chunks, embeds each chunk with
 * Gemini's embedding model, and stores the vectors in ChromaDB directly.
 *
 * Run with: npm run ingest
 * (ChromaDB server must already be running, see README.md)
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { getEmbeddings } from "../lib/ollama";
import { getOrCreateCollection } from "../lib/chroma";

async function main() {
  const filePath = path.join(process.cwd(), "data", "sample.txt");
  const rawText = fs.readFileSync(filePath, "utf-8");

  console.log("1. Loaded raw text:", rawText.length, "characters");

  // Step 1: split the raw text into small overlapping chunks.
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 80,
  });
  const chunks = await splitter.splitText(rawText);
  console.log("2. Split into", chunks.length, "chunks");

  // Step 2: embed each chunk with Gemini.
  console.log("3. Embedding chunks with Gemini...");
  const embeddings = getEmbeddings();
  const vectors = await embeddings.embedDocuments(chunks);

  // Step 3: write chunks + vectors directly into ChromaDB.
  console.log("4. Writing to ChromaDB...");
  const collection = await getOrCreateCollection();

  await collection.upsert({
    ids: chunks.map((_, i) => `sample-${i}`),
    embeddings: vectors,
    documents: chunks,
    metadatas: chunks.map((_, i) => ({ source: "sample.txt", chunkIndex: i })),
  });

  console.log("Done. Your ChromaDB collection is ready for querying.");
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
