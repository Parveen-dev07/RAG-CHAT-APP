


/**
 * Scans the entire data/ folder (including subfolders), reads every .txt
 * and .pdf file it finds, splits them into chunks, embeds them with Ollama,
 * and stores them in ChromaDB with useful metadata.
 *
 * Run with: npm run ingest-all
 *
 * ChromaDB server must already be running.
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { getEmbeddings } from "../lib/ollama";
import { getOrCreateCollection } from "../lib/chroma";

const DATA_DIR = path.join(process.cwd(), "data");

// ---------------------------------------------------------
// Find all .txt and .pdf files recursively
// ---------------------------------------------------------

function findFiles(dir: string): string[] {
  let results: string[] = [];

  for (const entry of fs.readdirSync(dir, {
    withFileTypes: true,
  })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results = results.concat(findFiles(fullPath));
    } else if (/\.(txt|pdf)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

// ---------------------------------------------------------
// Extract text from supported files
// ---------------------------------------------------------

async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  // TXT
  if (ext === ".txt") {
    return fs.readFileSync(filePath, "utf-8");
  }

  // PDF
  if (ext === ".pdf") {
    const dataBuffer = fs.readFileSync(filePath);

    const parser = new PDFParse({
      data: new Uint8Array(dataBuffer),
    });

    const parsed = await parser.getText();

    await parser.destroy();

    return parsed.text;
  }

  return "";
}

function normalizeEmployeeLabels(text: string) {
  return text.replace(/\*\*(?:\d+\.\s*)?([^*:\r\n]+):\*\*/g, "$1:");
}

// Extract employee metadata from one employee record.

function extractEmployeeMetadata(record: string) {
  const employeeId =
    record
      .match(/Employee\s+(?:Unique\s+)?ID\s*:\s*(GEEK-EMP-\d+)/i)?.[1]
      ?.toUpperCase() || "";

  const employeeName =
    record.match(/Employee Name\s*:\s*([^\r\n]+)/i)?.[1]?.trim() || "";

  const role =
    record
      .match(/Role\s*:\s*([^\r\n]+)/i)?.[1]
      ?.trim() ||
    record
      .match(/(?:Position|Designation)\s*:\s*([^\r\n]+)/i)?.[1]
      ?.trim() || "";

  return {
    employeeId,
    employeeName,
    role,
  };
}

// Passwords remain in local source records for sign-in, never in Chroma.
function removePasswords(text: string) {
  return text.replace(/^\s*(?:\*\*)?Password(?:\*\*)?\s*:\s*.*(?:\r?\n)?/gim, "");
}

/**
 * Employee source files use an "Employee Unique ID" line to start every
 * record.  Chroma must receive one complete record per document; using a
 * character splitter here causes metadata from the first employee in a chunk
 * to be incorrectly attached to every other employee in that chunk.
 */
function splitEmployeeRecords(text: string): string[] | null {
  const starts = [...text.matchAll(/(?:^|\n)Employee\s+Unique\s+ID\s*:/gi)]
    .map((match) => match.index)
    .filter((index): index is number => index !== undefined);

  if (starts.length === 0) {
    return null;
  }

  return starts
    .map((start, index) => text.slice(start, starts[index + 1]).trim())
    .filter(Boolean);
}

// ---------------------------------------------------------
// Main ingestion
// ---------------------------------------------------------

async function main() {
  const files = findFiles(DATA_DIR);

  if (files.length === 0) {
    console.log(
      "No .txt or .pdf files found under data/. Add some and try again."
    );
    return;
  }

  console.log(`Found ${files.length} file(s):`);

  files.forEach((file) => {
    console.log("  -", path.relative(DATA_DIR, file));
  });

  const embeddings = getEmbeddings();
  const collection = await getOrCreateCollection();

  // Used only for normal documents which do not contain employee records.
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 100,
  });

  for (const filePath of files) {
    const source = path.relative(DATA_DIR, filePath);

    console.log(`\n--- Processing: ${source} ---`);

    const rawText = normalizeEmployeeLabels((await extractText(filePath)).trim());

    if (!rawText) {
      console.log(
        "  Skipped (no extractable text — scanned PDF or empty file?)"
      );
      continue;
    }

    console.log(
      "  Extracted",
      rawText.length,
      "characters"
    );

    const employeeRecords = splitEmployeeRecords(rawText);
    const chunks = (employeeRecords || (await splitter.splitText(rawText))).map(
      removePasswords
    );

    console.log(
      "  Split into",
      chunks.length,
      "chunks"
    );

    // -----------------------------------------------------
    // Extract metadata
    // -----------------------------------------------------

    const metadatas = chunks.map((chunk, index) => {
      const employee = extractEmployeeMetadata(chunk);

      return {
        source,
        chunkIndex: index,
        documentType: employee.employeeId ? "employee" : "knowledge",

        // Employee metadata
        employeeId: employee.employeeId,
        employeeName: employee.employeeName,
        role: employee.role,
      };
    });

    console.log(
      `  ${employeeRecords ? "Detected employee records" : "Created text chunks"}: ${chunks.length}`
    );
    console.log("  Embedding with Ollama...");

    const vectors = await embeddings.embedDocuments(chunks);

    console.log("  Writing to ChromaDB...");

    // Remove characters that could cause issues in IDs
    const idPrefix = source.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

    // Remove the previous version of this file first. Without this, an older
    // bad chunk can remain in Chroma after the source file changes.
    await collection.delete({ where: { source } });

    await collection.upsert({
      ids: chunks.map((_, index) => {
        const employee = metadatas[index].employeeId;
        return employee ? `${idPrefix}-${employee}` : `${idPrefix}-${index}`;
      }),

      embeddings: vectors,

      documents: chunks,

      metadatas,
    });

    console.log(
      `  Done: ${chunks.length} chunks stored for ${source}`
    );
  }

  console.log(
    "\nAll files processed. Your ChromaDB collection is up to date."
  );
}


main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
})
