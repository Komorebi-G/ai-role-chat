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
  createdAt: string;
}

interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  _count?: { messages: number };
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
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [role, setRole] = useState<string>("user");
  const [settings, setSettings] = useState<ChatSettings>(loadSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showCreateChar, setShowCreateChar] = useState(false);
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [charForm, setCharForm] = useState({ id: "", name: "", description: "", personality: "", scenario: "", first_mes: "", mes_example: "", system_prompt: "", post_history_instructions: "", alternate_greetings: "", creator: "", character_version: "", creator_notes: "", tags: "" });
  const [charError, setCharError] = useState("");
  const [charCreating, setCharCreating] = useState(false);
  const [showCharInfo, setShowCharInfo] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [renamingConvId, setRenamingConvId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const msgEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Init theme (suppress lint: must set client state once on mount)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTheme(loadTheme()); }, []);
  useEffect(() => { applyTheme(theme); }, [theme]);

  // Load characters
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

  // Load conversations when character selected
  useEffect(() => {
    if (!selectedChar) return;
    fetch(`/api/conversations?characterId=${selectedChar.id}`)
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setConversations(data); })
      .catch(() => {});
  }, [selectedChar]);

  // Load messages when conversation selected
  useEffect(() => {
    if (!selectedChar || !activeConversationId) return;
    fetch(`/api/chat?characterId=${selectedChar.id}&conversationId=${activeConversationId}`)
      .then((res) => res.json())
      .then((data) => { if (data.messages) setMessages(data.messages); })
      .catch(() => {});
  }, [selectedChar, activeConversationId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    msgEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleNewChat() {
    if (!selectedChar) return;
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: selectedChar.id, title: t("conversation.newChat") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t("chat.createChatFailed")); return; }
      setConversations((prev) => [data, ...prev]);
      setActiveConversationId(data.id);
      setMessages([]);
      setError("");
      setDrawerOpen(false);
    } catch { setError(t("common.networkError")); }
  }

  async function handleSelectConversation(convId: string) {
    setActiveConversationId(convId);
    setError("");
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

  function cancelRename() { setRenamingConvId(null); }

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

      // If this is a new conversation, grab the ID from the response
      if (!activeConversationId) {
        const convs = await fetch(`/api/conversations?characterId=${selectedChar.id}`).then((r) => r.json());
        if (Array.isArray(convs) && convs.length > 0) {
          setActiveConversationId(convs[0].id);
          setConversations(convs);
        }
      }

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
          setMessages((prev) => [...prev, { id: assistantMsgId, role: "assistant", content: buffer, createdAt: new Date().toISOString() }]);
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

  async function handleClearChat() {
    if (!selectedChar || !activeConversationId) return;
    setError("");
    try {
      const res = await fetch(`/api/chat?characterId=${selectedChar.id}&conversationId=${activeConversationId}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); setError(d.error || "Failed"); return; }
      setMessages([]);
      setConversations((prev) => prev.filter((c) => c.id !== activeConversationId));
      setActiveConversationId("");
    } catch { setError(t("common.networkError")); }
  }

  // Character CRUD
  async function handleCharSubmit() {
    setCharCreating(true);
    setCharError("");
    try {
      const isEdit = !!editingCharId;
      const url = isEdit ? `/api/characters?id=${editingCharId}` : "/api/characters";
      const method = isEdit ? "PUT" : "POST";
      const body: Record<string, unknown> = { ...charForm };
      body.alternate_greetings = charForm.alternate_greetings ? charForm.alternate_greetings.split("\n").map((s: string) => s.trim()).filter(Boolean) : [];
      body.tags = charForm.tags ? charForm.tags.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
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
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.networkError");
      setCharError(message);
    }
    setShowCreateChar(true);
    setShowMoreMenu(false);
  }

  // Copy message content
  async function handleCopy(text: string, msgId: string) {
    try { await navigator.clipboard.writeText(text); setCopyFeedback(msgId); setTimeout(() => setCopyFeedback(null), 1500); } catch { /* ignore */ }
  }

  // Toggle theme
  function toggleTheme() {
    setTheme((prev) => prev === "light" ? "dark" : "light");
    setShowMoreMenu(false);
  }

  // Filter messages by search
  const filteredMessages = searchQuery
    ? messages.filter((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  return (
    <div className="wechat-container">
      {/* ===== CHARACTER LIST VIEW ===== */}
      {!selectedChar && (
        <div className="wechat-body">
          <div className="wechat-header">
            <span className="wechat-title">{t("app.title")}</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select className="lang-switch" value={locale} onChange={(e) => setLocale(e.target.value as Locale)} style={{ padding: "4px 8px", fontSize: 12, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}>
                <option value="zh-CN">中文</option>
                <option value="en">EN</option>
              </select>
              <button className="wechat-header-btn theme-btn" onClick={toggleTheme}>{theme === "light" ? "🌙" : "☀️"}</button>
              <button className="wechat-header-btn" onClick={handleLogout}>{t("auth.logout")}</button>
            </div>
          </div>

          <div className="char-list">
            {characters.map((c) => (
              <div key={c.id} className="char-card" onClick={() => { setSelectedChar(c); setMessages([]); setActiveConversationId(""); setConversations([]); }}>
                <div className="char-avatar">{avatarLetter(c.name)}</div>
                <div className="char-info">
                  <div className="char-name">{c.name}</div>
                  <div className="char-preview">{c.description || c.personality || ""}</div>
                </div>
                <button className="char-info-btn" onClick={(e) => { e.stopPropagation(); setSelectedChar(c); setShowCharInfo(true); }}>ℹ</button>
              </div>
            ))}
            {characters.length === 0 && <p className="wechat-loading">{t("common.loading")}</p>}
          </div>

          {/* Bottom bar */}
          {role === "admin" && (
            <div className="wechat-footer">
              <button className="wechat-send-btn" onClick={() => { setEditingCharId(null); setCharForm({ id: "", name: "", description: "", personality: "", scenario: "", first_mes: "", mes_example: "", system_prompt: "", post_history_instructions: "", alternate_greetings: "", creator: "", character_version: "", creator_notes: "", tags: "" }); setCharError(""); setShowCreateChar(true); }} style={{ width: "100%" }}>+ {t("char.create")}</button>
            </div>
          )}
        </div>
      )}

      {/* ===== CHAT VIEW ===== */}
      {selectedChar && (
        <div className="wechat-body">
          {/* Top nav */}
          <div className="wechat-header">
            <button className="wechat-header-btn" onClick={handleBack} style={{ fontSize: 20 }}>←</button>
            <span className="wechat-title" style={{ flex: 1, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedChar.name}</span>
            <button className="wechat-header-btn" onClick={() => setShowCharInfo(true)}>ℹ</button>
            <button className="wechat-header-btn" onClick={() => setShowMoreMenu(true)}>⋯</button>
          </div>

          {/* Search bar */}
          {messages.length > 0 && (
            <div style={{ padding: "4px 12px", borderBottom: "1px solid var(--border)" }}>
              <input
                className="wechat-input"
                type="text"
                placeholder={t("chat.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ fontSize: 13, padding: "6px 10px" }}
              />
            </div>
          )}

          {/* Messages */}
          <div className="msg-scroll">
            {filteredMessages.length === 0 && !thinking && (
              <p className="wechat-loading">{t("chat.startConversation")}</p>
            )}
            {filteredMessages.map((m) => (
              <div key={m.id} className={`wx-bubble-row ${m.role === "user" ? "self" : "other"}`}>
                {m.role === "assistant" && (
                  <div className="wx-bubble-avatar">{avatarLetter(selectedChar.name)}</div>
                )}
                <div className={`wx-bubble ${m.role === "user" ? "self" : "other"}`}>
                  {m.role === "assistant" ? (
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  ) : (
                    m.content
                  )}
                  <div className="wx-bubble-actions">
                    <button className="wx-action-btn" onClick={() => handleCopy(m.content, m.id)}>
                      {copyFeedback === m.id ? "✓" : t("chat.copy")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {thinking && (
              <div className="wx-bubble-row other">
                <div className="wx-bubble-avatar">{avatarLetter(selectedChar.name)}</div>
                <div className="wx-bubble other thinking">{t("chat.thinking")}</div>
              </div>
            )}
            {error && <div className="wechat-error">{error}</div>}
            <div ref={msgEnd} />
          </div>

          {/* Input bar */}
          <form className="wechat-footer" onSubmit={handleSend}>
            <input
              ref={inputRef}
              className="wechat-input"
              type="text"
              placeholder={t("chat.inputPlaceholder")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <button className="wechat-send-btn" type="submit" disabled={loading || !input.trim()}>
              {t("chat.send")}
            </button>
          </form>

          {/* More menu modal */}
          {showMoreMenu && (
            <div className="wechat-overlay" onClick={() => setShowMoreMenu(false)}>
              <div className="wechat-modal" onClick={(e) => e.stopPropagation()}>
                <div className="wechat-modal-title">{t("common.menu")}</div>
                <button className="wechat-modal-btn" onClick={() => { setShowMoreMenu(false); setDrawerOpen(true); }}>{t("conversation.title")}</button>
                <button className="wechat-modal-btn" onClick={() => { setShowMoreMenu(false); handleNewChat(); }}>{t("conversation.newChat")}</button>
                <button className="wechat-modal-btn" onClick={() => { setShowMoreMenu(false); setShowSettings(true); }}>{t("settings.title")}</button>
                <button className="wechat-modal-btn" onClick={() => { setShowMoreMenu(false); toggleTheme(); }}>{t("settings.theme")}</button>
                {role === "admin" && <button className="wechat-modal-btn" onClick={() => { setEditingCharId(selectedChar.id); setShowMoreMenu(false); startEditChar(selectedChar); }}>{t("char.edit")}</button>}
                <button className="wechat-modal-btn danger-text" onClick={() => { setShowMoreMenu(false); handleClearChat(); }}>{t("chat.clearChat")}</button>
                <button className="wechat-modal-btn" onClick={() => { setShowMoreMenu(false); handleLogout(); }}>{t("auth.logout")}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== DRAWER ===== */}
      {drawerOpen && selectedChar && (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <span className="drawer-title">{selectedChar.name}</span>
              <button className="wechat-header-btn" onClick={() => setDrawerOpen(false)}>×</button>
            </div>
            <button className="drawer-new-chat" onClick={handleNewChat}>+ {t("conversation.newChat")}</button>
            <div className="drawer-chats">
              {conversations.map((conv) => (
                <div key={conv.id} className={`drawer-chat-item ${conv.id === activeConversationId ? "active" : ""}`} onClick={() => handleSelectConversation(conv.id)}>
                  {renamingConvId === conv.id ? (
                    <input
                      className="wechat-input"
                      value={renameTitle}
                      onChange={(e) => setRenameTitle(e.target.value)}
                      onBlur={saveRename}
                      onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") cancelRename(); }}
                      autoFocus
                      style={{ fontSize: 14 }}
                    />
                  ) : (
                    <>
                      <div className="drawer-chat-title" onDoubleClick={() => startRename(conv)}>{conv.title}</div>
                      <div className="drawer-chat-meta">{conv._count?.messages ?? 0} {t("chat.messages")}</div>
                    </>
                  )}
                </div>
              ))}
              {conversations.length === 0 && <p style={{ padding: 16, color: "var(--text-muted)", fontSize: 14 }}>{t("conversation.empty")}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ===== SETTINGS MODAL ===== */}
      {showSettings && (
        <div className="wechat-overlay" onClick={() => setShowSettings(false)}>
          <div className="wechat-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wechat-modal-title">{t("settings.title")}</div>
            <label className="wechat-modal-label">{t("settings.temperature")}: {settings.temperature}</label>
            <input className="wechat-input" type="range" min="0.1" max="2.0" step="0.1" value={settings.temperature} onChange={(e) => { const s = { ...settings, temperature: parseFloat(e.target.value) }; setSettings(s); saveSettings(s); }} />
            <label className="wechat-modal-label">{t("settings.maxTokens")}: {settings.maxTokens}</label>
            <input className="wechat-input" type="range" min="128" max="4096" step="128" value={settings.maxTokens} onChange={(e) => { const s = { ...settings, maxTokens: parseInt(e.target.value) }; setSettings(s); saveSettings(s); }} />
            <label className="wechat-modal-label">{t("settings.persona")}</label>
            <textarea className="wechat-input" rows={3} value={settings.persona} onChange={(e) => { const s = { ...settings, persona: e.target.value }; setSettings(s); saveSettings(s); }} />
            <button className="wechat-modal-btn" onClick={() => setShowSettings(false)}>{t("common.close")}</button>
          </div>
        </div>
      )}

      {/* ===== CHARACTER INFO MODAL ===== */}
      {showCharInfo && selectedChar && (
        <div className="wechat-overlay" onClick={() => setShowCharInfo(false)}>
          <div className="wechat-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="wechat-modal-title">{selectedChar.name}</div>
            {selectedChar.description && <p style={{ margin: "4px 0", fontSize: 14 }}>{selectedChar.description}</p>}
            {selectedChar.personality && <p style={{ margin: "4px 0", fontSize: 14, color: "var(--text-muted)" }}>{t("char.personality")}: {selectedChar.personality}</p>}
            {selectedChar.scenario && <p style={{ margin: "4px 0", fontSize: 14, color: "var(--text-muted)" }}>{t("char.scenario")}: {selectedChar.scenario}</p>}
            {selectedChar.creator && <p style={{ margin: "4px 0", fontSize: 12, color: "var(--text-muted)" }}>by {selectedChar.creator}</p>}
            <button className="wechat-modal-btn" onClick={() => setShowCharInfo(false)}>{t("common.close")}</button>
          </div>
        </div>
      )}

      {/* ===== CHARACTER CREATE/EDIT MODAL ===== */}
      {showCreateChar && (
        <div className="wechat-overlay" onClick={() => { if (!charCreating) { setShowCreateChar(false); setEditingCharId(null); } }}>
          <div className="wechat-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, maxHeight: "90vh", overflowY: "auto" }}>
            <div className="wechat-modal-title">{editingCharId ? t("char.edit") : t("char.create")}</div>
            {charError && <div className="wechat-error">{charError}</div>}
            <input className="wechat-input" placeholder={t("char.id")} value={charForm.id} onChange={(e) => setCharForm({ ...charForm, id: e.target.value })} disabled={!!editingCharId} />
            <input className="wechat-input" placeholder={t("char.name")} value={charForm.name} onChange={(e) => setCharForm({ ...charForm, name: e.target.value })} />
            <textarea className="wechat-input" rows={3} placeholder={t("char.description")} value={charForm.description} onChange={(e) => setCharForm({ ...charForm, description: e.target.value })} />
            <textarea className="wechat-input" rows={2} placeholder={t("char.personality")} value={charForm.personality} onChange={(e) => setCharForm({ ...charForm, personality: e.target.value })} />
            <textarea className="wechat-input" rows={2} placeholder={t("char.scenario")} value={charForm.scenario} onChange={(e) => setCharForm({ ...charForm, scenario: e.target.value })} />
            <textarea className="wechat-input" rows={2} placeholder={t("char.first_mes")} value={charForm.first_mes} onChange={(e) => setCharForm({ ...charForm, first_mes: e.target.value })} />
            <textarea className="wechat-input" rows={3} placeholder={t("char.mes_example")} value={charForm.mes_example} onChange={(e) => setCharForm({ ...charForm, mes_example: e.target.value })} />
            <textarea className="wechat-input" rows={3} placeholder={t("char.system_prompt")} value={charForm.system_prompt} onChange={(e) => setCharForm({ ...charForm, system_prompt: e.target.value })} />
            <textarea className="wechat-input" rows={2} placeholder={t("char.post_history_instructions")} value={charForm.post_history_instructions} onChange={(e) => setCharForm({ ...charForm, post_history_instructions: e.target.value })} />
            <button className="wechat-modal-btn" onClick={handleCharSubmit} disabled={charCreating || !charForm.id || !charForm.name}>{charCreating ? t("common.saving") : (editingCharId ? t("common.save") : t("char.create"))}</button>
            <button className="wechat-modal-btn" onClick={() => { setShowCreateChar(false); setEditingCharId(null); }}>{t("common.cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
