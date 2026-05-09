"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";

interface Character {
  id: string;
  name: string;
  description: string;
  firstMessage: string;
  alternate_greetings?: string[];
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  swipes: string;
  swipeId: number;
  createdAt: string;
}

interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  _count?: { messages: number };
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
  persona: string;
}

function loadSettings(): ChatSettings {
  if (typeof window === "undefined") return { temperature: 0.8, maxTokens: 1024, persona: "" };
  try {
    const stored = localStorage.getItem("chat-settings");
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { temperature: 0.8, maxTokens: 1024, persona: "" };
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
  const [loading, setLoading] = useState(false); // input disabled + general loading
  const [thinking, setThinking] = useState(false); // "thinking" bubble visible
  const [error, setError] = useState("");
  const [activeWorldEntryIds, setActiveWorldEntryIds] = useState<string[]>([]);
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
  const [charForm, setCharForm] = useState<Record<string, string>>({
    id: "", name: "", description: "", personality: "", scenario: "",
    first_mes: "", mes_example: "", system_prompt: "",
    post_history_instructions: "", alternate_greetings: "", creator: "", character_version: "",
  });
  const [charCreating, setCharCreating] = useState(false);
  const [charError, setCharError] = useState("");
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [renamingConvId, setRenamingConvId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
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
      setActiveWorldEntryIds([]);
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
        setActiveWorldEntryIds(data.worldEntryIds || []);
        if (msgs.length === 0 && selectedChar.firstMessage) {
          const greetings = [selectedChar.firstMessage, ...(selectedChar.alternate_greetings || [])];
          setMessages([{ id: "first_mes", role: "assistant", content: selectedChar.firstMessage, swipes: JSON.stringify(greetings), swipeId: 0, createdAt: new Date().toISOString() }]);
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

  function startRename(conv: ConversationSummary) {
    setRenamingConvId(conv.id);
    setRenameTitle(conv.title);
  }

  async function saveRename() {
    if (!renamingConvId || !renameTitle.trim()) { setRenamingConvId(null); return; }
    try {
      const res = await fetch("/api/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: renamingConvId, title: renameTitle.trim() }),
      });
      if (res.ok) {
        setConversations((prev) => prev.map((c) => c.id === renamingConvId ? { ...c, title: renameTitle.trim() } : c));
      }
    } catch { /* ignore */ }
    setRenamingConvId(null);
  }

  function cancelRename() {
    setRenamingConvId(null);
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
      { id: userMsgId, role: "user", content: message, swipes: "[]", swipeId: 0, createdAt: new Date().toISOString() },
    ]);

    setLoading(true);
    setThinking(true);
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
          persona: settings.persona || undefined,
        }),
      });

      if (res.status === 401) { setUnauthorized(true); return; }
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Send failed");
        setMessages((prev) => prev.filter((m) => m.id !== userMsgId));
        setLoading(false);
        return;
      }

      // Capture active world entries from response header
      const worldHeader = res.headers.get("X-Active-World-Entries");
      setActiveWorldEntryIds(worldHeader ? worldHeader.split(",").filter(Boolean) : []);

      const reader = res.body?.getReader();
      if (!reader) {
        setError("Streaming not supported");
        setMessages((prev) => prev.filter((m) => m.id !== userMsgId));
        setLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let assistantAdded = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (!assistantAdded) {
          assistantAdded = true;
          setThinking(false);
          setMessages((prev) => [...prev, { id: assistantMsgId, role: "assistant", content: buffer, swipes: "[]", swipeId: 0, createdAt: new Date().toISOString() }]);
        } else {
          setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: buffer } : m));
        }
      }
    } catch {
      setError("Network error");
      setMessages((prev) => prev.filter((m) => m.id !== userMsgId));
    } finally {
      setLoading(false);
      setThinking(false);
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
      const body: Record<string, unknown> = { ...charForm };
      if (charForm.alternate_greetings) {
        body.alternate_greetings = charForm.alternate_greetings.split("\n").map((s: string) => s.trim()).filter(Boolean);
      } else {
        body.alternate_greetings = [];
      }
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setCharError(data.error || (isEdit ? "Update failed" : "Create failed")); return; }
      const refresh = await fetch("/api/characters");
      if (refresh.ok) { const list = await refresh.json(); if (Array.isArray(list)) setCharacters(list); }
      setShowCreateChar(false);
      setEditingCharId(null);
      setCharForm({ id: "", name: "", description: "", personality: "", scenario: "", first_mes: "", mes_example: "", system_prompt: "", post_history_instructions: "", alternate_greetings: "", creator: "", character_version: "" });
    } catch { setCharError("Network error"); }
    finally { setCharCreating(false); }
  }

  async function startEditChar(char: Character) {
    setEditingCharId(char.id);
    try {
      const res = await fetch(`/api/characters?id=${char.id}`);
      if (res.ok) {
        const full = await res.json();
        setCharForm({ id: full.id || char.id, name: full.name || char.name, description: full.description || char.description || "", personality: full.personality || "", scenario: full.scenario || "", first_mes: full.first_mes || full.firstMessage || "", mes_example: full.mes_example || "", system_prompt: full.system_prompt || "", post_history_instructions: full.post_history_instructions || "", alternate_greetings: Array.isArray(full.alternate_greetings) ? full.alternate_greetings.join("\n") : "", creator: full.creator || "", character_version: full.character_version || "" });
      } else {
        setCharForm({ id: char.id, name: char.name, description: char.description || "", personality: "", scenario: "", first_mes: char.firstMessage || "", mes_example: "", system_prompt: "", post_history_instructions: "", alternate_greetings: "", creator: "", character_version: "" });
      }
    } catch {
      setCharForm({ id: char.id, name: char.name, description: char.description || "", personality: "", scenario: "", first_mes: char.firstMessage || "", mes_example: "", system_prompt: "", post_history_instructions: "", alternate_greetings: "", creator: "", character_version: "" });
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

  function handleExportJsonl() {
    const lines = messages.map((m) => JSON.stringify({
      role: m.role,
      content: m.content,
      swipes: m.swipes,
      swipeId: m.swipeId,
      createdAt: m.createdAt,
    }));
    const blob = new Blob([lines.join("\n") + "\n"], { type: "application/x-jsonlines" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${selectedChar?.id || "chat"}-${new Date().toISOString().slice(0, 10)}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
    setShowMoreMenu(false);
  }

  async function handleImportJsonl(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedChar) return;
    setShowMoreMenu(false);
    try {
      // Clear the input so the same file can be re-imported
      if (importFileInputRef.current) importFileInputRef.current.value = "";

      const text = await file.text();
      const lines = text.trim().split("\n").filter(Boolean);
      const messages = lines.map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
      if (messages.length === 0) { setError("No valid messages found in file"); return; }

      const res = await fetch("/api/chat/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: selectedChar.id, conversationId: activeConversationId || undefined, messages }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || "Import failed"); return; }
      const data = await res.json();
      setError("");
      // Reload conversations and messages
      fetch(`/api/conversations?characterId=${selectedChar.id}`)
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setConversations(d); })
        .catch(() => {});
      // Trigger message reload by toggling conversation ID
      if (activeConversationId) {
        const cid = activeConversationId;
        setActiveConversationId("");
        setTimeout(() => setActiveConversationId(cid), 50);
      }
      alert(`Imported ${data.imported} messages`);
    } catch { setError("Failed to parse file"); }
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
    // Find the last assistant message — we'll add a new swipe to it
    const msgs = [...messages];
    let lastAssistantIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "assistant") { lastAssistantIdx = i; break; }
    }
    if (lastAssistantIdx === -1) return;

    setLoading(true);
    setThinking(true);
    setError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: selectedChar.id, conversationId: activeConversationId, regenerate: true, stream: true, temperature: settings.temperature, maxTokens: settings.maxTokens, persona: settings.persona || undefined }),
      });
      if (res.status === 401) { setUnauthorized(true); return; }
      if (!res.ok) { const d = await res.json(); setError(d.error || "Regenerate failed"); setLoading(false); setThinking(false); return; }
      const reader = res.body?.getReader();
      if (!reader) { setError("Streaming not supported"); setLoading(false); setThinking(false); return; }

      const decoder = new TextDecoder();
      let buffer = "";
      let thinkingOff = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (!thinkingOff) {
          thinkingOff = true;
          setThinking(false);
          // Add new swipe — append to swipes array, set swipeId to it
          setMessages((prev) => prev.map((m, i) => {
            if (i !== lastAssistantIdx) return m;
            const swipes = JSON.parse(m.swipes || "[]");
            swipes.push(buffer);
            return { ...m, swipes: JSON.stringify(swipes), swipeId: swipes.length - 1, content: buffer };
          }));
        } else {
          setMessages((prev) => prev.map((m, i) => {
            if (i !== lastAssistantIdx) return m;
            const swipes = JSON.parse(m.swipes || "[]");
            swipes[swipes.length - 1] = buffer;
            return { ...m, swipes: JSON.stringify(swipes), content: buffer };
          }));
        }
      }
    } catch { setError("Network error"); }
    finally { setLoading(false); setThinking(false); }
  }

  function handleSwipe(messageId: string, direction: "left" | "right") {
    setMessages((prev) => prev.map((m) => {
      if (m.id !== messageId || m.role !== "assistant") return m;
      const swipes = JSON.parse(m.swipes || "[]");
      if (swipes.length <= 1) return m;
      let newIdx = m.swipeId + (direction === "right" ? 1 : -1);
      if (newIdx < 0) newIdx = swipes.length - 1;
      if (newIdx >= swipes.length) newIdx = 0;
      // Persist swipe change
      fetch("/api/chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, conversationId: activeConversationId, swipeId: newIdx }),
      }).catch(() => {});
      return { ...m, swipeId: newIdx, content: swipes[newIdx] };
    }));
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
                <div className="settings-field">
                  <label>Persona (how the AI sees you)</label>
                  <textarea className="wechat-textarea" rows={3} value={settings.persona}
                    placeholder="e.g. I'm a 25-year-old adventurer from the northern kingdom..."
                    onChange={(e) => { const next = { ...settings, persona: e.target.value }; setSettings(next); saveSettings(next); }} />
                </div>
                <button className="wechat-btn" onClick={() => { const d = { temperature: 0.8, maxTokens: 1024, persona: "" }; setSettings(d); saveSettings(d); }}>Reset to Defaults</button>
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
                <div className="settings-field">
                  <label>Post-History Instructions</label>
                  <textarea className="wechat-textarea" rows={2} value={charForm.post_history_instructions}
                    onChange={(e) => setCharForm((f) => ({ ...f, post_history_instructions: e.target.value }))}
                    placeholder="Instructions injected after chat history" />
                </div>
                <div className="settings-field">
                  <label>Alternate Greetings (one per line)</label>
                  <textarea className="wechat-textarea" rows={2} value={charForm.alternate_greetings}
                    onChange={(e) => setCharForm((f) => ({ ...f, alternate_greetings: e.target.value }))}
                    placeholder="Alt greeting 1&#10;Alt greeting 2" />
                </div>
                <div className="settings-field">
                  <label>Creator</label>
                  <input className="wechat-input" value={charForm.creator}
                    onChange={(e) => setCharForm((f) => ({ ...f, creator: e.target.value }))}
                    placeholder="Character creator name" />
                </div>
                <div className="settings-field">
                  <label>Version</label>
                  <input className="wechat-input" value={charForm.character_version}
                    onChange={(e) => setCharForm((f) => ({ ...f, character_version: e.target.value }))}
                    placeholder="1.0" />
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
        <button className="nav-icon-btn" onClick={() => { setShowSearch(!showSearch); setSearchQuery(""); }} aria-label="Search">
          {showSearch ? "✕" : "🔍"}
        </button>
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
              <button onClick={handleExportJsonl} disabled={messages.length === 0}>Export as JSONL</button>
              <button onClick={() => importFileInputRef.current?.click()}>Import JSONL</button>
              <input type="file" accept=".jsonl" ref={importFileInputRef} style={{ display: "none" }} onChange={handleImportJsonl} />
              <button onClick={handleLogout}>Logout</button>
            </div>
          </>
        )}
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="search-bar">
          <input
            className="wechat-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            autoFocus
          />
          {searchQuery && (
            <span className="search-count">
              {messages.filter((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase())).length} matches
            </span>
          )}
        </div>
      )}

      {/* Message area */}
      <div className="wechat-messages">
        {error && <div className="wechat-error-banner">{error}</div>}
        {messages
          .filter((m) => !searchQuery || m.content.toLowerCase().includes(searchQuery.toLowerCase()))
          .map((m, i, arr) => (
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
                {m.role === "assistant" && i === arr.length - 1 && !loading && !thinking && (
                  <button className="wx-action-btn" onClick={handleRegenerate}>Regenerate</button>
                )}
                {m.role === "assistant" && (() => {
                  const swipes = JSON.parse(m.swipes || "[]");
                  if (swipes.length <= 1) return null;
                  return (
                    <span style={{ marginLeft: 4, fontSize: 11, color: "var(--text-muted)" }}>
                      <button className="wx-action-btn" onClick={() => handleSwipe(m.id, "left")}>◂</button>
                      {m.swipeId + 1}/{swipes.length}
                      <button className="wx-action-btn" onClick={() => handleSwipe(m.id, "right")}>▸</button>
                    </span>
                  );
                })()}
              </div>
            </div>
            {m.role === "user" && (
              <div className="wx-avatar wx-avatar-self" style={{ background: "var(--wechat-green, #07c160)" }}>
                Me
              </div>
            )}
          </div>
        ))}
        {thinking && (
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

      {/* World entries indicator */}
      {activeWorldEntryIds.length > 0 && (
        <div className="world-entries-bar" title={`Active world entries: ${activeWorldEntryIds.join(", ")}`}>
          {activeWorldEntryIds.map((id) => (
            <span key={id} className="world-entry-badge">{id}</span>
          ))}
        </div>
      )}

      {/* Token budget bar */}
      {(() => {
        const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
        const maxChars = 8000;
        const ratio = Math.min(totalChars / maxChars, 1);
        const pct = Math.round(ratio * 100);
        const color = ratio > 0.85 ? "var(--danger)" : ratio > 0.6 ? "var(--warning)" : "var(--primary)";
        return (
          <div className="token-bar-wrap" title={`~${Math.ceil(totalChars / 4)} tokens used / ~${Math.ceil(maxChars / 4)}`}>
            <div className="token-bar-fill" style={{ width: `${pct}%`, background: color }} />
          </div>
        );
      })()}

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
                          onClick={() => renamingConvId !== conv.id && handleSelectConversation(conv.id)}
                        >
                          {renamingConvId === conv.id ? (
                            <input
                              className="drawer-rename-input"
                              value={renameTitle}
                              onChange={(e) => setRenameTitle(e.target.value)}
                              onBlur={saveRename}
                              onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") cancelRename(); }}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span onDoubleClick={() => startRename(conv)} title="Double-click to rename">{conv.title}</span>
                          )}
                          <span className="drawer-conv-time">{new Date(conv.createdAt).toLocaleDateString()}{(conv._count?.messages ?? 0) > 0 && ` · ${conv._count?.messages}`}</span>
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
              <div className="settings-field">
                <label>Persona (how the AI sees you)</label>
                <textarea className="wechat-textarea" rows={3} value={settings.persona}
                  placeholder="e.g. I'm a 25-year-old adventurer..."
                  onChange={(e) => { const next = { ...settings, persona: e.target.value }; setSettings(next); saveSettings(next); }} />
              </div>
              <button className="wechat-btn wechat-btn-primary" onClick={() => { const d = { temperature: 0.8, maxTokens: 1024, persona: "" }; setSettings(d); saveSettings(d); }}>Reset to Defaults</button>
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
              <div className="settings-field">
                <label>Post-History Instructions</label>
                <textarea className="wechat-textarea" rows={2} value={charForm.post_history_instructions}
                  onChange={(e) => setCharForm((f) => ({ ...f, post_history_instructions: e.target.value }))}
                  placeholder="Instructions injected after chat history" />
              </div>
              <div className="settings-field">
                <label>Alternate Greetings (one per line)</label>
                <textarea className="wechat-textarea" rows={2} value={charForm.alternate_greetings}
                  onChange={(e) => setCharForm((f) => ({ ...f, alternate_greetings: e.target.value }))}
                  placeholder="Alt greeting 1&#10;Alt greeting 2" />
              </div>
              <div className="settings-field">
                <label>Creator</label>
                <input className="wechat-input" value={charForm.creator}
                  onChange={(e) => setCharForm((f) => ({ ...f, creator: e.target.value }))}
                  placeholder="Character creator name" />
              </div>
              <div className="settings-field">
                <label>Version</label>
                <input className="wechat-input" value={charForm.character_version}
                  onChange={(e) => setCharForm((f) => ({ ...f, character_version: e.target.value }))}
                  placeholder="1.0" />
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
