import { NextRequest, NextResponse } from "next/server";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { getOrCreateCollection } from "@/lib/chroma";
import { getEmbeddings } from "@/lib/gemini";

// Optional convenience endpoint: lets you add more text into ChromaDB
// straight from the browser/Postman, instead of only via `npm run ingest`.
export async function POST(req: NextRequest) {
  try {
    const { text, source } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Missing 'text' in request body" },
        { status: 400 }
      );
    }

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 150,
    });
    const chunks = await splitter.splitText(text);

    const embeddings = getEmbeddings();
    const vectors = await embeddings.embedDocuments(chunks);

    const collection = await getOrCreateCollection();
    const idPrefix = (source || "manual-upload").replace(/\s+/g, "-");
    console.log("show chunks---->",chunks)

    console.log("show embenddings---->",embeddings)


    console.log("show vectores----->",vectors)

    await collection.upsert({
      ids: chunks.map((_:any, i:any) => `${idPrefix}-${Date.now()}-${i}`),
      embeddings: vectors,
      documents: chunks,
      metadatas: chunks.map((_:any, i:any) => ({
        source: source || "manual-upload",
        chunkIndex: i,
      })),
    });
    



    return NextResponse.json({ added: chunks.length });
  } catch (err: any) {
    console.error("Ingest route error:", err);
    return NextResponse.json(
      { error: err.message || "Something went wrong" },

      { status: 500 }
    );
  }
}
  
