"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { useTranslation } from "@/lib/i18n";
import type { Character, Message, ConversationSummary, AdminUser, ChatSettings } from "./types";
import SettingsModal from "./SettingsModal";
import CharacterFormModal from "./CharacterFormModal";
import AdminModal from "./AdminModal";
import WorldInfoModal from "./WorldInfoModal";
import PromptDebugModal from "./PromptDebugModal";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
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

/** Format a date as a relative time string for conversation list. */
function formatRelativeTime(dateStr: string, locale: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const isZh = locale.startsWith("zh");

  if (diffMin < 1) return isZh ? "刚刚" : "Just now";
  if (diffMin < 60) return isZh ? `${diffMin}分钟前` : `${diffMin}m ago`;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateDay.getTime() === today.getTime()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (dateDay.getTime() === yesterday.getTime()) {
    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    return (isZh ? "昨天 " : "Yesterday ") + time;
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: "2-digit", day: "2-digit" });
  }
  return date.toLocaleDateString([], { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** Format a message's time for time dividers in the chat stream. */
function formatMessageTime(dateStr: string, locale: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isZh = locale.startsWith("zh");

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  if (msgDay.getTime() === today.getTime()) {
    return (isZh ? "今天 " : "Today ") + time;
  }
  if (msgDay.getTime() === yesterday.getTime()) {
    return (isZh ? "昨天 " : "Yesterday ") + time;
  }
  return date.toLocaleDateString([], { month: "2-digit", day: "2-digit" }) + " " + time;
}

/** Return true if a time divider should be inserted between two messages. */
function shouldShowTimeDivider(prevDateStr: string, currentDateStr: string): boolean {
  const prev = new Date(prevDateStr).getTime();
  const curr = new Date(currentDateStr).getTime();
  return (curr - prev) > 5 * 60 * 1000; // 5 minute gap
}

export default function ChatPage() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  // Wider-type wrapper to pass t to modal components that accept (key: string) => string
  const tf: (key: string) => string = (key) => t(key as never);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState(false);
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
    creator_notes: "", tags: "", avatar: "",
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
  const [showWorldInfo, setShowWorldInfo] = useState(false);
  const [showPromptDebug, setShowPromptDebug] = useState(false);

  // Conversation participants (loaded from active conversation's characterIds)
  const [participants, setParticipants] = useState<Character[]>([]);
  // Multi-select mode for creating new conversation
  const [newChatSelection, setNewChatSelection] = useState<Character[]>([]);
  const [showNewChatSelector, setShowNewChatSelector] = useState(false);
  // Global conversation list (home screen, WeChat-style)
  const [allConversations, setAllConversations] = useState<ConversationSummary[]>([]);

  // PWA install prompt
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof navigator !== "undefined") return navigator.onLine;
    return true;
  });
  const [showIOSHint, setShowIOSHint] = useState(false);

  // Apply theme on mount
  useEffect(() => {
    const t = loadTheme();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(t);
    applyTheme(t);
  }, []);

  useEffect(() => { applyTheme(theme); }, [theme]);

  // Listen for PWA install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setShowInstallBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Online/offline detection — initial value set in useState initializer
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // iOS install hint (iOS doesn't support beforeinstallprompt)
  useEffect(() => {
    const ua = navigator.userAgent || "";
    const isIOSDevice = /iphone|ipad|ipod/i.test(ua);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    if (isIOSDevice && !isStandalone && !localStorage.getItem("ios-hint-dismissed")) {
      const timer = setTimeout(() => setShowIOSHint(true), 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") {
      setShowInstallBanner(false);
      setInstallPrompt(null);
    }
  }

  function dismissIOSHint() {
    setShowIOSHint(false);
    try { localStorage.setItem("ios-hint-dismissed", "1"); } catch { /* ignore */ }
  }

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

  // Load all conversations for home screen and drawer
  const loadAllConversations = () => {
    fetch("/api/conversations")
      .then((res) => res.ok ? res.json() : [])
      .catch(() => [])
      .then((data) => {
        if (Array.isArray(data)) {
          data.sort((a: ConversationSummary, b: ConversationSummary) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          setAllConversations(data);
          // Also set per-character conversations for drawer when in chat
          if (selectedChar) {
            setConversations(data.filter((c: ConversationSummary) => {
              try {
                const ids: string[] = JSON.parse(c.characterIds || "[]");
                return ids.length > 0 ? ids.includes(selectedChar.id) : c.characterId === selectedChar.id;
              } catch { return c.characterId === selectedChar.id; }
            }));
          }
        }
      });
  };

  useEffect(() => {
    loadAllConversations();
  }, []);

  // Refresh per-character conversation list when character changes
  useEffect(() => {
    if (!selectedChar) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConversations([]);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversations(allConversations.filter((c) => {
      try {
        const ids: string[] = JSON.parse(c.characterIds || "[]");
        return ids.length > 0 ? ids.includes(selectedChar.id) : c.characterId === selectedChar.id;
      } catch { return c.characterId === selectedChar.id; }
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChar, allConversations]);

  // Auto-find or create conversation when character is selected with no active conversation
  useEffect(() => {
    if (!selectedChar || activeConversationId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/conversations?characterId=${selectedChar.id}`);
        if (!res.ok || cancelled) return;
        const convs = await res.json();
        if (Array.isArray(convs)) {
          const singleConv = convs.find((c: ConversationSummary) => c.type !== "group");
          if (singleConv) {
            if (!cancelled) setActiveConversationId(singleConv.id);
            return;
          }
        }
        // No existing single conversation, create one
        const createRes = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterIds: [selectedChar.id] }),
        });
        if (cancelled) return;
        const data = await createRes.json();
        if (createRes.ok) {
          setActiveConversationId(data.id);
          setConversations((prev) => [data, ...prev]);
          setAllConversations((prev) => [data, ...prev]);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [selectedChar, activeConversationId]);

  // Load participants when active conversation changes
  useEffect(() => {
    if (!activeConversationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setParticipants([]);
      return;
    }
    const conv = conversations.find((c) => c.id === activeConversationId);
    if (!conv) return;
    let cancelled = false;
    (async () => {
      try {
        const ids: string[] = JSON.parse(conv.characterIds || "[]");
        const charIds = ids.length > 0 ? ids : (conv.characterId ? [conv.characterId] : []);
        if (charIds.length === 0) return;
        const chars = await Promise.all(
          charIds.map(async (id) => {
            const res = await fetch(`/api/characters?id=${id}`);
            if (!res.ok) return null;
            return res.json();
          })
        );
        if (!cancelled) {
          const valid = chars.filter(Boolean) as Character[];
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setParticipants(valid);
          if (valid.length > 0 && !selectedChar) setSelectedChar(valid[0]);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, conversations]);

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
        const msgs: Message[] = data.messages || [];
        setActiveWorldEntryIds(data.worldEntryIds || []);
        if (msgs.length === 0 && participants.length <= 1 && selectedChar.firstMessage) {
          const greetings = [selectedChar.firstMessage, ...(selectedChar.alternate_greetings || [])];
          setMessages([{ id: "first_mes", role: "assistant", content: selectedChar.firstMessage, characterId: selectedChar.id, characterName: selectedChar.name, swipes: JSON.stringify(greetings), swipeId: 0, createdAt: new Date().toISOString() }]);
        } else {
          setMessages(msgs);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedChar, activeConversationId, participants.length]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isGroupChat = participants.length >= 2;

  async function handleNewChat() {
    if (!selectedChar) return;
    try {
      const charIds = isGroupChat
        ? participants.map((c) => c.id)
        : [selectedChar.id];
      const title = isGroupChat
        ? `Group: ${participants.map((c) => c.name).join(", ")}`
        : t("conversation.newChat");
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterIds: charIds, title }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t("chat.createChatFailed")); return; }
      setConversations((prev) => [data, ...prev]);
      setAllConversations((prev) => [data, ...prev]);
      setActiveConversationId(data.id);
      setMessages([]);
      setError("");
      setShowMoreMenu(false);
    } catch { setError(t("common.networkError")); }
  }

  async function handleSelectConversation(conv: ConversationSummary) {
    setActiveConversationId(conv.id);
    setError("");
    setDrawerOpen(false);
  }

  function handleSelectCharacter(c: Character) {
    if (selectedChar?.id === c.id && participants.length <= 1 && activeConversationId) {
      setDrawerOpen(false);
      return;
    }
    setSelectedChar(c);
    setParticipants([c]);
    setMessages([]);
    setActiveConversationId("");
    setDrawerOpen(false);
  }

  function handleBack() {
    setActiveConversationId("");
    setParticipants([]);
    setMessages([]);
    setSelectedChar(null);
    setNewChatSelection([]);
    setShowNewChatSelector(false);
    loadAllConversations();
  }

  function toggleNewChatSelect(c: Character) {
    setNewChatSelection((prev) => {
      const exists = prev.find((gc) => gc.id === c.id);
      if (exists) return prev.filter((gc) => gc.id !== c.id);
      return [...prev, c];
    });
  }

  async function handleStartGroupChat() {
    if (newChatSelection.length < 2) return;
    try {
      const charIds = newChatSelection.map((c) => c.id);
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterIds: charIds,
          title: `Group: ${newChatSelection.map((c) => c.name).join(", ")}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t("chat.createChatFailed")); return; }
      setSelectedChar(newChatSelection[0]);
      setParticipants(newChatSelection);
      setConversations((prev) => [data, ...prev]);
      setAllConversations((prev) => [data, ...prev]);
      setActiveConversationId(data.id);
      setMessages([]);
      setNewChatSelection([]);
      setError("");
      setDrawerOpen(false);
    } catch { setError(t("common.networkError")); }
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
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: message, swipes: "[]", swipeId: 0, createdAt: new Date().toISOString() },
    ]);

    setLoading(true);
    setThinking(true);

    const body: Record<string, unknown> = {
      conversationId: activeConversationId,
      message,
      stream: true,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      persona: settings.persona || undefined,
    };

    if (isGroupChat) {
      body.characterIds = participants.map((c) => c.id);
    } else {
      body.characterId = selectedChar?.id;
    }

    // Track assistant message IDs for cleanup on stream error
    const charMsgIds = new Map<string, string>();
    let singleAssistantId = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 401) { setUnauthorized(true); return; }
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || t("chat.sendFailed"));
        setMessages((prev) => prev.filter((m) => m.id !== userMsgId));
        setLoading(false);
        setThinking(false);
        return;
      }

      const worldHeader = res.headers.get("X-Active-World-Entries");
      setActiveWorldEntryIds(worldHeader ? worldHeader.split(",").filter(Boolean) : []);

      const isGroupResponse = res.headers.get("X-Group-Chat") === "1";
      const reader = res.body?.getReader();
      if (!reader) {
        setError(t("chat.streamNotSupported"));
        setMessages((prev) => prev.filter((m) => m.id !== userMsgId));
        setLoading(false);
        setThinking(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let assistantAdded = false;
      let currentCharId = "";
      let currentCharName = "";
      const charTexts = new Map<string, string>(); // charId → accumulated full text
      let groupMsgsSeen = 0;

      /** Push accumulated text for a character into React state. */
      function flushCharText(charId: string) {
        const msgId = charMsgIds.get(charId);
        if (!msgId) return;
        const full = charTexts.get(charId) || "";
        setMessages((prevMsgs) => prevMsgs.map((m) => m.id === msgId ? { ...m, content: full } : m));
      }

      /** Final reconciliation: flush any remaining buffer and remove still-empty assistant bubbles. */
      function finalizeGroupStream() {
        // Flush leftover buffer for the last active character
        if (buffer && currentCharId) {
          const prev = charTexts.get(currentCharId) || "";
          charTexts.set(currentCharId, prev + buffer);
          flushCharText(currentCharId);
          buffer = "";
        }
        // Remove any assistant messages whose content is still empty or whitespace-only
        // after streaming. This handles two cases:
        // 1. AI returned empty response → message was never updated from ""
        // 2. Delimiter newlines (like \n before [GROUP_END]) were the only "content"
        setMessages((prevMsgs) => {
          const emptyIds = new Set<string>();
          // Check charTexts for empty/whitespace entries
          for (const [charId, text] of charTexts) {
            if (!text.trim()) {
              emptyIds.add(charMsgIds.get(charId) || "");
            }
          }
          // Also scan the message state directly for any assistant message whose
          // content is still empty — this catches messages that were created via
          // GROUP_CHAR but whose charTexts entry was somehow missed.
          for (const m of prevMsgs) {
            if (m.role === "assistant" && !m.content.trim()) {
              emptyIds.add(m.id);
            }
          }
          return emptyIds.size > 0 ? prevMsgs.filter((m) => !emptyIds.has(m.id)) : prevMsgs;
        });
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Stream ended — flush any remaining buffer before exiting
          if (isGroupResponse) finalizeGroupStream();
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        if (isGroupResponse) {
          // Parse group chat delimiters: [GROUP_CHAR:id|name] and [GROUP_END]
          while (true) {
            const charIdx = buffer.indexOf("[GROUP_CHAR:");
            const endIdx = buffer.indexOf("[GROUP_END]");

            if (charIdx === -1 && endIdx === -1) break;

            const useChar = charIdx !== -1 && (endIdx === -1 || charIdx < endIdx);

            if (useChar) {
              // Check for complete delimiter first — if incomplete across chunks, wait for next chunk
              const closeBracket = buffer.indexOf("]\n", charIdx);
              if (closeBracket === -1) break;

              // Text before delimiter belongs to previous character
              const before = buffer.slice(0, charIdx);
              if (before && currentCharId) {
                const prev = charTexts.get(currentCharId) || "";
                charTexts.set(currentCharId, prev + before);
                flushCharText(currentCharId);
              }

              const delim = buffer.slice(charIdx, closeBracket + 2);
              buffer = buffer.slice(closeBracket + 2);

              const match = delim.match(/\[GROUP_CHAR:([^|]+)\|([^\]]+)\]\n/);
              if (match) {
                currentCharId = match[1];
                currentCharName = match[2];
                charTexts.set(currentCharId, "");
                groupMsgsSeen++;
                const newId = (Date.now() + groupMsgsSeen).toString();
                charMsgIds.set(currentCharId, newId);
                setThinking(false);
                setMessages((prevMsgs) => [...prevMsgs, {
                  id: newId, role: "assistant", content: "",
                  characterId: currentCharId, characterName: currentCharName,
                  swipes: "[]", swipeId: 0, createdAt: new Date().toISOString(),
                }]);
              }
            } else {
              // GROUP_END: text before it belongs to current character
              const before = buffer.slice(0, endIdx);
              if (before && currentCharId) {
                const prev = charTexts.get(currentCharId) || "";
                charTexts.set(currentCharId, prev + before);
                flushCharText(currentCharId);
              }
              // Strip [GROUP_END] marker (12 chars) and surrounding newlines
              buffer = buffer.slice(endIdx + 12);
              if (buffer.startsWith("\n")) buffer = buffer.slice(1);
              buffer = "";
              currentCharId = "";
              currentCharName = "";
              break;
            }
          }

          // Remaining buffer content belongs to current character
          if (buffer && currentCharId) {
            const prev = charTexts.get(currentCharId) || "";
            charTexts.set(currentCharId, prev + buffer);
            flushCharText(currentCharId);
            buffer = "";
          }
        } else {
          // Single chat streaming
          if (!assistantAdded) {
            assistantAdded = true;
            singleAssistantId = (Date.now() + 1).toString();
            setThinking(false);
            setMessages((prevMsgs) => [...prevMsgs, { id: singleAssistantId, role: "assistant", content: buffer, swipes: "[]", swipeId: 0, createdAt: new Date().toISOString() }]);
          } else {
            setMessages((prevMsgs) => prevMsgs.map((m) => m.id === singleAssistantId ? { ...m, content: buffer } : m));
          }
        }
      }
    } catch {
      setError(t("common.networkError"));
      const orphanIds = new Set(charMsgIds.values());
      if (singleAssistantId) orphanIds.add(singleAssistantId);
      setMessages((prev) => prev.filter((m) => m.id !== userMsgId && !orphanIds.has(m.id)));
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

  async function handleDeleteConversation() {
    if (!activeConversationId) return;
    setClearLoading(true);
    setError("");
    try {
      const res = await fetch("/api/conversations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeConversationId }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || t("chat.clearFailed")); return; }
      setMessages([]);
      setActiveConversationId("");
      setParticipants([]);
      setSelectedChar(null);
      setConversations((prev) => prev.filter((c) => c.id !== activeConversationId));
      setAllConversations((prev) => prev.filter((c) => c.id !== activeConversationId));
      setShowMoreMenu(false);
      loadAllConversations();
    } catch { setError(t("common.networkError")); }
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
      setCharForm({ id: "", name: "", description: "", personality: "", scenario: "", first_mes: "", mes_example: "", system_prompt: "", post_history_instructions: "", alternate_greetings: "", creator: "", character_version: "", creator_notes: "", tags: "", avatar: "" });
    } catch { setCharError(t("common.networkError")); }
    finally { setCharCreating(false); }
  }

  async function startEditChar(char: Character) {
    setEditingCharId(char.id);
    try {
      const res = await fetch(`/api/characters?id=${char.id}`);
      if (res.ok) {
        const full = await res.json();
        setCharForm({ id: full.id || char.id, name: full.name || char.name, description: full.description || char.description || "", personality: full.personality || "", scenario: full.scenario || "", first_mes: full.first_mes || full.firstMessage || "", mes_example: full.mes_example || "", system_prompt: full.system_prompt || "", post_history_instructions: full.post_history_instructions || "", alternate_greetings: Array.isArray(full.alternate_greetings) ? full.alternate_greetings.join("\n") : "", creator: full.creator || "", character_version: full.character_version || "", creator_notes: full.creator_notes || "", tags: Array.isArray(full.tags) ? full.tags.join(", ") : "", avatar: full.avatar || "" });
      } else {
        setCharForm({ id: char.id, name: char.name, description: char.description || "", personality: "", scenario: "", first_mes: char.firstMessage || "", mes_example: "", system_prompt: "", post_history_instructions: "", alternate_greetings: "", creator: "", character_version: "", creator_notes: "", tags: "", avatar: char.avatar || "" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.networkError");
      setCharError(message);
      setCharForm({ id: char.id, name: char.name, description: char.description || "", personality: "", scenario: "", first_mes: char.firstMessage || "", mes_example: "", system_prompt: "", post_history_instructions: "", alternate_greetings: "", creator: "", character_version: "", creator_notes: "", tags: "" });
    }
    setShowCreateChar(true);
    setShowMoreMenu(false);
  }

  async function handleExportChar(char: Character) {
    try {
      const res = await fetch(`/api/characters?id=${char.id}&format=png`);
      if (!res.ok) { setError(t("char.exportFailed")); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${char.id}.png`; a.click();
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
      fetch(`/api/conversations?characterId=${selectedChar.id}`)
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setConversations(d); })
        .catch(() => {});
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
      if (file.name.endsWith(".png") || file.type === "image/png") {
        // PNG character card import
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/characters/import-card", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) { setError(data.error || t("chat.importFailed")); return; }
        const refresh = await fetch("/api/characters");
        if (refresh.ok) { const list = await refresh.json(); if (Array.isArray(list)) setCharacters(list); }
        setError("");
      } else {
        const text = await file.text();
        const json = JSON.parse(text);
        if (!json.id || !json.name) { setError(t("char.idRequired")); return; }
        const res = await fetch("/api/characters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) });
        const data = await res.json();
        if (!res.ok) { setError(data.error || t("chat.importFailed")); return; }
        const refresh = await fetch("/api/characters");
        if (refresh.ok) { const list = await refresh.json(); if (Array.isArray(list)) setCharacters(list); }
        setError("");
      }
    } catch { setError(t("chat.importFailed")); }
    e.target.value = "";
  }

  async function handleCopy(text: string, id: string) {
    try { await navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); }
    catch { /* clipboard not available */ }
  }

  async function handleRegenerate() {
    if (!selectedChar || loading) return;
    const msgs = [...messages];
    let lastAssistantIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "assistant") { lastAssistantIdx = i; break; }
    }
    if (lastAssistantIdx === -1) return;

    const lastMsg = msgs[lastAssistantIdx];
    const regenCharId = lastMsg.characterId || selectedChar.id;

    setLoading(true);
    setThinking(true);
    setError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: regenCharId, conversationId: activeConversationId, regenerate: true, stream: true, temperature: settings.temperature, maxTokens: settings.maxTokens, persona: settings.persona || undefined }),
      });
      if (res.status === 401) { setUnauthorized(true); return; }
      if (!res.ok) { const d = await res.json(); setError(d.error || t("chat.sendFailed")); setLoading(false); setThinking(false); return; }
      const reader = res.body?.getReader();
      if (!reader) { setError(t("chat.streamNotSupported")); setLoading(false); setThinking(false); return; }

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
    } catch { setError(t("common.networkError")); }
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

  // Character name lookup for conversation display
  const charNameMap = new Map(characters.map((c) => [c.id, c.name]));

  function conversationDisplayName(conv: ConversationSummary): string {
    if (conv.type === "group") {
      try {
        const ids: string[] = JSON.parse(conv.characterIds || "[]");
        const names = ids.map((id) => charNameMap.get(id) || id);
        return names.join(", ");
      } catch { return conv.title; }
    }
    // Single chat: show the character's name
    try {
      const ids: string[] = JSON.parse(conv.characterIds || "[]");
      if (ids.length === 1) return charNameMap.get(ids[0]) || conv.title;
    } catch { /* fall through */ }
    return charNameMap.get(conv.characterId || "") || conv.title;
  }

  async function handleDeleteFromList(convId: string) {
    try {
      const res = await fetch("/api/conversations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: convId }),
      });
      if (res.ok) {
        setAllConversations((prev) => prev.filter((c) => c.id !== convId));
      }
    } catch { /* ignore */ }
  }

  // ===== New Chat Character Selector =====
  if (showNewChatSelector) {
    return (
      <div className="wechat-shell">
        <div className="wechat-nav">
          <button className="nav-icon-btn" onClick={() => { setShowNewChatSelector(false); setNewChatSelection([]); }} aria-label="Back">
            ←
          </button>
          <span className="wechat-nav-title">
            {newChatSelection.length >= 2
              ? t("group.selectedCount").replace("{n}", String(newChatSelection.length))
              : t("group.selectCharacters")}
          </span>
        </div>
        <div className="wechat-chat-list">
          {characters.map((c) => (
            <div
              key={c.id}
              className={`chat-list-item ${newChatSelection.some((gc) => gc.id === c.id) ? "group-selected" : ""}`}
              onClick={() => toggleNewChatSelect(c)}
            >
              <div className="chat-list-avatar" style={{ background: "var(--primary)" }}>
                {newChatSelection.some((gc) => gc.id === c.id) ? "✓" : c.avatar ? <img src={c.avatar} alt={c.name} style={{ width: "100%", height: "100%", borderRadius: "6px", objectFit: "cover" }} /> : avatarLetter(c.name)}
              </div>
              <div className="chat-list-info">
                <div className="chat-list-name">{c.name}</div>
                <div className="chat-list-preview">{c.description || t("chat.emptyHint")}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="wechat-list-footer">
          <button className="wechat-footer-btn" onClick={() => { setShowNewChatSelector(false); setNewChatSelection([]); }}>{t("common.cancel")}</button>
          {newChatSelection.length >= 1 && (
            <button className="wechat-footer-btn group-start-btn" onClick={async () => {
              if (newChatSelection.length >= 2) {
                await handleStartGroupChat();
              } else if (newChatSelection.length === 1) {
                const c = newChatSelection[0];
                try {
                  const res = await fetch("/api/conversations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ characterIds: [c.id], title: c.name }),
                  });
                  const data = await res.json();
                  if (!res.ok) { setError(data.error || t("chat.createChatFailed")); return; }
                  setSelectedChar(c);
                  setParticipants([c]);
                  setConversations((prev) => [data, ...prev]);
                  setAllConversations((prev) => [data, ...prev]);
                  setActiveConversationId(data.id);
                  setMessages([]);
                  setNewChatSelection([]);
                  setShowNewChatSelector(false);
                  setDrawerOpen(false);
                } catch { setError(t("common.networkError")); }
              }
            }}>
              {newChatSelection.length >= 2
                ? `${t("group.start")} (${newChatSelection.length})`
                : t("chat.newChat")}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ===== Conversation List View (WeChat "Chats" page) =====
  if (!activeConversationId) {
    const charConvs = allConversations;
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
          {charConvs.length === 0 && (
            <div className="wx-empty-chat">
              <div className="wx-empty-icon">💬</div>
              <div className="wx-empty-title">{t("chat.emptyConversation")}</div>
            </div>
          )}
          {charConvs.map((conv) => (
            <div
              key={conv.id}
              className="chat-list-item"
              onClick={async () => {
                setActiveConversationId(conv.id);
                // Load participants
                try {
                  const ids: string[] = JSON.parse(conv.characterIds || "[]");
                  const charIds = ids.length > 0 ? ids : (conv.characterId ? [conv.characterId] : []);
                  if (charIds.length > 0) {
                    const chars = await Promise.all(
                      charIds.map(async (id) => {
                        const res = await fetch(`/api/characters?id=${id}`);
                        return res.ok ? res.json() : null;
                      })
                    );
                    const valid = chars.filter(Boolean) as Character[];
                    setParticipants(valid);
                    if (valid.length > 0) setSelectedChar(valid[0]);
                  }
                } catch { /* ignore */ }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (confirm(t("chat.clearChat") + "?")) handleDeleteFromList(conv.id);
              }}
            >
              <div className="chat-list-avatar" style={{ background: conv.type === "group" ? "var(--warning)" : "var(--primary)" }}>
                {conv.type === "group" ? "👥" : avatarLetter(conversationDisplayName(conv))}
              </div>
              <div className="chat-list-info">
                <div className="chat-list-top">
                  <span className="chat-list-name">{conversationDisplayName(conv)}</span>
                </div>
                <div className="chat-list-preview">
                  {conv.type === "group" && <span className="group-badge">👥 </span>}
                  {conv._count?.messages != null ? `${conv._count.messages} ${t("chat.messages")}` : conv.title}
                </div>
              </div>
              <div className="chat-list-meta">
                <span className="chat-list-time">{formatRelativeTime(conv.createdAt, locale)}</span>
                <button
                  className="chat-list-del"
                  onClick={(e) => { e.stopPropagation(); handleDeleteFromList(conv.id); }}
                  title={t("common.delete")}
                >✕</button>
              </div>
            </div>
          ))}
        </div>
        <div className="wechat-list-footer">
          <button className="wechat-footer-btn" onClick={() => { setNewChatSelection([]); setShowNewChatSelector(true); }}>
            + {t("chat.newChat")}
          </button>
          <button className="wechat-footer-btn" onClick={() => { setShowSettings(true); }}>
            &#9881; {t("settings.title")}
          </button>
        </div>
        {role === "admin" && (
          <div className="wechat-list-footer">
            <button className="wechat-footer-btn" onClick={() => setShowCreateChar(true)}>+ {t("char.create")}</button>
            <label className="wechat-footer-btn import-label">
              {t("common.import")}
              <input type="file" accept=".json,.png" className="import-input" onChange={handleImportChar} />
            </label>
            <button className="wechat-footer-btn" onClick={() => setShowWorldInfo(true)}>{t("world.manage")}</button>
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
          <SettingsModal
            settings={settings}
            onSettingsChange={(s) => { setSettings(s); saveSettings(s); }}
            locale={locale}
            onLocaleChange={setLocale}
            onClose={() => setShowSettings(false)}
            t={tf}
          />
        )}
        {showCreateChar && (
          <CharacterFormModal
            editingCharId={editingCharId}
            charForm={charForm}
            onCharFormChange={setCharForm}
            onSubmit={handleCreateChar}
            onClose={() => { setShowCreateChar(false); setEditingCharId(null); }}
            charError={charError}
            charCreating={charCreating}
            t={tf}
          />
        )}
        {showAdmin && (
          <AdminModal
            adminUsers={adminUsers}
            adminLoading={adminLoading}
            adminError={adminError}
            deleteConfirm={deleteConfirm}
            onDeleteUser={handleDeleteUser}
            onSetDeleteConfirm={setDeleteConfirm}
            onClose={() => setShowAdmin(false)}
            t={tf}
          />
        )}
        {showWorldInfo && (
          <WorldInfoModal
            onClose={() => setShowWorldInfo(false)}
            t={tf}
          />
        )}
      </div>
    );
  }

  // ===== Chat View (WeChat chat page) =====
  if (!selectedChar) {
    return (
      <div className="wechat-shell">
        <div className="wechat-nav">
          <button className="nav-icon-btn" onClick={handleBack} aria-label="Back">←</button>
          <span className="wechat-nav-title">{t("chat.emptyTitle")}</span>
        </div>
        <div className="wx-empty-chat">
          <div className="wx-empty-icon">💬</div>
          <div className="wx-empty-title">{t("chat.emptyHint")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="wechat-shell">
      {/* Top nav bar */}
      <div className="wechat-nav">
        <button className="nav-icon-btn" onClick={handleBack} aria-label="Back">
          ←
        </button>
        <span className="wechat-nav-title">
          {isGroupChat
            ? `Group: ${participants.map((c) => c.name).join(", ")}`
            : selectedChar.name}
        </span>
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
              {role === "admin" && <button onClick={() => { setShowWorldInfo(true); setShowMoreMenu(false); }}>{t("world.manage")}</button>}
              {role === "admin" && <button onClick={() => { startEditChar(selectedChar); }}>{t("char.edit")}</button>}
              <button onClick={() => { setShowPromptDebug(true); setShowMoreMenu(false); }}>{t("promptDebug.show")}</button>
              <button onClick={handleDeleteConversation} disabled={clearLoading || !activeConversationId}>
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

      {/* Offline banner */}
      {!isOnline && (
        <div className="offline-banner">You are offline — messages will send when back online</div>
      )}

      {/* Install banner */}
      {showInstallBanner && (
        <div className="pwa-install-banner">
          <span className="pwa-install-text">Add to Home Screen for quick access</span>
          <div className="pwa-install-actions">
            <button className="pwa-install-btn" onClick={handleInstall}>Install</button>
            <button className="pwa-install-dismiss" onClick={() => setShowInstallBanner(false)}>✕</button>
          </div>
        </div>
      )}

      {/* iOS install hint */}
      {showIOSHint && (
        <div className="pwa-install-banner">
          <span className="pwa-install-text">Tap Share &rarr; &ldquo;Add to Home Screen&rdquo; to install</span>
          <div className="pwa-install-actions">
            <button className="pwa-install-dismiss" onClick={dismissIOSHint}>✕</button>
          </div>
        </div>
      )}

      {/* Message area */}
      <div className="wechat-messages">
        {error && <div className="wechat-error-banner">{error}</div>}
        {messages.length === 0 && !thinking && (
          <div className="wx-empty-chat">
            <div className="wx-empty-icon">💬</div>
            <div className="wx-empty-title">
              {isGroupChat ? t("group.selectCharacters") : t("chat.emptyMessages")}
            </div>
          </div>
        )}
        {messages
          .filter((m) => !searchQuery || m.content.toLowerCase().includes(searchQuery.toLowerCase()))
          .map((m, i, arr) => (
          <div key={m.id}>
            {(i === 0 || shouldShowTimeDivider(arr[i - 1].createdAt, m.createdAt)) && (
              <div className="wx-time-divider">
                <span>{formatMessageTime(m.createdAt, locale)}</span>
              </div>
            )}
            <div className={`wx-msg ${m.role === "user" ? "wx-msg-self" : ""}`}>
            {m.role === "assistant" && (
              (() => {
                const charAvatar = m.characterName
                  ? (characters.find((c) => c.name === m.characterName) || selectedChar)?.avatar
                  : selectedChar.avatar;
                if (charAvatar) {
                  return <img src={charAvatar} alt="" className="wx-avatar" style={{ objectFit: "cover" }} />;
                }
                return (
                  <div className="wx-avatar" style={{ background: "var(--primary)" }}>
                    {m.characterName ? avatarLetter(m.characterName) : avatarLetter(selectedChar.name)}
                  </div>
                );
              })()
            )}
            <div className="wx-bubble-wrapper">
              {isGroupChat && m.role === "assistant" && m.characterName && (
                <div className="wx-sender-name">{m.characterName}</div>
              )}
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
          </div>
          </div>
        ))}
        {thinking && (
          <div className="wx-msg">
            {selectedChar.avatar ? (
              <img src={selectedChar.avatar} alt="" className="wx-avatar" style={{ objectFit: "cover" }} />
            ) : (
              <div className="wx-avatar" style={{ background: "var(--primary)" }}>
                {avatarLetter(selectedChar.name)}
              </div>
            )}
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
                      {c.avatar ? <img src={c.avatar} alt={c.name} className="drawer-char-avatar" style={{ objectFit: "cover" }} /> : avatarLetter(c.name)}
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
                          onClick={() => renamingConvId !== conv.id && handleSelectConversation(conv)}
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
                            <span onDoubleClick={() => startRename(conv)} title="Double-click to rename">
                              {conv.type === "group" && <span className="group-badge">👥 </span>}
                              {conv.title}
                            </span>
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
                  <input type="file" accept=".json,.png" className="import-input" onChange={handleImportChar} />
                </label>
                <button className="wechat-footer-btn" onClick={openAdmin}>{t("admin.users")}</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modals */}
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
        <SettingsModal
          settings={settings}
          onSettingsChange={(s) => { setSettings(s); saveSettings(s); }}
          locale={locale}
          onLocaleChange={setLocale}
          onClose={() => setShowSettings(false)}
          t={tf}
        />
      )}

      {showCreateChar && (
        <CharacterFormModal
          editingCharId={editingCharId}
          charForm={charForm}
          onCharFormChange={setCharForm}
          onSubmit={handleCreateChar}
          onClose={() => { setShowCreateChar(false); setEditingCharId(null); }}
          charError={charError}
          charCreating={charCreating}
          t={tf}
        />
      )}

      {showAdmin && (
        <AdminModal
          adminUsers={adminUsers}
          adminLoading={adminLoading}
          adminError={adminError}
          deleteConfirm={deleteConfirm}
          onDeleteUser={handleDeleteUser}
          onSetDeleteConfirm={setDeleteConfirm}
          onClose={() => setShowAdmin(false)}
          t={tf}
        />
      )}

      {showWorldInfo && (
        <WorldInfoModal
          onClose={() => setShowWorldInfo(false)}
          t={tf}
        />
      )}

      {showPromptDebug && (
        <PromptDebugModal
          characterId={selectedChar.id}
          conversationId={activeConversationId}
          persona={settings.persona}
          onClose={() => setShowPromptDebug(false)}
          t={tf}
        />
      )}
    </div>
  );
}
