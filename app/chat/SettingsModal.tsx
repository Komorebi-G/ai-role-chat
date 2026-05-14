"use client";

import type { ChatSettings } from "./types";
import type { Locale } from "@/lib/i18n";

interface Props {
  settings: ChatSettings;
  onSettingsChange: (s: ChatSettings) => void;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onClose: () => void;
  t: (key: string) => string;
}

export default function SettingsModal({ settings, onSettingsChange, locale, onLocaleChange, onClose, t }: Props) {
  return (
    <div className="wechat-overlay" onClick={onClose}>
      <div className="wechat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wechat-modal-header">
          <span>{t("settings.title")}</span>
          <button className="wechat-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="wechat-modal-body">
          <div className="settings-field">
            <label>{t("settings.temperature")}: <strong>{settings.temperature.toFixed(1)}</strong></label>
            <input type="range" min="0.1" max="2.0" step="0.1" value={settings.temperature}
              onChange={(e) => onSettingsChange({ ...settings, temperature: parseFloat(e.target.value) })} />
          </div>
          <div className="settings-field">
            <label>{t("settings.maxTokens")}: <strong>{settings.maxTokens}</strong></label>
            <input type="range" min="256" max="4096" step="128" value={settings.maxTokens}
              onChange={(e) => onSettingsChange({ ...settings, maxTokens: parseInt(e.target.value) })} />
          </div>
          <div className="settings-field">
            <label>{t("settings.persona")}</label>
            <textarea className="wechat-textarea" rows={3} value={settings.persona}
              placeholder={t("settings.personaHint")}
              onChange={(e) => onSettingsChange({ ...settings, persona: e.target.value })} />
          </div>
          <div className="settings-field">
            <label>{t("settings.language")}</label>
            <select className="wechat-input" value={locale} onChange={(e) => onLocaleChange(e.target.value as Locale)}>
              <option value="zh-CN">{t("lang.zhCN")}</option>
              <option value="en">{t("lang.en")}</option>
            </select>
          </div>
          <button className="wechat-btn" onClick={() => onSettingsChange({ temperature: 0.8, maxTokens: 1024, persona: "" })}>
            {t("settings.resetDefaults")}
          </button>
        </div>
      </div>
    </div>
  );
}
