"use client";

import { useState, useEffect } from "react";

interface DebugLayer {
  role: string;
  content: string;
  tokens: number;
}

interface SectionUsage {
  section: string;
  tokens: number;
  budget: number;
}

interface DebugData {
  layers: DebugLayer[];
  totalTokens: number;
  historyCount: number;
  worldEntryIds: string[];
  hasExampleDialogue: boolean;
  hasPostHistoryInstructions: boolean;
  sectionUsage?: SectionUsage[];
}

interface Props {
  characterId: string;
  conversationId: string;
  persona: string;
  onClose: () => void;
  t: (key: string) => string;
}

function roleBadge(role: string): { label: string; cls: string } {
  if (role === "system") return { label: "SYS", cls: "dbg-role-sys" };
  if (role === "user") return { label: "USR", cls: "dbg-role-usr" };
  return { label: "AST", cls: "dbg-role-ast" };
}

const SECTION_LABELS: Record<string, string> = {
  persona: "Persona",
  systemPrompt: "Sys.Prompt",
  characterInfo: "Char.Info",
  worldInfo: "World Info",
  exampleDialogue: "Examples",
  chatHistory: "History",
  postHistory: "Post-Hist",
};

export default function PromptDebugModal({ characterId, conversationId, persona, onClose, t }: Props) {
  const [data, setData] = useState<DebugData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0]));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/chat/prompt-debug", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId, conversationId: conversationId || undefined, persona: persona || undefined }),
        });
        if (!res.ok) {
          const d = await res.json();
          if (!cancelled) setError(d.error || "Failed to load");
        } else {
          const d = await res.json();
          if (!cancelled) setData(d);
        }
      } catch {
        if (!cancelled) setError(t("common.networkError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [characterId, conversationId, persona, t]);

  function toggleExpand(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  async function copyFullPrompt() {
    if (!data) return;
    const text = data.layers.map((l) => `[${l.role.toUpperCase()}] (${l.tokens} tokens)\n${l.content}`).join("\n\n---\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* no clipboard */ }
  }

  return (
    <div className="wechat-overlay" onClick={onClose}>
      <div className="wechat-modal prompt-debug-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wechat-modal-header">
          <span>{t("promptDebug.title")}</span>
          <button className="wechat-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="wechat-modal-body prompt-debug-body">
          {loading && <p className="wechat-loading">{t("common.loading")}</p>}
          {error && <p className="wechat-error">{error}</p>}

          {data && (
            <>
              {/* Summary bar */}
              <div className="prompt-debug-summary">
                <span><strong>{data.totalTokens}</strong> total tokens</span>
                <span><strong>{data.layers.length}</strong> messages</span>
                <span><strong>{data.historyCount}</strong> history</span>
                {data.worldEntryIds.length > 0 && (
                  <span title={data.worldEntryIds.join(", ")}>
                    <strong>{data.worldEntryIds.length}</strong> world entries
                  </span>
                )}
              </div>

              {/* Section-level token breakdown */}
              {data.sectionUsage && data.sectionUsage.length > 0 && (
                <div className="prompt-debug-sections">
                  {data.sectionUsage.map((s) => (
                    <div key={s.section} className="prompt-debug-section-row">
                      <span className="section-label">{SECTION_LABELS[s.section] || s.section}</span>
                      <div className="section-bar-track">
                        <div
                          className="section-bar-fill"
                          style={{
                            width: s.budget > 0 ? `${Math.min(100, (s.tokens / s.budget) * 100)}%` : `${Math.min(100, s.tokens / 40)}%`,
                            background: s.budget > 0 && s.tokens > s.budget ? "var(--danger)" : "var(--wechat-green)",
                          }}
                        />
                      </div>
                      <span className="section-tokens">{s.tokens}{s.budget > 0 ? ` / ${s.budget}` : ""} tk</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Layers */}
              <div className="prompt-debug-layers">
                {data.layers.map((layer, i) => {
                  const badge = roleBadge(layer.role);
                  const isExpanded = expanded.has(i);
                  const preview = layer.content.length > 100 && !isExpanded
                    ? layer.content.slice(0, 100) + "..."
                    : layer.content;

                  return (
                    <div key={i} className={`prompt-debug-layer ${isExpanded ? "expanded" : ""}`}>
                      <div className="prompt-debug-layer-header" onClick={() => toggleExpand(i)}>
                        <span className={`prompt-debug-role ${badge.cls}`}>{badge.label}</span>
                        <span className="prompt-debug-preview">{preview}</span>
                        <span className="prompt-debug-tokens">{layer.tokens} tk</span>
                        <span className="prompt-debug-expand">{isExpanded ? "▾" : "▸"}</span>
                      </div>
                      {isExpanded && (
                        <pre className="prompt-debug-content">{layer.content}</pre>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="prompt-debug-actions">
                <button className="wechat-btn" onClick={copyFullPrompt}>
                  {copied ? t("common.copied") : t("promptDebug.copyFull")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
