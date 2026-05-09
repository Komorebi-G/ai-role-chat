"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface Character {
  id: string;
  name: string;
  description: string;
  firstMessage: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export default function ChatPage() {
  const router = useRouter();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/characters")
      .then((res) => {
        if (res.status === 401) {
          setUnauthorized(true);
          return [];
        }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setCharacters(data);
      })
      .catch(() => setUnauthorized(true));
  }, []);

  useEffect(() => {
    if (unauthorized) {
      router.replace("/login");
    }
  }, [unauthorized, router]);

  useEffect(() => {
    if (!selectedChar) return;

    fetch(`/api/chat?characterId=${selectedChar.id}`)
      .then((res) => {
        if (res.status === 401) {
          setUnauthorized(true);
          return [];
        }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setMessages(data);
      })
      .catch(() => {});
  }, [selectedChar]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !selectedChar || loading) return;

    const message = input.trim();
    setInput("");
    setError("");

    // Optimistically add user message
    const optimisticId = Date.now().toString();
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, role: "user", content: message, createdAt: new Date().toISOString() },
    ]);

    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: selectedChar.id, message }),
      });

      if (res.status === 401) {
        setUnauthorized(true);
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Send failed");
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.reply,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch {
      setError("Network error");
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (unauthorized) return null;

  return (
    <div className="chat-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <span>Characters</span>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
        <div className="character-list">
          {characters.map((c) => (
            <div
              key={c.id}
              className={`character-item ${selectedChar?.id === c.id ? "active" : ""}`}
              onClick={() => setSelectedChar(c)}
            >
              <div className="char-name">{c.name}</div>
              <div className="char-desc">{c.description}</div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main chat area */}
      <main className="chat-main">
        {selectedChar ? (
          <>
            <div className="chat-header">{selectedChar.name}</div>
            <div className="chat-messages">
              {error && <div className="error-msg">{error}</div>}
              {messages.map((m) => (
                <div key={m.id} className={`message ${m.role}`}>
                  {m.content}
                </div>
              ))}
              {loading && (
                <div className="message assistant">
                  <span className="loading-dots">Thinking</span>
                </div>
              )}
              <div ref={messagesEnd} />
            </div>
            <form className="chat-input-area" onSubmit={handleSend}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                disabled={loading}
              />
              <button type="submit" disabled={loading || !input.trim()}>
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="placeholder">Select a character to start chatting</div>
        )}
      </main>
    </div>
  );
}
