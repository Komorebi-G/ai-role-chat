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

interface ConversationSummary {
  id: string;
  title: string;
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

function loadTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || stored === "light") return stored;
  } catch { /* ignore */ }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("theme", theme); } catch { /* ignore */ }
}

export default function ChatPage() {
  const router = useRouter();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>("");
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
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const messagesEnd = useRef<HTMLDivElement>(null);

  // Apply theme on mount
  useEffect(() => {
    const t = loadTheme();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(t);
    applyTheme(t);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }

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

  // Load conversations when character is selected
  useEffect(() => {
    if (!selectedChar) return;

    fetch(`/api/conversations?characterId=${selectedChar.id}`)
      .then((res) => {
        if (res.status === 401) {
          setUnauthorized(true);
          return [];
        }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setConversations(data);
          if (data.length > 0) {
            setActiveConversationId(data[0].id);
          } else {
            setActiveConversationId("");
          }
        }
      })
      .catch(() => {});
  }, [selectedChar]);

  // Load messages when conversation changes
  useEffect(() => {
    if (!selectedChar || !activeConversationId) {
      // derived from selectedChar state — safe to set synchronously
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages([]);
      return;
    }

    let cancelled = false;
    fetch(`/api/chat?characterId=${selectedChar.id}&conversationId=${activeConversationId}`)
      .then((res) => {
        if (res.status === 401) {
          setUnauthorized(true);
          return { messages: [] };
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const msgs = data.messages || [];
        if (msgs.length === 0 && selectedChar.firstMessage) {
          setMessages([
            {
              id: "first_mes",
              role: "assistant",
              content: selectedChar.firstMessage,
              createdAt: new Date().toISOString(),
            },
          ]);
        } else {
          setMessages(msgs);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedChar, activeConversationId]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleNewChat() {
    if (!selectedChar) return;
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: selectedChar.id, title: "New Chat" }),
      });
      if (res.ok) {
        const conv = await res.json();
        setConversations((prev) => [conv, ...prev]);
        setActiveConversationId(conv.id);
        setMessages([]);
        setError("");
      }
    } catch {
      setError("Failed to create new chat");
    }
  }

  async function handleSelectConversation(convId: string) {
    setActiveConversationId(convId);
    setError("");
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !selectedChar || loading) return;

    const message = input.trim();
    setInput("");
    setError("");

    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: message, createdAt: new Date().toISOString() },
      { id: assistantMsgId, role: "assistant", content: "", createdAt: new Date().toISOString() },
    ]);

    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: selectedChar.id,
          conversationId: activeConversationId,
          message,
          stream: true,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
        }),
      });

      if (res.status === 401) {
        setUnauthorized(true);
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Send failed");
        setMessages((prev) => prev.filter((m) => m.id !== userMsgId && m.id !== assistantMsgId));
        return;
      }

      // Read streaming response
      const reader = res.body?.getReader();
      if (!reader) {
        setError("Streaming not supported");
        setMessages((prev) => prev.filter((m) => m.id !== userMsgId && m.id !== assistantMsgId));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: buffer } : m
          )
        );
      }
    } catch {
      setError("Network error");
      setMessages((prev) => prev.filter((m) => m.id !== userMsgId && m.id !== assistantMsgId));
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
    if (!selectedChar || !activeConversationId) return;
    setClearLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/chat?characterId=${selectedChar.id}&conversationId=${activeConversationId}`,
        { method: "DELETE" }
      );
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
      const isEdit = !!editingCharId;
      const url = isEdit ? `/api/characters?id=${editingCharId}` : "/api/characters";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(charForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setCharError(data.error || (isEdit ? "Update failed" : "Create failed"));
        return;
      }
      const refresh = await fetch("/api/characters");
      if (refresh.ok) {
        const list = await refresh.json();
        if (Array.isArray(list)) setCharacters(list);
      }
      setShowCreateChar(false);
      setEditingCharId(null);
      setCharForm({ id: "", name: "", description: "", personality: "", scenario: "", first_mes: "", mes_example: "", system_prompt: "" });
    } catch {
      setCharError("Network error");
    } finally {
      setCharCreating(false);
    }
  }

  async function startEditChar(char: Character) {
    setEditingCharId(char.id);
    try {
      const res = await fetch(`/api/characters?id=${char.id}`);
      if (res.ok) {
        const full = await res.json();
        setCharForm({
          id: full.id || char.id,
          name: full.name || char.name,
          description: full.description || char.description || "",
          personality: full.personality || "",
          scenario: full.scenario || "",
          first_mes: full.first_mes || full.firstMessage || "",
          mes_example: full.mes_example || "",
          system_prompt: full.system_prompt || "",
        });
      } else {
        setCharForm({
          id: char.id,
          name: char.name,
          description: char.description || "",
          personality: "",
          scenario: "",
          first_mes: char.firstMessage || "",
          mes_example: "",
          system_prompt: "",
        });
      }
    } catch {
      setCharForm({
        id: char.id,
        name: char.name,
        description: char.description || "",
        personality: "",
        scenario: "",
        first_mes: char.firstMessage || "",
        mes_example: "",
        system_prompt: "",
      });
    }
    setShowCreateChar(true);
  }

  async function handleExportChar(char: Character) {
    try {
      const res = await fetch(`/api/characters?id=${char.id}`);
      if (!res.ok) {
        setError("Export failed");
        return;
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${char.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Export failed");
    }
  }

  async function handleImportChar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!json.id || !json.name) {
        setError("Invalid character file: missing id or name");
        return;
      }
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Import failed");
        return;
      }
      const refresh = await fetch("/api/characters");
      if (refresh.ok) {
        const list = await refresh.json();
        if (Array.isArray(list)) setCharacters(list);
      }
      setError("");
    } catch {
      setError("Invalid JSON file");
    }
    e.target.value = "";
  }

  async function handleCopy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* clipboard not available */ }
  }

  async function handleRegenerate() {
    if (!selectedChar || loading) return;

    // Find last user message before the last assistant message
    const msgs = [...messages];
    while (msgs.length > 0 && msgs[msgs.length - 1].role === "assistant") {
      msgs.pop();
    }
    if (msgs.length === 0) return;

    const lastUserMsg = msgs[msgs.length - 1];
    // Remove last assistant message(s) from state
    setMessages(msgs);

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: selectedChar.id,
          conversationId: activeConversationId,
          message: lastUserMsg.content,
          stream: true,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
        }),
      });

      if (res.status === 401) {
        setUnauthorized(true);
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Regenerate failed");
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError("Streaming not supported");
        return;
      }

      const assistantMsgId = (Date.now() + 1).toString();
      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: "assistant", content: "", createdAt: new Date().toISOString() },
      ]);

      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: buffer } : m
          )
        );
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function openAdmin() {
    setShowAdmin(true);
    loadAdminUsers();
  }

  function handleSelectCharacter(c: Character) {
    if (selectedChar?.id === c.id) return;
    setSelectedChar(c);
    setMessages([]);
    setActiveConversationId("");
    setConversations([]);
  }

  if (unauthorized) return null;

  return (
    <div className="chat-layout">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Hamburger menu button (mobile only) */}
      <button className="hamburger-btn" onClick={() => setSidebarOpen(true)} aria-label="Menu">
        &#9776;
      </button>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-header">
          <span>Characters</span>
          <div className="sidebar-actions">
            <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">
              {theme === "light" ? "☽" : "☀"}
            </button>
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
            <div key={c.id}>
              <div
                className={`character-item ${selectedChar?.id === c.id ? "active" : ""}`}
                onClick={() => handleSelectCharacter(c)}
              >
                <div className="char-name">
                  {c.name}
                  {role === "admin" && (
                    <span className="char-admin-actions">
                      <button
                        className="char-edit-btn"
                        onClick={(e) => { e.stopPropagation(); handleExportChar(c); }}
                        title="Export"
                      >
                        &#8615;
                      </button>
                      <button
                        className="char-edit-btn"
                        onClick={(e) => { e.stopPropagation(); startEditChar(c); }}
                        title="Edit"
                      >
                        &#9998;
                      </button>
                    </span>
                  )}
                </div>
                <div className="char-desc">{c.description}</div>
              </div>
              {selectedChar?.id === c.id && (
                <div className="conversation-sublist">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`conv-item ${conv.id === activeConversationId ? "active" : ""}`}
                      onClick={() => handleSelectConversation(conv.id)}
                    >
                      <span className="conv-title">{conv.title}</span>
                      <span className="conv-time">
                        {new Date(conv.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                  <button className="new-chat-btn" onClick={handleNewChat}>
                    + New Chat
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {role === "admin" && (
          <div className="sidebar-admin">
            <button className="admin-btn" onClick={() => setShowCreateChar(true)}>
              + Create Character
            </button>
            <label className="admin-btn import-label">
              Import Character
              <input
                type="file"
                accept=".json"
                className="import-input"
                onChange={handleImportChar}
              />
            </label>
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
              {messages.map((m, i, arr) => (
                <div key={m.id} className={`message ${m.role}`}>
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                  <div className="message-actions">
                    <button
                      className="msg-action-btn"
                      onClick={() => handleCopy(m.content, m.id)}
                      title="Copy"
                    >
                      {copiedId === m.id ? "Copied!" : "Copy"}
                    </button>
                    {m.role === "assistant" && i === arr.length - 1 && !loading && (
                      <button
                        className="msg-action-btn"
                        onClick={handleRegenerate}
                        title="Regenerate"
                      >
                        Regenerate
                      </button>
                    )}
                  </div>
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
        <div className="modal-overlay" onClick={() => { setShowCreateChar(false); setEditingCharId(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingCharId ? "Edit Character" : "Create Character"}</h2>
              <button className="modal-close" onClick={() => { setShowCreateChar(false); setEditingCharId(null); }}>X</button>
            </div>
            {charError && <div className="error-msg">{charError}</div>}
            <form className="settings-body" onSubmit={handleCreateChar}>
              <div className="settings-field">
                <label>ID *</label>
                <input className="form-input" value={charForm.id}
                  onChange={(e) => setCharForm((f) => ({ ...f, id: e.target.value }))}
                  placeholder="alice" required disabled={!!editingCharId} />
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
                {charCreating ? "Saving..." : editingCharId ? "Update Character" : "Create Character"}
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
