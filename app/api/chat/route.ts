import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCollection } from "@/lib/chroma";
import { getEmbeddings, getChatModel } from "@/lib/ollama";

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Missing 'question' in request body" },
        { status: 400 }
      );
    }

    // --- RAG step 1: retrieve -------------------------------------------
    // Embed the question (same embedding model used at ingestion time)
    // and pull the top-k most similar chunks from ChromaDB.
    const embeddings = getEmbeddings();
    const questionVector = await embeddings.embedQuery(question);

    const collection = await getOrCreateCollection();
    const results = await collection.query({
      queryEmbeddings: [questionVector],
      nResults: 4,
    });

    const retrievedDocs: string[] | null = results.documents?.[0] || [];
    const retrievedMetadatas: Record<string, any>[] =
      (results.metadatas?.[0] as any) || [];

    const context = retrievedDocs!
      .map((doc, i) => `[Chunk ${i + 1}]\n${doc}`)
      .join("\n\n");

    // --- RAG step 2: augment ---------------------------------------------
    // Stuff the retrieved chunks into the prompt as grounding context.
//     const prompt = `You are a helpful assistant. Answer the user's question using ONLY the context below.
// If the context doesn't contain the answer, say you don't know based on the available documents.

// Context:
// ${context || "(no relevant context found)"}

// Question: ${question}

// Answer:`;
 const prompt = `You are a helpful assistant. If the context below is relevant, use it. If not, ignore it and just answer normally.

Context:
${context || "(no relevant context found)"}

Question: ${question}

Answer:`;



    // --- RAG step 3: generate ---------------------------------------------
    const model = getChatModel();
    const response = await model.invoke(prompt);

    return NextResponse.json({
      answer: response.content,
      sources: retrievedMetadatas,
    });
  } catch (err: any) {
    console.error("Chat route error:", err);
    return NextResponse.json(
      { error: err.message || "Something went wrong" },
      { status: 500 }
    );
  }
}
