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

function avatarLetter(name: string): string {
  return name.charAt(0).toUpperCase();
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);

  // Apply theme on mount
  useEffect(() => {
    const t = loadTheme();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(t);
    applyTheme(t);
  }, []);

  useEffect(() => { applyTheme(theme); }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "light" ? "dark" : "light"));
    setShowMoreMenu(false);
  }

  useEffect(() => {
    fetch("/api/characters")
      .then((res) => {
        if (res.status === 401) { setUnauthorized(true); return []; }
        return res.json();
      })
      .then((data) => { if (Array.isArray(data)) setCharacters(data); })
      .catch(() => setUnauthorized(true));
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => { if (data.role) setRole(data.role); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (unauthorized) router.replace("/login");
  }, [unauthorized, router]);

  // Load conversations when character is selected
  useEffect(() => {
    if (!selectedChar) return;
    fetch(`/api/conversations?characterId=${selectedChar.id}`)
      .then((res) => {
        if (res.status === 401) { setUnauthorized(true); return []; }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setConversations(data);
          if (data.length > 0) setActiveConversationId(data[0].id);
          else setActiveConversationId("");
        }
      })
      .catch(() => {});
  }, [selectedChar]);

  // Load messages when conversation changes
  useEffect(() => {
    if (!selectedChar || !activeConversationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/chat?characterId=${selectedChar.id}&conversationId=${activeConversationId}`)
      .then((res) => {
        if (res.status === 401) { setUnauthorized(true); return { messages: [] }; }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const msgs = data.messages || [];
        if (msgs.length === 0 && selectedChar.firstMessage) {
          setMessages([{ id: "first_mes", role: "assistant", content: selectedChar.firstMessage, createdAt: new Date().toISOString() }]);
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
        setDrawerOpen(false);
      }
    } catch { setError("Failed to create new chat"); }
  }

  async function handleSelectConversation(convId: string) {
    setActiveConversationId(convId);
    setError("");
    setDrawerOpen(false);
  }

  function handleSelectCharacter(c: Character) {
    if (selectedChar?.id === c.id) { setDrawerOpen(false); return; }
    setSelectedChar(c);
    setMessages([]);
    setActiveConversationId("");
    setConversations([]);
    setDrawerOpen(false);
  }

  function handleBack() {
    setSelectedChar(null);
    setMessages([]);
    setActiveConversationId("");
    setConversations([]);
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

      if (res.status === 401) { setUnauthorized(true); return; }
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Send failed");
        setMessages((prev) => prev.filter((m) => m.id !== userMsgId && m.id !== assistantMsgId));
        return;
      }

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
        setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: buffer } : m));
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
      setAdminUsers(await res.json());
    } catch { setAdminError("Failed to load users"); }
    finally { setAdminLoading(false); }
  }

  async function handleDeleteUser(userId: string) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); setAdminError(d.error || "Delete failed"); return; }
      setAdminUsers((prev) => prev.filter((u) => u.id !== userId));
      setDeleteConfirm(null);
    } catch { setAdminError("Network error"); }
  }

  async function handleClearChat() {
    if (!selectedChar || !activeConversationId) return;
    setClearLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/chat?characterId=${selectedChar.id}&conversationId=${activeConversationId}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); setError(d.error || "Clear failed"); return; }
      setMessages([]);
      setShowMoreMenu(false);
    } catch { setError("Network error"); }
    finally { setClearLoading(false); }
  }

  async function handleCreateChar(e: React.FormEvent) {
    e.preventDefault();
    if (!charForm.id || !charForm.name) { setCharError("ID and Name are required"); return; }
    setCharCreating(true);
    setCharError("");
    try {
      const isEdit = !!editingCharId;
      const url = isEdit ? `/api/characters?id=${editingCharId}` : "/api/characters";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(charForm) });
      const data = await res.json();
      if (!res.ok) { setCharError(data.error || (isEdit ? "Update failed" : "Create failed")); return; }
      const refresh = await fetch("/api/characters");
      if (refresh.ok) { const list = await refresh.json(); if (Array.isArray(list)) setCharacters(list); }
      setShowCreateChar(false);
      setEditingCharId(null);
      setCharForm({ id: "", name: "", description: "", personality: "", scenario: "", first_mes: "", mes_example: "", system_prompt: "" });
    } catch { setCharError("Network error"); }
    finally { setCharCreating(false); }
  }

  async function startEditChar(char: Character) {
    setEditingCharId(char.id);
    try {
      const res = await fetch(`/api/characters?id=${char.id}`);
      if (res.ok) {
        const full = await res.json();
        setCharForm({ id: full.id || char.id, name: full.name || char.name, description: full.description || char.description || "", personality: full.personality || "", scenario: full.scenario || "", first_mes: full.first_mes || full.firstMessage || "", mes_example: full.mes_example || "", system_prompt: full.system_prompt || "" });
      } else {
        setCharForm({ id: char.id, name: char.name, description: char.description || "", personality: "", scenario: "", first_mes: char.firstMessage || "", mes_example: "", system_prompt: "" });
      }
    } catch {
      setCharForm({ id: char.id, name: char.name, description: char.description || "", personality: "", scenario: "", first_mes: char.firstMessage || "", mes_example: "", system_prompt: "" });
    }
    setShowCreateChar(true);
    setShowMoreMenu(false);
  }

  async function handleExportChar(char: Character) {
    try {
      const res = await fetch(`/api/characters?id=${char.id}`);
      if (!res.ok) { setError("Export failed"); return; }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${char.id}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch { setError("Export failed"); }
  }

  async function handleImportChar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!json.id || !json.name) { setError("Invalid character file: missing id or name"); return; }
      const res = await fetch("/api/characters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Import failed"); return; }
      const refresh = await fetch("/api/characters");
      if (refresh.ok) { const list = await refresh.json(); if (Array.isArray(list)) setCharacters(list); }
      setError("");
    } catch { setError("Invalid JSON file"); }
    e.target.value = "";
  }

  async function handleCopy(text: string, id: string) {
    try { await navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); }
    catch { /* clipboard not available */ }
  }

  async function handleRegenerate() {
    if (!selectedChar || loading) return;
    const msgs = [...messages];
    while (msgs.length > 0 && msgs[msgs.length - 1].role === "assistant") msgs.pop();
    if (msgs.length === 0) return;
    const lastUserMsg = msgs[msgs.length - 1];
    setMessages(msgs);

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: selectedChar.id, conversationId: activeConversationId, message: lastUserMsg.content, stream: true, temperature: settings.temperature, maxTokens: settings.maxTokens }),
      });
      if (res.status === 401) { setUnauthorized(true); return; }
      if (!res.ok) { const d = await res.json(); setError(d.error || "Regenerate failed"); return; }
      const reader = res.body?.getReader();
      if (!reader) { setError("Streaming not supported"); return; }

      const assistantMsgId = (Date.now() + 1).toString();
      setMessages((prev) => [...prev, { id: assistantMsgId, role: "assistant", content: "", createdAt: new Date().toISOString() }]);
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: buffer } : m));
      }
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }

  function openAdmin() {
    setShowAdmin(true);
    loadAdminUsers();
    setShowMoreMenu(false);
  }

  if (unauthorized) return null;

  // ===== Character List View (WeChat "Chats" page) =====
  if (!selectedChar) {
    return (
      <div className="wechat-shell">
        <div className="wechat-nav">
          <span className="wechat-nav-title">AI Role Chat</span>
          <div className="wechat-nav-right">
            <button className="nav-icon-btn" onClick={() => { setShowSettings(true); }} title="Settings">
              &#9881;
            </button>
          </div>
        </div>
        <div className="wechat-chat-list">
          {characters.map((c) => (
            <div key={c.id} className="chat-list-item" onClick={() => handleSelectCharacter(c)}>
              <div className="chat-list-avatar" style={{ background: "var(--primary)" }}>
                {avatarLetter(c.name)}
              </div>
              <div className="chat-list-info">
                <div className="chat-list-name">{c.name}</div>
                <div className="chat-list-preview">{c.description || c.firstMessage || "Tap to chat"}</div>
              </div>
              {role === "admin" && (
                <div className="chat-list-actions">
                  <button className="mini-btn" onClick={(e) => { e.stopPropagation(); handleExportChar(c); }} title="Export">↕</button>
                  <button className="mini-btn" onClick={(e) => { e.stopPropagation(); startEditChar(c); }} title="Edit">✎</button>
                </div>
              )}
            </div>
          ))}
          {characters.length === 0 && (
            <div className="wechat-empty">No characters available</div>
          )}
        </div>
        {/* Bottom bar for admin actions */}
        {role === "admin" && (
          <div className="wechat-list-footer">
            <button className="wechat-footer-btn" onClick={() => setShowCreateChar(true)}>+ Create Character</button>
            <label className="wechat-footer-btn import-label">
              Import
              <input type="file" accept=".json" className="import-input" onChange={handleImportChar} />
            </label>
            <button className="wechat-footer-btn" onClick={openAdmin}>Users</button>
            <button className="wechat-footer-btn" onClick={handleLogout}>Logout</button>
          </div>
        )}
        {role !== "admin" && (
          <div className="wechat-list-footer">
            <button className="wechat-footer-btn" onClick={handleLogout}>Logout</button>
          </div>
        )}

        {/* Modals */}
        {showSettings && (
          <div className="wechat-overlay" onClick={() => setShowSettings(false)}>
            <div className="wechat-modal" onClick={(e) => e.stopPropagation()}>
              <div className="wechat-modal-header">
                <span>AI Settings</span>
                <button className="wechat-modal-close" onClick={() => setShowSettings(false)}>×</button>
              </div>
              <div className="wechat-modal-body">
                <div className="settings-field">
                  <label>Temperature: <strong>{settings.temperature.toFixed(1)}</strong></label>
                  <input type="range" min="0.1" max="2.0" step="0.1" value={settings.temperature}
                    onChange={(e) => { const next = { ...settings, temperature: parseFloat(e.target.value) }; setSettings(next); saveSettings(next); }} />
                </div>
                <div className="settings-field">
                  <label>Max Tokens: <strong>{settings.maxTokens}</strong></label>
                  <input type="range" min="256" max="4096" step="128" value={settings.maxTokens}
                    onChange={(e) => { const next = { ...settings, maxTokens: parseInt(e.target.value) }; setSettings(next); saveSettings(next); }} />
                </div>
                <button className="wechat-btn" onClick={() => { const d = { temperature: 0.8, maxTokens: 1024 }; setSettings(d); saveSettings(d); }}>Reset to Defaults</button>
              </div>
            </div>
          </div>
        )}

        {showCreateChar && (
          <div className="wechat-overlay" onClick={() => { setShowCreateChar(false); setEditingCharId(null); }}>
            <div className="wechat-modal" onClick={(e) => e.stopPropagation()}>
              <div className="wechat-modal-header">
                <span>{editingCharId ? "Edit Character" : "Create Character"}</span>
                <button className="wechat-modal-close" onClick={() => { setShowCreateChar(false); setEditingCharId(null); }}>×</button>
              </div>
              {charError && <div className="wechat-error">{charError}</div>}
              <form className="wechat-modal-body" onSubmit={handleCreateChar}>
                <div className="settings-field">
                  <label>ID *</label>
                  <input className="wechat-input" value={charForm.id}
                    onChange={(e) => setCharForm((f) => ({ ...f, id: e.target.value }))}
                    placeholder="alice" required disabled={!!editingCharId} />
                </div>
                <div className="settings-field">
                  <label>Name *</label>
                  <input className="wechat-input" value={charForm.name}
                    onChange={(e) => setCharForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Alice" required />
                </div>
                <div className="settings-field">
                  <label>Description</label>
                  <textarea className="wechat-textarea" rows={2} value={charForm.description}
                    onChange={(e) => setCharForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="A brief description" />
                </div>
                <div className="settings-field">
                  <label>Personality</label>
                  <textarea className="wechat-textarea" rows={2} value={charForm.personality}
                    onChange={(e) => setCharForm((f) => ({ ...f, personality: e.target.value }))}
                    placeholder="Personality traits" />
                </div>
                <div className="settings-field">
                  <label>Scenario</label>
                  <textarea className="wechat-textarea" rows={2} value={charForm.scenario}
                    onChange={(e) => setCharForm((f) => ({ ...f, scenario: e.target.value }))}
                    placeholder="Conversation scenario" />
                </div>
                <div className="settings-field">
                  <label>First Message</label>
                  <textarea className="wechat-textarea" rows={2} value={charForm.first_mes}
                    onChange={(e) => setCharForm((f) => ({ ...f, first_mes: e.target.value }))}
                    placeholder="Opening message" />
                </div>
                <div className="settings-field">
                  <label>Example Dialogue</label>
                  <textarea className="wechat-textarea" rows={2} value={charForm.mes_example}
                    onChange={(e) => setCharForm((f) => ({ ...f, mes_example: e.target.value }))}
                    placeholder="User: ...&#10;Character: ..." />
                </div>
                <div className="settings-field">
                  <label>System Prompt</label>
                  <textarea className="wechat-textarea" rows={2} value={charForm.system_prompt}
                    onChange={(e) => setCharForm((f) => ({ ...f, system_prompt: e.target.value }))}
                    placeholder="Custom system instructions" />
                </div>
                <button className="wechat-btn wechat-btn-primary" type="submit" disabled={charCreating}>
                  {charCreating ? "Saving..." : editingCharId ? "Update Character" : "Create Character"}
                </button>
              </form>
            </div>
          </div>
        )}

        {showAdmin && (
          <div className="wechat-overlay" onClick={() => { setShowAdmin(false); setDeleteConfirm(null); }}>
            <div className="wechat-modal" onClick={(e) => e.stopPropagation()}>
              <div className="wechat-modal-header">
                <span>User Management</span>
                <button className="wechat-modal-close" onClick={() => { setShowAdmin(false); setDeleteConfirm(null); }}>×</button>
              </div>
              {adminError && <div className="wechat-error">{adminError}</div>}
              {adminLoading ? <p className="wechat-loading">Loading...</p> : (
                <div className="wechat-user-list">
                  {adminUsers.map((u) => (
                    <div key={u.id} className="wechat-user-row">
                      <div>
                        <div className="user-name">{u.username}</div>
                        <div className="user-meta">{u.role} · {new Date(u.createdAt).toLocaleDateString()}</div>
                      </div>
                      <div>
                        {deleteConfirm === u.id ? (
                          <span className="confirm-group">
                            <button className="mini-btn danger" onClick={() => handleDeleteUser(u.id)}>Confirm</button>
                            <button className="mini-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                          </span>
                        ) : (
                          <button className="mini-btn danger-outline" onClick={() => setDeleteConfirm(u.id)} disabled={u.id === "demo"}>Delete</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== Chat View (WeChat chat page) =====
  return (
    <div className="wechat-shell">
      {/* Top nav bar */}
      <div className="wechat-nav">
        <button className="nav-icon-btn" onClick={handleBack} aria-label="Back">
          ←
        </button>
        <span className="wechat-nav-title">{selectedChar.name}</span>
        <button className="nav-icon-btn" onClick={() => setShowMoreMenu(!showMoreMenu)} aria-label="More">
          ⋯
        </button>
        {showMoreMenu && (
          <>
            <div className="more-menu-overlay" onClick={() => setShowMoreMenu(false)} />
            <div className="more-menu">
              <button onClick={() => { setDrawerOpen(true); setShowMoreMenu(false); }}>Conversations</button>
              <button onClick={() => { handleNewChat(); }}>New Chat</button>
              <button onClick={() => { setShowSettings(true); setShowMoreMenu(false); }}>AI Settings</button>
              <button onClick={toggleTheme}>{theme === "light" ? "Dark Mode" : "Light Mode"}</button>
              {role === "admin" && <button onClick={() => { startEditChar(selectedChar); }}>Edit Character</button>}
              <button onClick={handleClearChat} disabled={clearLoading || messages.length === 0}>
                {clearLoading ? "Clearing..." : "Clear Chat"}
              </button>
              <button onClick={handleLogout}>Logout</button>
            </div>
          </>
        )}
      </div>

      {/* Message area */}
      <div className="wechat-messages">
        {error && <div className="wechat-error-banner">{error}</div>}
        {messages.map((m, i, arr) => (
          <div key={m.id} className={`wx-msg ${m.role === "user" ? "wx-msg-self" : ""}`}>
            {m.role === "assistant" && (
              <div className="wx-avatar" style={{ background: "var(--primary)" }}>
                {avatarLetter(selectedChar.name)}
              </div>
            )}
            <div className="wx-bubble-wrapper">
              <div className={`wx-bubble ${m.role === "user" ? "wx-bubble-self" : ""}`}>
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
              <div className="wx-msg-actions">
                <button className="wx-action-btn" onClick={() => handleCopy(m.content, m.id)}>
                  {copiedId === m.id ? "Copied!" : "Copy"}
                </button>
                {m.role === "assistant" && i === arr.length - 1 && !loading && (
                  <button className="wx-action-btn" onClick={handleRegenerate}>Regenerate</button>
                )}
              </div>
            </div>
            {m.role === "user" && (
              <div className="wx-avatar wx-avatar-self" style={{ background: "var(--wechat-green, #07c160)" }}>
                Me
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="wx-msg">
            <div className="wx-avatar" style={{ background: "var(--primary)" }}>
              {avatarLetter(selectedChar.name)}
            </div>
            <div className="wx-bubble wx-typing">
              <span className="loading-dots">Thinking</span>
            </div>
          </div>
        )}
        <div ref={messagesEnd} />
      </div>

      {/* Bottom input bar */}
      <form className="wechat-input-bar" onSubmit={handleSend}>
        <button type="button" className="input-tool-btn" title="Voice" aria-label="Voice">
          🎤
        </button>
        <input
          className="wechat-text-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={loading}
        />
        <button type="button" className="input-tool-btn" title="Emoji" aria-label="Emoji">
          😊
        </button>
        {input.trim() ? (
          <button type="submit" className="input-send-btn" disabled={loading}>
            Send
          </button>
        ) : (
          <button type="button" className="input-tool-btn" title="More" aria-label="More">
            ⊕
          </button>
        )}
      </form>

      {/* Drawer (character + conversation list) */}
      {drawerOpen && (
        <>
          <div className="wechat-drawer-overlay" onClick={() => setDrawerOpen(false)} />
          <div className="wechat-drawer">
            <div className="wechat-drawer-header">
              <span>Characters</span>
              <div className="sidebar-actions">
                <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">
                  {theme === "light" ? "☽" : "☀"}
                </button>
                <button className="icon-btn" onClick={() => { setShowSettings(true); }} title="Settings">&#9881;</button>
              </div>
            </div>
            <div className="wechat-drawer-body">
              {characters.map((c) => (
                <div key={c.id}>
                  <div
                    className={`drawer-char-item ${selectedChar?.id === c.id ? "active" : ""}`}
                    onClick={() => handleSelectCharacter(c)}
                  >
                    <div className="drawer-char-avatar" style={{ background: "var(--primary)" }}>
                      {avatarLetter(c.name)}
                    </div>
                    <div className="drawer-char-info">
                      <div className="drawer-char-name">{c.name}</div>
                      <div className="drawer-char-desc">{c.description}</div>
                    </div>
                    {role === "admin" && (
                      <span className="char-admin-actions">
                        <button className="mini-btn" onClick={(e) => { e.stopPropagation(); handleExportChar(c); }}>↕</button>
                        <button className="mini-btn" onClick={(e) => { e.stopPropagation(); startEditChar(c); }}>✎</button>
                      </span>
                    )}
                  </div>
                  {selectedChar?.id === c.id && (
                    <div className="drawer-conv-list">
                      {conversations.map((conv) => (
                        <div
                          key={conv.id}
                          className={`drawer-conv-item ${conv.id === activeConversationId ? "active" : ""}`}
                          onClick={() => handleSelectConversation(conv.id)}
                        >
                          <span>{conv.title}</span>
                          <span className="drawer-conv-time">{new Date(conv.createdAt).toLocaleDateString()}</span>
                        </div>
                      ))}
                      <button className="drawer-new-chat-btn" onClick={handleNewChat}>+ New Chat</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {role === "admin" && (
              <div className="wechat-drawer-footer">
                <button className="wechat-footer-btn" onClick={() => setShowCreateChar(true)}>+ Create Character</button>
                <label className="wechat-footer-btn import-label">
                  Import
                  <input type="file" accept=".json" className="import-input" onChange={handleImportChar} />
                </label>
                <button className="wechat-footer-btn" onClick={openAdmin}>Users</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modals (reused from character list view) */}
      {showSettings && (
        <div className="wechat-overlay" onClick={() => setShowSettings(false)}>
          <div className="wechat-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wechat-modal-header">
              <span>AI Settings</span>
              <button className="wechat-modal-close" onClick={() => setShowSettings(false)}>×</button>
            </div>
            <div className="wechat-modal-body">
              <div className="settings-field">
                <label>Temperature: <strong>{settings.temperature.toFixed(1)}</strong></label>
                <input type="range" min="0.1" max="2.0" step="0.1" value={settings.temperature}
                  onChange={(e) => { const next = { ...settings, temperature: parseFloat(e.target.value) }; setSettings(next); saveSettings(next); }} />
              </div>
              <div className="settings-field">
                <label>Max Tokens: <strong>{settings.maxTokens}</strong></label>
                <input type="range" min="256" max="4096" step="128" value={settings.maxTokens}
                  onChange={(e) => { const next = { ...settings, maxTokens: parseInt(e.target.value) }; setSettings(next); saveSettings(next); }} />
              </div>
              <button className="wechat-btn wechat-btn-primary" onClick={() => { const d = { temperature: 0.8, maxTokens: 1024 }; setSettings(d); saveSettings(d); }}>Reset to Defaults</button>
            </div>
          </div>
        </div>
      )}

      {showCreateChar && (
        <div className="wechat-overlay" onClick={() => { setShowCreateChar(false); setEditingCharId(null); }}>
          <div className="wechat-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wechat-modal-header">
              <span>{editingCharId ? "Edit Character" : "Create Character"}</span>
              <button className="wechat-modal-close" onClick={() => { setShowCreateChar(false); setEditingCharId(null); }}>×</button>
            </div>
            {charError && <div className="wechat-error">{charError}</div>}
            <form className="wechat-modal-body" onSubmit={handleCreateChar}>
              <div className="settings-field">
                <label>ID *</label>
                <input className="wechat-input" value={charForm.id}
                  onChange={(e) => setCharForm((f) => ({ ...f, id: e.target.value }))}
                  placeholder="alice" required disabled={!!editingCharId} />
              </div>
              <div className="settings-field">
                <label>Name *</label>
                <input className="wechat-input" value={charForm.name}
                  onChange={(e) => setCharForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Alice" required />
              </div>
              <div className="settings-field">
                <label>Description</label>
                <textarea className="wechat-textarea" rows={2} value={charForm.description}
                  onChange={(e) => setCharForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="A brief description" />
              </div>
              <div className="settings-field">
                <label>Personality</label>
                <textarea className="wechat-textarea" rows={2} value={charForm.personality}
                  onChange={(e) => setCharForm((f) => ({ ...f, personality: e.target.value }))}
                  placeholder="Personality traits" />
              </div>
              <div className="settings-field">
                <label>Scenario</label>
                <textarea className="wechat-textarea" rows={2} value={charForm.scenario}
                  onChange={(e) => setCharForm((f) => ({ ...f, scenario: e.target.value }))}
                  placeholder="Conversation scenario" />
              </div>
              <div className="settings-field">
                <label>First Message</label>
                <textarea className="wechat-textarea" rows={2} value={charForm.first_mes}
                  onChange={(e) => setCharForm((f) => ({ ...f, first_mes: e.target.value }))}
                  placeholder="Opening message" />
              </div>
              <div className="settings-field">
                <label>Example Dialogue</label>
                <textarea className="wechat-textarea" rows={2} value={charForm.mes_example}
                  onChange={(e) => setCharForm((f) => ({ ...f, mes_example: e.target.value }))}
                  placeholder="User: ...&#10;Character: ..." />
              </div>
              <div className="settings-field">
                <label>System Prompt</label>
                <textarea className="wechat-textarea" rows={2} value={charForm.system_prompt}
                  onChange={(e) => setCharForm((f) => ({ ...f, system_prompt: e.target.value }))}
                  placeholder="Custom system instructions" />
              </div>
              <button className="wechat-btn wechat-btn-primary" type="submit" disabled={charCreating}>
                {charCreating ? "Saving..." : editingCharId ? "Update Character" : "Create Character"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showAdmin && (
        <div className="wechat-overlay" onClick={() => { setShowAdmin(false); setDeleteConfirm(null); }}>
          <div className="wechat-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wechat-modal-header">
              <span>User Management</span>
              <button className="wechat-modal-close" onClick={() => { setShowAdmin(false); setDeleteConfirm(null); }}>×</button>
            </div>
            {adminError && <div className="wechat-error">{adminError}</div>}
            {adminLoading ? <p className="wechat-loading">Loading...</p> : (
              <div className="wechat-user-list">
                {adminUsers.map((u) => (
                  <div key={u.id} className="wechat-user-row">
                    <div>
                      <div className="user-name">{u.username}</div>
                      <div className="user-meta">{u.role} · {new Date(u.createdAt).toLocaleDateString()}</div>
                    </div>
                    <div>
                      {deleteConfirm === u.id ? (
                        <span className="confirm-group">
                          <button className="mini-btn danger" onClick={() => handleDeleteUser(u.id)}>Confirm</button>
                          <button className="mini-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                        </span>
                      ) : (
                        <button className="mini-btn danger-outline" onClick={() => setDeleteConfirm(u.id)} disabled={u.id === "demo"}>Delete</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
