"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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

export function Notifications() {
  const router = useRouter();
  const menu = useRef<HTMLDetailsElement>(null);
  const wasOpened = useRef(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const load = useCallback(() => {
    void api<Notification[]>("/users/me/notifications", {
      cache: "no-store",
    }).then(setNotifications);
  }, []);
  useEffect(() => {
    load();
    const interval = window.setInterval(load, 30_000);
    return () => window.clearInterval(interval);
  }, [load]);
  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (menu.current?.open && !menu.current.contains(event.target as Node)) {
        menu.current.open = false;
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);
  const unread = notifications.filter((notification) => !notification.read_at).length;
  function handleToggle() {
    if (menu.current?.open) {
      wasOpened.current = true;
      return;
    }
    if (!wasOpened.current || unread === 0) return;
    wasOpened.current = false;
    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((notification) =>
        notification.read_at ? notification : { ...notification, read_at: readAt },
      ),
    );
    void api("/users/me/notifications/read", { method: "PATCH" }).catch(load);
  }
  async function open(notification: Notification) {
    if (!notification.read_at) {
      await api(`/users/me/notifications/${notification.id}/read`, {
        method: "PATCH",
      });
    }
    router.push(`/publi/${notification.listing_id}`);
  }
  return (
    <details className="notifications" ref={menu} onToggle={handleToggle}>
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
