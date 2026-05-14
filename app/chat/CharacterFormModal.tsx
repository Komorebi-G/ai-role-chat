"use client";

import { useRef } from "react";

interface Props {
  editingCharId: string | null;
  charForm: Record<string, string>;
  onCharFormChange: (f: Record<string, string>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  charError: string;
  charCreating: boolean;
  t: (key: string) => string;
}

export default function CharacterFormModal({
  editingCharId, charForm, onCharFormChange, onSubmit, onClose, charError, charCreating, t,
}: Props) {
  const avatarInputRef = useRef<HTMLInputElement>(null);

  function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onCharFormChange({ ...charForm, avatar: reader.result as string });
    };
    reader.readAsDataURL(file);
  }

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
            <label>{t("char.avatar")}</label>
            {charForm.avatar ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <img src={charForm.avatar} alt="" style={{ width: "48px", height: "48px", borderRadius: "8px", objectFit: "cover" }} />
                <button type="button" className="wechat-btn" style={{ fontSize: "12px" }}
                  onClick={() => { onCharFormChange({ ...charForm, avatar: "" }); if (avatarInputRef.current) avatarInputRef.current.value = ""; }}>
                  {t("char.removeAvatar")}
                </button>
              </div>
            ) : null}
            <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarFile}
              style={{ fontSize: "13px" }} />
          </div>
          <div className="settings-field">
            <label>{t("char.id")} *</label>
            <input className="wechat-input" value={charForm.id}
              onChange={(e) => onCharFormChange({ ...charForm, id: e.target.value })}
              placeholder="alice" required disabled={!!editingCharId} />
          </div>
          <div className="settings-field">
            <label>{t("char.name")} *</label>
            <input className="wechat-input" value={charForm.name}
              onChange={(e) => onCharFormChange({ ...charForm, name: e.target.value })}
              placeholder="Alice" required />
          </div>
          <div className="settings-field">
            <label>{t("char.description")}</label>
            <textarea className="wechat-textarea" rows={2} value={charForm.description}
              onChange={(e) => onCharFormChange({ ...charForm, description: e.target.value })}
              placeholder="A brief description" />
          </div>
          <div className="settings-field">
            <label>{t("char.personality")}</label>
            <textarea className="wechat-textarea" rows={2} value={charForm.personality}
              onChange={(e) => onCharFormChange({ ...charForm, personality: e.target.value })}
              placeholder="Personality traits" />
          </div>
          <div className="settings-field">
            <label>{t("char.scenario")}</label>
            <textarea className="wechat-textarea" rows={2} value={charForm.scenario}
              onChange={(e) => onCharFormChange({ ...charForm, scenario: e.target.value })}
              placeholder="Conversation scenario" />
          </div>
          <div className="settings-field">
            <label>{t("char.firstMes")}</label>
            <textarea className="wechat-textarea" rows={2} value={charForm.first_mes}
              onChange={(e) => onCharFormChange({ ...charForm, first_mes: e.target.value })}
              placeholder="Opening message" />
          </div>
          <div className="settings-field">
            <label>{t("char.mesExample")}</label>
            <textarea className="wechat-textarea" rows={2} value={charForm.mes_example}
              onChange={(e) => onCharFormChange({ ...charForm, mes_example: e.target.value })}
              placeholder={"User: ...\nCharacter: ..."} />
          </div>
          <div className="settings-field">
            <label>{t("char.systemPrompt")}</label>
            <textarea className="wechat-textarea" rows={2} value={charForm.system_prompt}
              onChange={(e) => onCharFormChange({ ...charForm, system_prompt: e.target.value })}
              placeholder="Custom system instructions" />
          </div>
          <div className="settings-field">
            <label>{t("char.postHistory")}</label>
            <textarea className="wechat-textarea" rows={2} value={charForm.post_history_instructions}
              onChange={(e) => onCharFormChange({ ...charForm, post_history_instructions: e.target.value })}
              placeholder="Instructions injected after chat history" />
          </div>
          <div className="settings-field">
            <label>{t("char.altGreetings")}</label>
            <textarea className="wechat-textarea" rows={2} value={charForm.alternate_greetings}
              onChange={(e) => onCharFormChange({ ...charForm, alternate_greetings: e.target.value })}
              placeholder={"Alt greeting 1\nAlt greeting 2"} />
          </div>
          <div className="settings-field">
            <label>{t("char.creator")}</label>
            <input className="wechat-input" value={charForm.creator}
              onChange={(e) => onCharFormChange({ ...charForm, creator: e.target.value })}
              placeholder="Character creator name" />
          </div>
          <div className="settings-field">
            <label>{t("char.version")}</label>
            <input className="wechat-input" value={charForm.character_version}
              onChange={(e) => onCharFormChange({ ...charForm, character_version: e.target.value })}
              placeholder="1.0" />
          </div>
          <div className="settings-field">
            <label>{t("char.creatorNotes")}</label>
            <textarea className="wechat-textarea" rows={2} value={charForm.creator_notes}
              onChange={(e) => onCharFormChange({ ...charForm, creator_notes: e.target.value })}
              placeholder="Display-only notes for the creator" />
          </div>
          <div className="settings-field">
            <label>{t("char.tags")}</label>
            <input className="wechat-input" value={charForm.tags}
              onChange={(e) => onCharFormChange({ ...charForm, tags: e.target.value })}
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
