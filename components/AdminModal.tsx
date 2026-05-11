"use client";

import { useTranslation } from "@/lib/i18n";

interface AdminUser {
  id: string;
  username: string;
  role: string;
  createdAt: string;
}

interface AdminModalProps {
  users: AdminUser[];
  loading: boolean;
  error: string;
  deleteConfirm: string | null;
  onDeleteConfirm: (userId: string | null) => void;
  onDeleteUser: (userId: string) => void;
  onClose: () => void;
}

export default function AdminModal({
  users,
  loading,
  error,
  deleteConfirm,
  onDeleteConfirm,
  onDeleteUser,
  onClose,
}: AdminModalProps) {
  const { t } = useTranslation();

  return (
    <div className="wechat-overlay" onClick={onClose}>
      <div className="wechat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wechat-modal-header">
          <span>{t("admin.title")}</span>
          <button className="wechat-modal-close" onClick={onClose}>×</button>
        </div>
        {error && <div className="wechat-error">{error}</div>}
        {loading ? <p className="wechat-loading">{t("common.loading")}</p> : (
          <div className="wechat-user-list">
            {users.map((u) => (
              <div key={u.id} className="wechat-user-row">
                <div>
                  <div className="user-name">{u.username}</div>
                  <div className="user-meta">{u.role} · {new Date(u.createdAt).toLocaleDateString()}</div>
                </div>
                <div>
                  {deleteConfirm === u.id ? (
                    <span className="confirm-group">
                      <button className="mini-btn danger" onClick={() => onDeleteUser(u.id)}>{t("common.confirm")}</button>
                      <button className="mini-btn" onClick={() => onDeleteConfirm(null)}>{t("common.cancel")}</button>
                    </span>
                  ) : (
                    <button className="mini-btn danger-outline" onClick={() => onDeleteConfirm(u.id)} disabled={u.id === "demo"}>{t("common.delete")}</button>
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
