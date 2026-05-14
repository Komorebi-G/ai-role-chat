"use client";

import { useState } from "react";
import type { WorldBook, WorldEntry } from "./types";

interface Props {
  onClose: () => void;
  t: (key: string) => string;
}

export default function WorldInfoModal({ onClose, t }: Props) {
  const [worldBooks, setWorldBooks] = useState<WorldBook[]>([]);
  const [editingWorldBookId, setEditingWorldBookId] = useState<string | null>(null);
  const [worldForm, setWorldForm] = useState({ id: "", name: "", description: "" });
  const [worldEntryForm, setWorldEntryForm] = useState({ id: "", keys: "", content: "", position: "afterCharacter" as "beforeCharacter" | "afterCharacter", order: 0, enabled: true });
  const [worldEntryEditIdx, setWorldEntryEditIdx] = useState(-2);
  const [worldEntries, setWorldEntries] = useState<WorldEntry[]>([]);
  const [worldSaving, setWorldSaving] = useState(false);
  const [worldError, setWorldError] = useState("");
  const [worldDeleteConfirm, setWorldDeleteConfirm] = useState<string | null>(null);

  async function loadWorldBooks() {
    try {
      const res = await fetch("/api/worlds");
      if (!res.ok) throw new Error("Failed");
      setWorldBooks(await res.json());
    } catch {
      setWorldError(t("world.loadFailed"));
    }
  }

  // Initial load
  if (worldBooks.length === 0 && !editingWorldBookId) {
    loadWorldBooks();
  }

  function startCreateWorldBook() {
    setWorldForm({ id: "", name: "", description: "" });
    setWorldEntries([]);
    setEditingWorldBookId("__new__");
    setWorldEntryEditIdx(-2);
    setWorldError("");
  }

  function startEditWorldBook(book: WorldBook) {
    setWorldForm({ id: book.id, name: book.name, description: book.description || "" });
    setWorldEntries(book.entries.map((e) => ({ ...e })));
    setEditingWorldBookId(book.id);
    setWorldEntryEditIdx(-2);
    setWorldError("");
  }

  function backToWorldList() {
    setEditingWorldBookId(null);
    setWorldEntryEditIdx(-2);
    setWorldDeleteConfirm(null);
    setWorldError("");
  }

  async function handleSaveWorldBook() {
    if (!worldForm.id || !worldForm.name) return;
    setWorldSaving(true);
    setWorldError("");
    try {
      const method = editingWorldBookId === "__new__" ? "POST" : "PUT";
      const url = method === "PUT" ? `/api/worlds?id=${worldForm.id}` : "/api/worlds";
      const body = {
        id: worldForm.id,
        name: worldForm.name,
        description: worldForm.description,
        entries: worldEntries,
      };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Save failed");
      }
      await loadWorldBooks();
      setEditingWorldBookId(null);
    } catch (e) {
      setWorldError(e instanceof Error ? e.message : t("world.saveFailed"));
    } finally {
      setWorldSaving(false);
    }
  }

  async function handleDeleteWorldBook(id: string) {
    try {
      const res = await fetch(`/api/worlds?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      await loadWorldBooks();
      setWorldDeleteConfirm(null);
    } catch {
      setWorldError(t("world.deleteFailed"));
    }
  }

  function startEditWorldEntry(idx: number) {
    if (idx < 0) {
      setWorldEntryForm({ id: "", keys: "", content: "", position: "afterCharacter", order: worldEntries.length, enabled: true });
      setWorldEntryEditIdx(-1);
    } else {
      const e = worldEntries[idx];
      setWorldEntryForm({ id: e.id, keys: e.keys.join(", "), content: e.content, position: e.position, order: e.order, enabled: e.enabled });
      setWorldEntryEditIdx(idx);
    }
  }

  function handleSaveWorldEntry() {
    const entry: WorldEntry = {
      id: worldEntryForm.id || `entry_${Date.now()}`,
      keys: worldEntryForm.keys.split(",").map((k) => k.trim()).filter(Boolean),
      content: worldEntryForm.content,
      position: worldEntryForm.position,
      order: worldEntryForm.order,
      enabled: worldEntryForm.enabled,
    };
    if (worldEntryEditIdx >= 0) {
      setWorldEntries((prev) => prev.map((e, i) => (i === worldEntryEditIdx ? entry : e)));
    } else {
      setWorldEntries((prev) => [...prev, entry]);
    }
    setWorldEntryEditIdx(-2);
  }

  function handleDeleteWorldEntry(idx: number) {
    setWorldEntries((prev) => prev.filter((_, i) => i !== idx));
  }

  // Book list view
  if (!editingWorldBookId) {
    return (
      <div className="wechat-overlay" onClick={() => { onClose(); setWorldDeleteConfirm(null); }}>
        <div className="wechat-modal" onClick={(e) => e.stopPropagation()}>
          <div className="wechat-modal-header">
            <span>{t("world.title")}</span>
            <button className="wechat-modal-close" onClick={() => { onClose(); setWorldDeleteConfirm(null); }}>×</button>
          </div>
          {worldError && <div className="wechat-error">{worldError}</div>}
          <div className="wechat-modal-body">
            {worldBooks.length === 0 ? (
              <p className="wechat-loading">{t("world.noBooks")}</p>
            ) : (
              <div className="wechat-user-list">
                {worldBooks.map((book) => (
                  <div key={book.id} className="wechat-user-row">
                    <div>
                      <div className="user-name">{book.name}</div>
                      <div className="user-meta">{book.id} · {book.entries.length} {t("world.entries")}</div>
                    </div>
                    <div>
                      {worldDeleteConfirm === book.id ? (
                        <span className="confirm-group">
                          <button className="mini-btn danger" onClick={() => handleDeleteWorldBook(book.id)}>{t("common.confirm")}</button>
                          <button className="mini-btn" onClick={() => setWorldDeleteConfirm(null)}>{t("common.cancel")}</button>
                        </span>
                      ) : (
                        <>
                          <button className="mini-btn" onClick={() => startEditWorldBook(book)}>{t("common.edit")}</button>
                          <button className="mini-btn danger-outline" onClick={() => setWorldDeleteConfirm(book.id)}>{t("common.delete")}</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <button className="wechat-btn wechat-btn-primary" onClick={startCreateWorldBook}>+ {t("world.create")}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Edit/create view
  return (
    <div className="wechat-overlay" onClick={() => { setEditingWorldBookId(null); setWorldEntryEditIdx(-2); }}>
      <div className="wechat-modal wide-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wechat-modal-header">
          <span>{editingWorldBookId === "__new__" ? t("world.create") : t("world.edit")}</span>
          <button className="wechat-modal-close" onClick={() => { setEditingWorldBookId(null); setWorldEntryEditIdx(-2); }}>×</button>
        </div>
        {worldError && <div className="wechat-error">{worldError}</div>}
        <div className="wechat-modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
          <button className="nav-icon-btn" onClick={backToWorldList} style={{ marginBottom: 8 }}>← {t("common.back")}</button>
          <div className="settings-field">
            <label>{t("world.name")} *</label>
            <input className="wechat-input" value={worldForm.name}
              onChange={(e) => setWorldForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="My World" />
          </div>
          <div className="settings-field">
            <label>ID *</label>
            <input className="wechat-input" value={worldForm.id}
              onChange={(e) => setWorldForm((f) => ({ ...f, id: e.target.value }))}
              placeholder="my-world" disabled={editingWorldBookId !== "__new__"} />
          </div>
          <div className="settings-field">
            <label>{t("world.description")}</label>
            <textarea className="wechat-textarea" rows={2} value={worldForm.description}
              onChange={(e) => setWorldForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Brief description of this world..." />
          </div>

          {/* Entries */}
          <div className="settings-field">
            <label style={{ fontWeight: 600 }}>{t("world.entries")} ({worldEntries.length})</label>
            {worldEntries.length === 0 && <p className="wechat-loading" style={{ fontSize: 12 }}>{t("world.noEntries")}</p>}
            {worldEntries.map((entry, idx) => (
              <div key={entry.id || idx} className="wechat-user-row" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="user-name" style={{ fontSize: 13 }}>{entry.keys.join(", ") || "(no keys)"}</div>
                  <div className="user-meta" style={{ fontSize: 11 }}>
                    {entry.position === "beforeCharacter" ? "↑" : "↓"} · {entry.enabled ? "✓" : "✗"} · {entry.content.slice(0, 40)}{entry.content.length > 40 ? "..." : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button className="mini-btn" onClick={() => startEditWorldEntry(idx)}>{t("common.edit")}</button>
                  <button className="mini-btn danger-outline" onClick={() => handleDeleteWorldEntry(idx)}>{t("common.delete")}</button>
                </div>
              </div>
            ))}
            {worldEntryEditIdx < 0 && (
              <button className="wechat-btn" onClick={() => startEditWorldEntry(-1)} style={{ marginTop: 6 }}>+ {t("world.addEntry")}</button>
            )}
          </div>

          {/* Entry editor */}
          {worldEntryEditIdx >= -1 && (
            <div style={{ border: "1px solid var(--primary)", borderRadius: 8, padding: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
                {worldEntryEditIdx >= 0 ? t("world.editEntry") : t("world.addEntry")}
              </div>
              <div className="settings-field">
                <label>{t("world.entryKey")} *</label>
                <input className="wechat-input" value={worldEntryForm.keys}
                  onChange={(e) => setWorldEntryForm((f) => ({ ...f, keys: e.target.value }))}
                  placeholder="apple, fruit, food" />
              </div>
              <div className="settings-field">
                <label>{t("world.entryContent")} *</label>
                <textarea className="wechat-textarea" rows={3} value={worldEntryForm.content}
                  onChange={(e) => setWorldEntryForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder="Entry content to inject..." />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div className="settings-field" style={{ flex: 1, minWidth: 120 }}>
                  <label>{t("world.entryPosition")}</label>
                  <select className="wechat-input" value={worldEntryForm.position}
                    onChange={(e) => setWorldEntryForm((f) => ({ ...f, position: e.target.value as "beforeCharacter" | "afterCharacter" }))}>
                    <option value="beforeCharacter">{t("world.entryPositionBefore")}</option>
                    <option value="afterCharacter">{t("world.entryPositionAfter")}</option>
                  </select>
                </div>
                <div className="settings-field" style={{ width: 70 }}>
                  <label>{t("world.entryOrder")}</label>
                  <input className="wechat-input" type="number" value={worldEntryForm.order}
                    onChange={(e) => setWorldEntryForm((f) => ({ ...f, order: parseInt(e.target.value) || 0 }))} />
                </div>
                <div className="settings-field" style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 18 }}>
                  <input type="checkbox" id="entryEnabled" checked={worldEntryForm.enabled}
                    onChange={(e) => setWorldEntryForm((f) => ({ ...f, enabled: e.target.checked }))} />
                  <label htmlFor="entryEnabled">{t("world.entryEnabled")}</label>
                </div>
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                <button className="wechat-btn wechat-btn-primary" onClick={handleSaveWorldEntry}>{t("common.save")}</button>
                <button className="wechat-btn" onClick={() => setWorldEntryEditIdx(-2)}>{t("common.cancel")}</button>
              </div>
            </div>
          )}

          <button className="wechat-btn wechat-btn-primary" onClick={handleSaveWorldBook} disabled={worldSaving}>
            {worldSaving ? t("common.loading") : editingWorldBookId === "__new__" ? t("common.create") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
