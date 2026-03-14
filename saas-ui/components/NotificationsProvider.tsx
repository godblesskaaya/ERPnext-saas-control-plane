"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { NotificationItem } from "../lib/types";

const STORAGE_KEY = "erp-saas:notifications:v1";

type NotificationContextValue = {
  notifications: NotificationItem[];
  unreadCount: number;
  addNotification: (item: Omit<NotificationItem, "id" | "created_at" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
};

type ToastItem = NotificationItem & { expiresAt: number };

const NotificationContext = createContext<NotificationContextValue | null>(null);

function loadNotifications(): NotificationItem[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as NotificationItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistNotifications(notifications: NotificationItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, 200)));
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    setNotifications(loadNotifications());
  }, []);

  useEffect(() => {
    persistNotifications(notifications);
  }, [notifications]);

  useEffect(() => {
    if (!toasts.length) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((toast) => toast.expiresAt > now));
    }, 500);
    return () => window.clearInterval(timer);
  }, [toasts.length]);

  const addNotification = useCallback(
    (item: Omit<NotificationItem, "id" | "created_at" | "read">) => {
      const payload: NotificationItem = {
        ...item,
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        created_at: new Date().toISOString(),
        read: false,
      };
      setNotifications((prev) => [payload, ...prev].slice(0, 200));
      setToasts((prev) => [...prev, { ...payload, expiresAt: Date.now() + 4000 }]);
    },
    []
  );

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = useMemo(() => notifications.filter((item) => !item.read).length, [notifications]);

  const value = useMemo(
    () => ({ notifications, unreadCount, addNotification, markRead, markAllRead, clearAll }),
    [notifications, unreadCount, addNotification, markRead, markAllRead, clearAll]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {toasts.length ? (
        <div className="fixed right-4 top-20 z-50 flex w-72 flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`rounded-xl border px-3 py-2 text-xs shadow-sm ${
                toast.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : toast.type === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : toast.type === "error"
                      ? "border-red-200 bg-red-50 text-red-800"
                      : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <p className="font-semibold">{toast.title}</p>
              <p className="mt-1">{toast.body}</p>
            </div>
          ))}
        </div>
      ) : null}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return ctx;
}
