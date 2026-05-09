"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";

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

interface ChatSettings {
  temperature: number;
  maxTokens: number;
}

function loadSettings(): ChatSettings {
  if (typeof window === "undefined") return { temperature: 0.8, maxTokens: 1024 };
  try {
    const stored = localStorage.getItem("chat-settings");
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { temperature: 0.8, maxTokens: 1024 };
}

function saveSettings(s: ChatSettings) {
  try { localStorage.setItem("chat-settings", JSON.stringify(s)); } catch { /* ignore */ }
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
  const [clearLoading, setClearLoading] = useState(false);
  const [settings, setSettings] = useState<ChatSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateChar, setShowCreateChar] = useState(false);
  const [charForm, setCharForm] = useState({
    id: "", name: "", description: "", personality: "", scenario: "",
    first_mes: "", mes_example: "", system_prompt: "",
  });
  const [charCreating, setCharCreating] = useState(false);
  const [charError, setCharError] = useState("");
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
        body: JSON.stringify({
          characterId: selectedChar.id,
          message,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
        }),
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

  async function handleClearChat() {
    if (!selectedChar) return;
    setClearLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/chat?characterId=${selectedChar.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Clear failed");
        return;
      }
      setMessages([]);
    } catch {
      setError("Network error");
    } finally {
      setClearLoading(false);
    }
  }

  async function handleCreateChar(e: React.FormEvent) {
    e.preventDefault();
    if (!charForm.id || !charForm.name) {
      setCharError("ID and Name are required");
      return;
    }
    setCharCreating(true);
    setCharError("");
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(charForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setCharError(data.error || "Create failed");
        return;
      }
      // Reload character list
      const refresh = await fetch("/api/characters");
      if (refresh.ok) {
        const list = await refresh.json();
        if (Array.isArray(list)) setCharacters(list);
      }
      setShowCreateChar(false);
      setCharForm({ id: "", name: "", description: "", personality: "", scenario: "", first_mes: "", mes_example: "", system_prompt: "" });
    } catch {
      setCharError("Network error");
    } finally {
      setCharCreating(false);
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
          <div className="sidebar-actions">
            <button className="icon-btn" onClick={() => setShowSettings(true)} title="Settings">
              &#9881;
            </button>
            <button className="logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
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
            <button className="admin-btn" onClick={() => setShowCreateChar(true)}>
              + Create Character
            </button>
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
            <div className="chat-header">
              <span>{selectedChar.name}</span>
              <button
                className="clear-btn"
                onClick={handleClearChat}
                disabled={clearLoading || messages.length === 0}
              >
                {clearLoading ? "Clearing..." : "Clear"}
              </button>
            </div>
            <div className="chat-messages">
              {error && <div className="error-msg">{error}</div>}
              {messages.map((m) => (
                <div key={m.id} className={`message ${m.role}`}>
                  <ReactMarkdown>{m.content}</ReactMarkdown>
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

      {/* Create Character modal */}
      {showCreateChar && (
        <div className="modal-overlay" onClick={() => setShowCreateChar(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Character</h2>
              <button className="modal-close" onClick={() => setShowCreateChar(false)}>X</button>
            </div>
            {charError && <div className="error-msg">{charError}</div>}
            <form className="settings-body" onSubmit={handleCreateChar}>
              <div className="settings-field">
                <label>ID *</label>
                <input className="form-input" value={charForm.id}
                  onChange={(e) => setCharForm((f) => ({ ...f, id: e.target.value }))}
                  placeholder="alice" required />
              </div>
              <div className="settings-field">
                <label>Name *</label>
                <input className="form-input" value={charForm.name}
                  onChange={(e) => setCharForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Alice" required />
              </div>
              <div className="settings-field">
                <label>Description</label>
                <textarea className="form-textarea" rows={2} value={charForm.description}
                  onChange={(e) => setCharForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="A brief description of the character" />
              </div>
              <div className="settings-field">
                <label>Personality</label>
                <textarea className="form-textarea" rows={2} value={charForm.personality}
                  onChange={(e) => setCharForm((f) => ({ ...f, personality: e.target.value }))}
                  placeholder="Personality traits" />
              </div>
              <div className="settings-field">
                <label>Scenario</label>
                <textarea className="form-textarea" rows={2} value={charForm.scenario}
                  onChange={(e) => setCharForm((f) => ({ ...f, scenario: e.target.value }))}
                  placeholder="Conversation scenario" />
              </div>
              <div className="settings-field">
                <label>First Message</label>
                <textarea className="form-textarea" rows={2} value={charForm.first_mes}
                  onChange={(e) => setCharForm((f) => ({ ...f, first_mes: e.target.value }))}
                  placeholder="Opening message" />
              </div>
              <div className="settings-field">
                <label>Example Dialogue</label>
                <textarea className="form-textarea" rows={2} value={charForm.mes_example}
                  onChange={(e) => setCharForm((f) => ({ ...f, mes_example: e.target.value }))}
                  placeholder="User: ...&#10;Character: ..." />
              </div>
              <div className="settings-field">
                <label>System Prompt</label>
                <textarea className="form-textarea" rows={2} value={charForm.system_prompt}
                  onChange={(e) => setCharForm((f) => ({ ...f, system_prompt: e.target.value }))}
                  placeholder="Custom system instructions" />
              </div>
              <button className="btn btn-primary" type="submit" disabled={charCreating}>
                {charCreating ? "Creating..." : "Create Character"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>AI Settings</h2>
              <button className="modal-close" onClick={() => setShowSettings(false)}>X</button>
            </div>
            <div className="settings-body">
              <div className="settings-field">
                <label>
                  Temperature: <strong>{settings.temperature.toFixed(1)}</strong>
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="2.0"
                  step="0.1"
                  value={settings.temperature}
                  onChange={(e) =>
                    setSettings((s) => {
                      const next = { ...s, temperature: parseFloat(e.target.value) };
                      saveSettings(next);
                      return next;
                    })
                  }
                />
                <span className="settings-hint">
                  Lower = more focused. Higher = more creative.
                </span>
              </div>
              <div className="settings-field">
                <label>
                  Max Tokens: <strong>{settings.maxTokens}</strong>
                </label>
                <input
                  type="range"
                  min="256"
                  max="4096"
                  step="128"
                  value={settings.maxTokens}
                  onChange={(e) =>
                    setSettings((s) => {
                      const next = { ...s, maxTokens: parseInt(e.target.value) };
                      saveSettings(next);
                      return next;
                    })
                  }
                />
                <span className="settings-hint">
                  Maximum length of AI response (256-4096).
                </span>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const defaults = { temperature: 0.8, maxTokens: 1024 };
                  setSettings(defaults);
                  saveSettings(defaults);
                }}
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>
      )}

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
