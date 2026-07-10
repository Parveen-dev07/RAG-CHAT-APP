const { ChromaClient } = require("chromadb");

async function main() {
  const client = new ChromaClient({ path: "http://localhost:8000" });
  const collection = await client.getOrCreateCollection({ name: "my_docs" });

  const result = await collection.get({ limit: 10 });
  result.documents.forEach((doc, i) => {
    console.log(`\n[Chunk ${i}] id=${result.ids[i]}`);
    console.log(doc);
  });
}

main().catch(console.error);

