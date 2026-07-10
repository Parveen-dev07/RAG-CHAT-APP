/**
 * Scans the entire data/ folder (including subfolders), reads every .txt
 * and .pdf file it finds, splits each into chunks, embeds them with Gemini,
 * and stores them all in ChromaDB — one file's chunks per source.
 *
 * Run with: npm run ingest-all
 * (ChromaDB server must already be running, see README.md)
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { getEmbeddings } from "../lib/gemini";
import { getOrCreateCollection } from "../lib/chroma";

const DATA_DIR = path.join(process.cwd(), "data");  

// Recursively find every .txt and .pdf file under data/
function findFiles(dir: string): string[] {
  let results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findFiles(fullPath));
    } else if (/\.(txt|pdf)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

// Turn any supported file into plain text
async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".txt") {
    return fs.readFileSync(filePath, "utf-8");
  }

  if (ext === ".pdf") {
    const dataBuffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: new Uint8Array(dataBuffer) });
    const parsed = await parser.getText();
    await parser.destroy();
    return parsed.text;
  }

  return "";
}

async function main() {
  const files = findFiles(DATA_DIR);

  if (files.length === 0) {
    console.log("No .txt or .pdf files found under data/. Add some and try again.");
    return;
  }

  console.log(`Found ${files.length} file(s):`);
  files.forEach((f) => console.log("  -", path.relative(DATA_DIR, f)));

  const embeddings = getEmbeddings();
  const collection = await getOrCreateCollection();
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 80,
  });

  for (const filePath of files) {
    const source = path.relative(DATA_DIR, filePath);
    console.log(`\n--- Processing: ${source} ---`);

    const rawText = (await extractText(filePath)).trim();

    if (!rawText) {
      console.log("  Skipped (no extractable text — scanned PDF or empty file?)");
      continue;
    }

    console.log("  Extracted", rawText.length, "characters");

    const chunks = await splitter.splitText(rawText);
    console.log("  Split into", chunks.length, "chunks");

    console.log("  Embedding with Gemini...");
    const vectors = await embeddings.embedDocuments(chunks);

    console.log("  Writing to ChromaDB...");
    // Use a sanitized id prefix so filenames with slashes/spaces don't break ids
    const idPrefix = source.replace(/[^a-zA-Z0-9._-]/g, "_");

    await collection.upsert({
      ids: chunks.map((_, i) => `${idPrefix}-${i}`),
      embeddings: vectors,
      documents: chunks,
      metadatas: chunks.map((_, i) => ({ source, chunkIndex: i })),
    });

    console.log(`  Done: ${chunks.length} chunks stored for ${source}`);
  }

  console.log("\nAll files processed. Your ChromaDB collection is up to date.");
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});