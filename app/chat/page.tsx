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

interface AdminUser {
  id: string;
  username: string;
  role: string;
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
  const [role, setRole] = useState<string>("user");
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
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
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.role) setRole(data.role);
      })
      .catch(() => {});
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
        if (Array.isArray(data)) {
          if (data.length === 0 && selectedChar.firstMessage) {
            setMessages([
              {
                id: "first_mes",
                role: "assistant",
                content: selectedChar.firstMessage,
                createdAt: new Date().toISOString(),
              },
            ]);
          } else {
            setMessages(data);
          }
        }
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

  async function loadAdminUsers() {
    setAdminLoading(true);
    setAdminError("");
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      setAdminUsers(data);
    } catch {
      setAdminError("Failed to load users");
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleDeleteUser(userId: string) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setAdminError(data.error || "Delete failed");
        return;
      }
      setAdminUsers((prev) => prev.filter((u) => u.id !== userId));
      setDeleteConfirm(null);
    } catch {
      setAdminError("Network error");
    }
  }

  function openAdmin() {
    setShowAdmin(true);
    loadAdminUsers();
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
        {role === "admin" && (
          <div className="sidebar-admin">
            <button className="admin-btn" onClick={openAdmin}>
              User Management
            </button>
          </div>
        )}
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

      {/* Admin modal */}
      {showAdmin && (
        <div className="modal-overlay" onClick={() => { setShowAdmin(false); setDeleteConfirm(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>User Management</h2>
              <button className="modal-close" onClick={() => { setShowAdmin(false); setDeleteConfirm(null); }}>X</button>
            </div>
            {adminError && <div className="error-msg">{adminError}</div>}
            {adminLoading ? (
              <p className="modal-loading">Loading...</p>
            ) : (
              <table className="user-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Registered</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map((u) => (
                    <tr key={u.id}>
                      <td>{u.username}</td>
                      <td className={`role-${u.role}`}>{u.role}</td>
                      <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td>
                        {deleteConfirm === u.id ? (
                          <span className="confirm-group">
                            <button className="btn-sm btn-danger" onClick={() => handleDeleteUser(u.id)}>Confirm</button>
                            <button className="btn-sm" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                          </span>
                        ) : (
                          <button
                            className="btn-sm btn-danger-outline"
                            onClick={() => setDeleteConfirm(u.id)}
                            disabled={u.id === "demo"}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
