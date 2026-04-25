"use client";

import { useState } from "react";

import { useNotifications } from "./NotificationsProvider";
import { formatTimestamp } from "../lib/formatters";

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        className="relative rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:border-amber-300"
        onClick={() => setOpen((prev) => !prev)}
      >
        Notifications
        {unreadCount ? (
          <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-amber-200 bg-white p-3 text-xs shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Notification center</p>
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-slate-700"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              className="rounded-full border border-amber-200 px-2 py-1 text-[11px] text-slate-700 hover:border-amber-300"
              onClick={() => markAllRead()}
            >
              Mark all read
            </button>
            <button
              className="rounded-full border border-amber-200 px-2 py-1 text-[11px] text-slate-700 hover:border-amber-300"
              onClick={() => clearAll()}
            >
              Clear
            </button>
          </div>

          {notifications.length ? (
            <div className="mt-3 max-h-64 space-y-2 overflow-auto">
              {notifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full rounded-xl border p-2 text-left ${
                    item.read ? "border-slate-200 bg-white" : "border-amber-200 bg-amber-50"
                  }`}
                  onClick={() => markRead(item.id)}
                >
                  <p className="text-[11px] text-slate-500">{formatTimestamp(item.created_at)}</p>
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-600">{item.body}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              No notifications yet.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
