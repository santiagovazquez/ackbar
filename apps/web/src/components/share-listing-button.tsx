"use client";

import { useState } from "react";
import { faShareNodes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAuth } from "./auth-provider";

type ShareListingButtonProps = {
  listingId: string;
  title: string;
  itemNames: string[];
  variant?: "menu" | "round";
};

export function ShareListingButton({
  listingId,
  title,
  itemNames,
  variant = "menu",
}: ShareListingButtonProps) {
  const [message, setMessage] = useState("");

  async function share() {
    const url = `${window.location.origin}/publi/${listingId}`;
    const text = `Mirá esta publicación en Ackb.ar: ${itemNames.join(", ")}`;
    const shareData = {
      title: `${title} · Ackbar`,
      text,
      url,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setMessage("Enlace copiado");
        window.setTimeout(() => setMessage(""), 2500);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("No se pudo compartir");
      window.setTimeout(() => setMessage(""), 2500);
    }
  }

  return (
    <>
      <button
        type="button"
        className={variant === "round" ? "publication-share-button" : "share-menu-button"}
        aria-label={variant === "round" ? "Compartir publicación" : undefined}
        title={variant === "round" ? "Compartir publicación" : undefined}
        onClick={() => void share()}
      >
        <FontAwesomeIcon icon={faShareNodes} aria-hidden="true" />
        {variant === "menu" && <span>Compartir</span>}
      </button>
      {message && (
        <span className="share-feedback" role="status">
          {message}
        </span>
      )}
    </>
  );
}

export function OwnerShareListingButton({
  ownerId,
  listingId,
  title,
  itemNames,
}: Omit<ShareListingButtonProps, "variant"> & { ownerId: string }) {
  const { user } = useAuth();
  if (user?.id !== ownerId) return null;

  return (
    <ShareListingButton listingId={listingId} title={title} itemNames={itemNames} variant="round" />
  );
}
