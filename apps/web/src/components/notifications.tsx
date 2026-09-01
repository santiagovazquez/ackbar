"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell } from "@fortawesome/free-solid-svg-icons";
import { api } from "../lib/api";

interface Notification {
  id: string;
  listing_id: string;
  message: string;
  read_at: string | null;
  created_at: string;
}

export function Notifications({ token }: { token: string }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const load = useCallback(() => {
    void api<Notification[]>("/users/me/notifications", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }).then(setNotifications);
  }, [token]);
  useEffect(() => {
    load();
    const interval = window.setInterval(load, 30_000);
    return () => window.clearInterval(interval);
  }, [load]);
  const unread = notifications.filter((notification) => !notification.read_at).length;
  async function open(notification: Notification) {
    if (!notification.read_at) {
      await api(`/users/me/notifications/${notification.id}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    router.push(`/publi/${notification.listing_id}`);
  }
  return (
    <details className="notifications">
      <summary aria-label={`${unread} notificaciones sin leer`}>
        <FontAwesomeIcon icon={faBell} aria-hidden="true" />
        {unread > 0 && <strong>{unread}</strong>}
      </summary>
      <div className="notifications-popover">
        <h2>Notificaciones</h2>
        {notifications.length ? (
          notifications.map((notification) => (
            <button
              className={notification.read_at ? "" : "unread"}
              key={notification.id}
              onClick={() => void open(notification)}
              type="button"
            >
              <span>{notification.message}</span>
              <time dateTime={notification.created_at}>
                {new Date(notification.created_at).toLocaleDateString("es-AR")}
              </time>
            </button>
          ))
        ) : (
          <p>No tenés notificaciones.</p>
        )}
      </div>
    </details>
  );
}
