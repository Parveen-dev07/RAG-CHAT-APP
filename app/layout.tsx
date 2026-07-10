import "./globals.css";

export const metadata = {
  title: "RAG Chat - Gemini + ChromaDB",
  description: "Small RAG demo using LangChain, Gemini, and ChromaDB",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
