"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { useTranslation, type Locale } from "@/lib/i18n";

interface Character {
  id: string;
  name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  firstMessage?: string;
  mes_example?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  creator?: string;
  character_version?: string;
  creator_notes?: string;
  tags?: string[];
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
  const { t, locale, setLocale } = useTranslation();
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
    creator_notes: "", tags: "",
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
  const [showCharInfo, setShowCharInfo] = useState(false);
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
        body: JSON.stringify({ characterId: selectedChar.id, title: t("conversation.newChat") }),
      });
      if (res.ok) {
        const conv = await res.json();
        setConversations((prev) => [conv, ...prev]);
        setActiveConversationId(conv.id);
        setMessages([]);
        setError("");
        setDrawerOpen(false);
      }
    } catch { setError(t("chat.createChatFailed")); }
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
        setError(data.error || t("chat.sendFailed"));
        setMessages((prev) => prev.filter((m) => m.id !== userMsgId));
        setLoading(false);
        return;
      }

      // Capture active world entries from response header
      const worldHeader = res.headers.get("X-Active-World-Entries");
      setActiveWorldEntryIds(worldHeader ? worldHeader.split(",").filter(Boolean) : []);

      const reader = res.body?.getReader();
      if (!reader) {
        setError(t("chat.streamNotSupported"));
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
      setError(t("common.networkError"));
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
      if (!res.ok) throw new Error(t("admin.loadFailed"));
      setAdminUsers(await res.json());
    } catch { setAdminError(t("admin.loadFailed")); }
    finally { setAdminLoading(false); }
  }

  async function handleDeleteUser(userId: string) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); setAdminError(d.error || t("admin.deleteFailed")); return; }
      setAdminUsers((prev) => prev.filter((u) => u.id !== userId));
      setDeleteConfirm(null);
    } catch { setAdminError(t("common.networkError")); }
  }

  async function handleClearChat() {
    if (!selectedChar || !activeConversationId) return;
    setClearLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/chat?characterId=${selectedChar.id}&conversationId=${activeConversationId}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); setError(d.error || t("chat.clearFailed")); return; }
      setMessages([]);
      setShowMoreMenu(false);
    } catch { setError("Network error"); }
    finally { setClearLoading(false); }
  }

  async function handleCreateChar(e: React.FormEvent) {
    e.preventDefault();
    if (!charForm.id || !charForm.name) { setCharError(t("char.idRequired")); return; }
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
      if (charForm.tags) {
        body.tags = charForm.tags.split(",").map((s: string) => s.trim()).filter(Boolean);
      } else {
        body.tags = [];
      }
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setCharError(data.error || (isEdit ? t("char.updateFailed") : t("char.createFailed"))); return; }
      const refresh = await fetch("/api/characters");
      if (refresh.ok) { const list = await refresh.json(); if (Array.isArray(list)) setCharacters(list); }
      setShowCreateChar(false);
      setEditingCharId(null);
      setCharForm({ id: "", name: "", description: "", personality: "", scenario: "", first_mes: "", mes_example: "", system_prompt: "", post_history_instructions: "", alternate_greetings: "", creator: "", character_version: "", creator_notes: "", tags: "" });
    } catch { setCharError(t("common.networkError")); }
    finally { setCharCreating(false); }
  }

  async function startEditChar(char: Character) {
    setEditingCharId(char.id);
    try {
      const res = await fetch(`/api/characters?id=${char.id}`);
      if (res.ok) {
        const full = await res.json();
        setCharForm({ id: full.id || char.id, name: full.name || char.name, description: full.description || char.description || "", personality: full.personality || "", scenario: full.scenario || "", first_mes: full.first_mes || full.firstMessage || "", mes_example: full.mes_example || "", system_prompt: full.system_prompt || "", post_history_instructions: full.post_history_instructions || "", alternate_greetings: Array.isArray(full.alternate_greetings) ? full.alternate_greetings.join("\n") : "", creator: full.creator || "", character_version: full.character_version || "", creator_notes: full.creator_notes || "", tags: Array.isArray(full.tags) ? full.tags.join(", ") : "" });
      } else {
        setCharForm({ id: char.id, name: char.name, description: char.description || "", personality: "", scenario: "", first_mes: char.firstMessage || "", mes_example: "", system_prompt: "", post_history_instructions: "", alternate_greetings: "", creator: "", character_version: "", creator_notes: "", tags: "" });
      }
    } catch {
      setCharForm({ id: char.id, name: char.name, description: char.description || "", personality: "", scenario: "", first_mes: char.firstMessage || "", mes_example: "", system_prompt: "", post_history_instructions: "", alternate_greetings: "", creator: "", character_version: "", creator_notes: "", tags: "" });
    }
    setShowCreateChar(true);
    setShowMoreMenu(false);
  }

  async function handleExportChar(char: Character) {
    try {
      const res = await fetch(`/api/characters?id=${char.id}`);
      if (!res.ok) { setError(t("char.exportFailed")); return; }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${char.id}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch { setError(t("char.exportFailed")); }
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
      if (messages.length === 0) { setError(t("chat.noValidMessages")); return; }

      const res = await fetch("/api/chat/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: selectedChar.id, conversationId: activeConversationId || undefined, messages }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || t("chat.importFailed")); return; }
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
      alert(`${t("common.import")} ${data.imported} ${t("chat.importSuccess")}`);
    } catch { setError(t("chat.importFailed")); }
  }

  async function handleImportChar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!json.id || !json.name) { setError(t("char.idRequired")); return; }
      const res = await fetch("/api/characters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t("chat.importFailed")); return; }
      const refresh = await fetch("/api/characters");
      if (refresh.ok) { const list = await refresh.json(); if (Array.isArray(list)) setCharacters(list); }
      setError("");
    } catch { setError(t("chat.importFailed")); }
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
      if (!res.ok) { const d = await res.json(); setError(d.error || t("chat.sendFailed")); setLoading(false); setThinking(false); return; }
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
          <span className="wechat-nav-title">{t("chat.emptyTitle")}</span>
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
                <div className="chat-list-preview">{c.description || c.firstMessage || t("chat.emptyHint")}</div>
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
            <div className="wechat-empty">{t("chat.emptyConversation")}</div>
          )}
        </div>
        {/* Bottom bar for admin actions */}
        {role === "admin" && (
          <div className="wechat-list-footer">
            <button className="wechat-footer-btn" onClick={() => setShowCreateChar(true)}>+ {t("char.create")}</button>
            <label className="wechat-footer-btn import-label">
              {t("common.import")}
              <input type="file" accept=".json" className="import-input" onChange={handleImportChar} />
            </label>
            <button className="wechat-footer-btn" onClick={openAdmin}>{t("admin.users")}</button>
            <button className="wechat-footer-btn" onClick={handleLogout}>{t("common.logout")}</button>
          </div>
        )}
        {role !== "admin" && (
          <div className="wechat-list-footer">
            <button className="wechat-footer-btn" onClick={handleLogout}>{t("common.logout")}</button>
          </div>
        )}

        {/* Modals */}
        {showSettings && (
          <div className="wechat-overlay" onClick={() => setShowSettings(false)}>
            <div className="wechat-modal" onClick={(e) => e.stopPropagation()}>
              <div className="wechat-modal-header">
                <span>{t("settings.title")}</span>
                <button className="wechat-modal-close" onClick={() => setShowSettings(false)}>×</button>
              </div>
              <div className="wechat-modal-body">
                <div className="settings-field">
                  <label>{t("settings.temperature")}: <strong>{settings.temperature.toFixed(1)}</strong></label>
                  <input type="range" min="0.1" max="2.0" step="0.1" value={settings.temperature}
                    onChange={(e) => { const next = { ...settings, temperature: parseFloat(e.target.value) }; setSettings(next); saveSettings(next); }} />
                </div>
                <div className="settings-field">
                  <label>{t("settings.maxTokens")}: <strong>{settings.maxTokens}</strong></label>
                  <input type="range" min="256" max="4096" step="128" value={settings.maxTokens}
                    onChange={(e) => { const next = { ...settings, maxTokens: parseInt(e.target.value) }; setSettings(next); saveSettings(next); }} />
                </div>
                <div className="settings-field">
                  <label>{t("settings.persona")}</label>
                  <textarea className="wechat-textarea" rows={3} value={settings.persona}
                    placeholder={t("settings.personaHint")}
                    onChange={(e) => { const next = { ...settings, persona: e.target.value }; setSettings(next); saveSettings(next); }} />
                </div>
                <div className="settings-field">
                  <label>{t("settings.language")}</label>
                  <select className="wechat-input" value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
                    <option value="zh-CN">{t("lang.zhCN")}</option>
                    <option value="en">{t("lang.en")}</option>
                  </select>
                </div>
                <button className="wechat-btn" onClick={() => { const d = { temperature: 0.8, maxTokens: 1024, persona: "" }; setSettings(d); saveSettings(d); }}>{t("settings.resetDefaults")}</button>
              </div>
            </div>
          </div>
        )}

        {showCreateChar && (
          <div className="wechat-overlay" onClick={() => { setShowCreateChar(false); setEditingCharId(null); }}>
            <div className="wechat-modal" onClick={(e) => e.stopPropagation()}>
              <div className="wechat-modal-header">
                <span>{editingCharId ? t("char.editTitle") : t("char.createTitle")}</span>
                <button className="wechat-modal-close" onClick={() => { setShowCreateChar(false); setEditingCharId(null); }}>×</button>
              </div>
              {charError && <div className="wechat-error">{charError}</div>}
              <form className="wechat-modal-body" onSubmit={handleCreateChar}>
                <div className="settings-field">
                  <label>{t("char.id")} *</label>
                  <input className="wechat-input" value={charForm.id}
                    onChange={(e) => setCharForm((f) => ({ ...f, id: e.target.value }))}
                    placeholder="alice" required disabled={!!editingCharId} />
                </div>
                <div className="settings-field">
                  <label>{t("char.name")} *</label>
                  <input className="wechat-input" value={charForm.name}
                    onChange={(e) => setCharForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Alice" required />
                </div>
                <div className="settings-field">
                  <label>{t("char.description")}</label>
                  <textarea className="wechat-textarea" rows={2} value={charForm.description}
                    onChange={(e) => setCharForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="A brief description" />
                </div>
                <div className="settings-field">
                  <label>{t("char.personality")}</label>
                  <textarea className="wechat-textarea" rows={2} value={charForm.personality}
                    onChange={(e) => setCharForm((f) => ({ ...f, personality: e.target.value }))}
                    placeholder="Personality traits" />
                </div>
                <div className="settings-field">
                  <label>{t("char.scenario")}</label>
                  <textarea className="wechat-textarea" rows={2} value={charForm.scenario}
                    onChange={(e) => setCharForm((f) => ({ ...f, scenario: e.target.value }))}
                    placeholder="Conversation scenario" />
                </div>
                <div className="settings-field">
                  <label>{t("char.firstMes")}</label>
                  <textarea className="wechat-textarea" rows={2} value={charForm.first_mes}
                    onChange={(e) => setCharForm((f) => ({ ...f, first_mes: e.target.value }))}
                    placeholder="Opening message" />
                </div>
                <div className="settings-field">
                  <label>{t("char.mesExample")}</label>
                  <textarea className="wechat-textarea" rows={2} value={charForm.mes_example}
                    onChange={(e) => setCharForm((f) => ({ ...f, mes_example: e.target.value }))}
                    placeholder="User: ...&#10;Character: ..." />
                </div>
                <div className="settings-field">
                  <label>{t("char.systemPrompt")}</label>
                  <textarea className="wechat-textarea" rows={2} value={charForm.system_prompt}
                    onChange={(e) => setCharForm((f) => ({ ...f, system_prompt: e.target.value }))}
                    placeholder="Custom system instructions" />
                </div>
                <div className="settings-field">
                  <label>{t("char.postHistory")}</label>
                  <textarea className="wechat-textarea" rows={2} value={charForm.post_history_instructions}
                    onChange={(e) => setCharForm((f) => ({ ...f, post_history_instructions: e.target.value }))}
                    placeholder="Instructions injected after chat history" />
                </div>
                <div className="settings-field">
                  <label>{t("char.altGreetings")}</label>
                  <textarea className="wechat-textarea" rows={2} value={charForm.alternate_greetings}
                    onChange={(e) => setCharForm((f) => ({ ...f, alternate_greetings: e.target.value }))}
                    placeholder="Alt greeting 1&#10;Alt greeting 2" />
                </div>
                <div className="settings-field">
                  <label>{t("char.creator")}</label>
                  <input className="wechat-input" value={charForm.creator}
                    onChange={(e) => setCharForm((f) => ({ ...f, creator: e.target.value }))}
                    placeholder="Character creator name" />
                </div>
                <div className="settings-field">
                  <label>{t("char.version")}</label>
                  <input className="wechat-input" value={charForm.character_version}
                    onChange={(e) => setCharForm((f) => ({ ...f, character_version: e.target.value }))}
                    placeholder="1.0" />
                </div>
                <div className="settings-field">
                  <label>{t("char.creatorNotes")}</label>
                  <textarea className="wechat-textarea" rows={2} value={charForm.creator_notes}
                    onChange={(e) => setCharForm((f) => ({ ...f, creator_notes: e.target.value }))}
                    placeholder="Display-only notes for the creator" />
                </div>
                <div className="settings-field">
                  <label>{t("char.tags")}</label>
                  <input className="wechat-input" value={charForm.tags}
                    onChange={(e) => setCharForm((f) => ({ ...f, tags: e.target.value }))}
                    placeholder="friend, fantasy, slice-of-life" />
                </div>
                <button className="wechat-btn wechat-btn-primary" type="submit" disabled={charCreating}>
                  {charCreating ? t("char.saving") : editingCharId ? t("char.updateBtn") : t("char.createBtn")}
                </button>
              </form>
            </div>
          </div>
        )}

        {showAdmin && (
          <div className="wechat-overlay" onClick={() => { setShowAdmin(false); setDeleteConfirm(null); }}>
            <div className="wechat-modal" onClick={(e) => e.stopPropagation()}>
              <div className="wechat-modal-header">
                <span>{t("admin.title")}</span>
                <button className="wechat-modal-close" onClick={() => { setShowAdmin(false); setDeleteConfirm(null); }}>×</button>
              </div>
              {adminError && <div className="wechat-error">{adminError}</div>}
              {adminLoading ? <p className="wechat-loading">{t("common.loading")}</p> : (
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
                            <button className="mini-btn danger" onClick={() => handleDeleteUser(u.id)}>{t("common.confirm")}</button>
                            <button className="mini-btn" onClick={() => setDeleteConfirm(null)}>{t("common.cancel")}</button>
                          </span>
                        ) : (
                          <button className="mini-btn danger-outline" onClick={() => setDeleteConfirm(u.id)} disabled={u.id === "demo"}>{t("common.delete")}</button>
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
              <button onClick={() => { setDrawerOpen(true); setShowMoreMenu(false); }}>{t("conversation.title")}</button>
              <button onClick={() => { handleNewChat(); }}>{t("chat.newChat")}</button>
              <button onClick={() => { setShowCharInfo(true); setShowMoreMenu(false); }}>{t("chat.characterInfo")}</button>
              <button onClick={() => { setShowSettings(true); setShowMoreMenu(false); }}>{t("settings.title")}</button>
              <button onClick={toggleTheme}>{theme === "light" ? t("settings.themeDark") : t("settings.themeLight")}</button>
              {role === "admin" && <button onClick={() => { startEditChar(selectedChar); }}>{t("char.edit")}</button>}
              <button onClick={handleClearChat} disabled={clearLoading || messages.length === 0}>
                {clearLoading ? t("common.loading") : t("chat.clearChat")}
              </button>
              <button onClick={handleExportJsonl} disabled={messages.length === 0}>{t("common.export")} JSONL</button>
              <button onClick={() => importFileInputRef.current?.click()}>{t("common.import")} JSONL</button>
              <input type="file" accept=".jsonl" ref={importFileInputRef} style={{ display: "none" }} onChange={handleImportJsonl} />
              <button onClick={handleLogout}>{t("common.logout")}</button>
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
            placeholder={t("chat.searchPlaceholder")}
            autoFocus
          />
          {searchQuery && (
            <span className="search-count">
              {messages.filter((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase())).length} {t("chat.messages")}
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
                  {copiedId === m.id ? t("chat.copiedMessage") : t("chat.copyMessage")}
                </button>
                {m.role === "assistant" && i === arr.length - 1 && !loading && !thinking && (
                  <button className="wx-action-btn" onClick={handleRegenerate}>{t("chat.regenerate")}</button>
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
                {t("common.yes")}
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
              <span className="loading-dots">{t("chat.thinking")}</span>
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
          placeholder={t("chat.inputPlaceholder")}
          disabled={loading}
        />
        <button type="button" className="input-tool-btn" title="Emoji" aria-label="Emoji">
          😊
        </button>
        {input.trim() ? (
          <button type="submit" className="input-send-btn" disabled={loading}>
            {t("chat.send")}
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
              <span>{t("chat.selectCharacter")}</span>
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
                      <button className="drawer-new-chat-btn" onClick={handleNewChat}>+ {t("chat.newChat")}</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {role === "admin" && (
              <div className="wechat-drawer-footer">
                <button className="wechat-footer-btn" onClick={() => setShowCreateChar(true)}>+ {t("char.create")}</button>
                <label className="wechat-footer-btn import-label">
                  Import
                  <input type="file" accept=".json" className="import-input" onChange={handleImportChar} />
                </label>
                <button className="wechat-footer-btn" onClick={openAdmin}>{t("admin.users")}</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modals (reused from character list view) */}
      {showCharInfo && selectedChar && (
        <div className="wechat-overlay" onClick={() => setShowCharInfo(false)}>
          <div className="wechat-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wechat-modal-header">
              <span>{selectedChar.name}</span>
              <button className="wechat-modal-close" onClick={() => setShowCharInfo(false)}>×</button>
            </div>
            <div className="wechat-modal-body char-info-body">
              {selectedChar.description && <div className="char-info-section"><label>{t("charInfo.description")}</label><p>{selectedChar.description}</p></div>}
              {selectedChar.personality && <div className="char-info-section"><label>{t("charInfo.personality")}</label><p>{selectedChar.personality}</p></div>}
              {selectedChar.scenario && <div className="char-info-section"><label>{t("charInfo.scenario")}</label><p>{selectedChar.scenario}</p></div>}
              {selectedChar.system_prompt && <div className="char-info-section"><label>{t("charInfo.systemPrompt")}</label><p>{selectedChar.system_prompt}</p></div>}
              {selectedChar.mes_example && <div className="char-info-section"><label>{t("charInfo.mesExample")}</label><pre>{selectedChar.mes_example}</pre></div>}
              {selectedChar.post_history_instructions && <div className="char-info-section"><label>{t("charInfo.postHistory")}</label><p>{selectedChar.post_history_instructions}</p></div>}
              {selectedChar.tags && selectedChar.tags.length > 0 && <div className="char-info-section"><label>{t("charInfo.tags")}</label><p>{selectedChar.tags.join(", ")}</p></div>}
              {selectedChar.creator && <div className="char-info-section"><label>{t("charInfo.creator")}</label><p>{selectedChar.creator}{selectedChar.character_version ? ` · v${selectedChar.character_version}` : ""}</p></div>}
              {selectedChar.creator_notes && <div className="char-info-section"><label>{t("charInfo.creatorNotes")}</label><p>{selectedChar.creator_notes}</p></div>}
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="wechat-overlay" onClick={() => setShowSettings(false)}>
          <div className="wechat-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wechat-modal-header">
              <span>{t("settings.title")}</span>
              <button className="wechat-modal-close" onClick={() => setShowSettings(false)}>×</button>
            </div>
            <div className="wechat-modal-body">
              <div className="settings-field">
                <label>{t("settings.temperature")}: <strong>{settings.temperature.toFixed(1)}</strong></label>
                <input type="range" min="0.1" max="2.0" step="0.1" value={settings.temperature}
                  onChange={(e) => { const next = { ...settings, temperature: parseFloat(e.target.value) }; setSettings(next); saveSettings(next); }} />
              </div>
              <div className="settings-field">
                <label>{t("settings.maxTokens")}: <strong>{settings.maxTokens}</strong></label>
                <input type="range" min="256" max="4096" step="128" value={settings.maxTokens}
                  onChange={(e) => { const next = { ...settings, maxTokens: parseInt(e.target.value) }; setSettings(next); saveSettings(next); }} />
              </div>
              <div className="settings-field">
                <label>{t("settings.persona")}</label>
                <textarea className="wechat-textarea" rows={3} value={settings.persona}
                  placeholder={t("settings.personaHint")}
                  onChange={(e) => { const next = { ...settings, persona: e.target.value }; setSettings(next); saveSettings(next); }} />
              </div>
              <div className="settings-field">
                <label>{t("settings.language")}</label>
                <select className="wechat-input" value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
                  <option value="zh-CN">{t("lang.zhCN")}</option>
                  <option value="en">{t("lang.en")}</option>
                </select>
              </div>
              <button className="wechat-btn wechat-btn-primary" onClick={() => { const d = { temperature: 0.8, maxTokens: 1024, persona: "" }; setSettings(d); saveSettings(d); }}>{t("settings.resetDefaults")}</button>
            </div>
          </div>
        </div>
      )}

      {showCreateChar && (
        <div className="wechat-overlay" onClick={() => { setShowCreateChar(false); setEditingCharId(null); }}>
          <div className="wechat-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wechat-modal-header">
              <span>{editingCharId ? t("char.editTitle") : t("char.createTitle")}</span>
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
              <div className="settings-field">
                <label>Creator Notes</label>
                <textarea className="wechat-textarea" rows={2} value={charForm.creator_notes}
                  onChange={(e) => setCharForm((f) => ({ ...f, creator_notes: e.target.value }))}
                  placeholder="Display-only notes for the creator" />
              </div>
              <div className="settings-field">
                <label>Tags (comma-separated)</label>
                <input className="wechat-input" value={charForm.tags}
                  onChange={(e) => setCharForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="friend, fantasy, slice-of-life" />
              </div>
              <button className="wechat-btn wechat-btn-primary" type="submit" disabled={charCreating}>
                {charCreating ? t("char.saving") : editingCharId ? t("char.updateBtn") : t("char.createBtn")}
              </button>
            </form>
          </div>
        </div>
      )}

      {showAdmin && (
        <div className="wechat-overlay" onClick={() => { setShowAdmin(false); setDeleteConfirm(null); }}>
          <div className="wechat-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wechat-modal-header">
              <span>{t("admin.title")}</span>
              <button className="wechat-modal-close" onClick={() => { setShowAdmin(false); setDeleteConfirm(null); }}>×</button>
            </div>
            {adminError && <div className="wechat-error">{adminError}</div>}
            {adminLoading ? <p className="wechat-loading">{t("common.loading")}</p> : (
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
                          <button className="mini-btn danger" onClick={() => handleDeleteUser(u.id)}>{t("common.confirm")}</button>
                          <button className="mini-btn" onClick={() => setDeleteConfirm(null)}>{t("common.cancel")}</button>
                        </span>
                      ) : (
                        <button className="mini-btn danger-outline" onClick={() => setDeleteConfirm(u.id)} disabled={u.id === "demo"}>{t("common.delete")}</button>
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
