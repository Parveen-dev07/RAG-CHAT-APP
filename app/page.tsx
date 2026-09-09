"use client";

import { useEffect, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
  sources?: Record<string, any>[];
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [employeeRole, setEmployeeRole] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [restoringSession, setRestoringSession] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      try {
        const res = await fetch("/api/auth");
        const data = await res.json();
        if (data.employee) {
          setEmployeeName(data.employee.employeeName);
          setEmployeeRole(data.employee.role);
        }
      } catch {
        // The visitor simply remains signed out when no session is available.
      } finally {
        setRestoringSession(false);
      }
    }

    restoreSession();
  }, []);

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to sign in.");

      setEmployeeName(data.employee.employeeName);
      setEmployeeRole(data.employee.role);
      setPassword("");
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    await fetch("/api/auth", { method: "DELETE" });
    setEmployeeName("");
    setEmployeeRole("");
    setIdentifier("");
  }

  async function handleSend() {
    const question = input.trim();
    if (!question || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Request failed");
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer, sources: data.sources },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err.message}`,
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSend();
  }

  return (
    <div className="page">
      <div className="header">
        <h1 className="geek-infor">Geek Tech Internal AI Knowledge Assistant</h1>
        <p>Ask a question. Answers are grounded in your ingested documents (Gemini + ChromaDB).</p>
      </div>

      <section className="employee-login" aria-label="Employee sign in">
        {restoringSession ? (
          <div className="signed-in">Checking your sign-in session…</div>
        ) : employeeName ? (
          <div className="signed-in">
            <span>
              Signed in as {employeeName} ({employeeRole}). {['HR', 'Admin', 'Owner'].includes(employeeRole)
                ? "You can request all employee details or a specific team."
                : "Ask “my details” to view your profile."}
            </span>
            <button onClick={handleSignOut}>Sign out</button>
          </div>
        ) : (
          <form onSubmit={handleSignIn}>
            <strong>Employee details</strong>
            <span>Sign in with your employee ID or full name and password.</span>
            <div className="login-row">
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Employee ID or full name" required />
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" required />
              <button disabled={authLoading}>{authLoading ? "Signing in…" : "Sign in"}</button>
            </div>
            {authError && <p className="auth-error">{authError}</p>}
          </form>
        )}
      </section>

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty-state">
            Ask about company policies, services, or technologies. Authorized
            HR/Admin/Owner accounts can also request employee profiles, teams,
            or employee IDs and names.
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`bubble ${m.role}${m.isError ? " error" : ""}`}
          >
            {m.content}
            {/* {m.sources && m.sources.length > 0 && (
              <div className="sources">
                Sources: {m.sources.map((s) => s.source).join(", ")}
              </div>
            )} */}
          </div>
        ))}

        {loading && <div className="bubble assistant">Thinking…</div>}
      </div>

      <div className="input-bar">
        <div className="input-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about company knowledge..."
            disabled={loading}
          />
          <button onClick={handleSend} disabled={loading || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
