import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

// One embeddings instance, reused everywhere (ingestion + query time)
// so vectors are always produced by the same model.
export function getEmbeddings() {
  return new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_API_KEY,
    model: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
  });
}

// Chat model used to actually generate the final answer.
export function getChatModel() {
  return new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model: process.env.GEMINI_CHAT_MODEL || "gemini-2.0-flash",
    temperature: 0.3,
  });
}
