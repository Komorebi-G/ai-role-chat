"use client";

import { type FormEvent } from "react";
import { useTranslation } from "@/lib/i18n";

interface CreateCharModalProps {
  editingCharId: string | null;
  charForm: Record<string, string>;
  setCharForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  charCreating: boolean;
  charError: string;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
}

export default function CreateCharModal({
  editingCharId,
  charForm,
  setCharForm,
  charCreating,
  charError,
  onClose,
  onSubmit,
}: CreateCharModalProps) {
  const { t } = useTranslation();

  return (
    <div className="wechat-overlay" onClick={onClose}>
      <div className="wechat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wechat-modal-header">
          <span>{editingCharId ? t("char.editTitle") : t("char.createTitle")}</span>
          <button className="wechat-modal-close" onClick={onClose}>×</button>
        </div>
        {charError && <div className="wechat-error">{charError}</div>}
        <form className="wechat-modal-body" onSubmit={onSubmit}>
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
  );
}
