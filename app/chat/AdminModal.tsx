"use client";

import type { AdminUser } from "./types";

interface Props {
  adminUsers: AdminUser[];
  adminLoading: boolean;
  adminError: string;
  deleteConfirm: string | null;
  onDeleteUser: (userId: string) => void;
  onSetDeleteConfirm: (userId: string | null) => void;
  onClose: () => void;
  t: (key: string) => string;
}

export default function AdminModal({
  adminUsers, adminLoading, adminError, deleteConfirm,
  onDeleteUser, onSetDeleteConfirm, onClose, t,
}: Props) {
  return (
    <div className="wechat-overlay" onClick={() => { onClose(); onSetDeleteConfirm(null); }}>
      <div className="wechat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wechat-modal-header">
          <span>{t("admin.title")}</span>
          <button className="wechat-modal-close" onClick={() => { onClose(); onSetDeleteConfirm(null); }}>×</button>
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
                      <button className="mini-btn danger" onClick={() => onDeleteUser(u.id)}>{t("common.confirm")}</button>
                      <button className="mini-btn" onClick={() => onSetDeleteConfirm(null)}>{t("common.cancel")}</button>
                    </span>
                  ) : (
                    <button className="mini-btn danger-outline" onClick={() => onSetDeleteConfirm(u.id)} disabled={u.id === "demo"}>{t("common.delete")}</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
