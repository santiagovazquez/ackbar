"use client";
import { useState } from "react";
import type { CardInput, Currency, ListingKind, ListingType } from "@swu/shared";
import { createListing } from "../lib/api";
import { useAuth } from "./auth-provider";
import { CardAutocomplete } from "./card-autocomplete";
import { upload } from "@vercel/blob/client";

const emptyItem = (): CardInput => ({
  cardId: "",
  name: "",
  quantity: 1,
  unitPriceCents: null,
  playsetPriceCents: null,
});
export function ListingForm({ kind }: { kind: ListingKind }) {
  const { token } = useAuth();
  const [listingType, setListingType] = useState<ListingType>("singles");
  const [currency, setCurrency] = useState<Currency>("ARS");
  const [title, setTitle] = useState("");
  const [bulkPriceCents, setBulkPriceCents] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [items, setItems] = useState<CardInput[]>([emptyItem()]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const update = (index: number, patch: Partial<CardInput>) =>
    setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) {
      setError("Iniciá sesión con Google para publicar.");
      return;
    }
    if ((kind === "sale" || listingType === "bulk") && !imageUrl) {
      setError("Agregá una foto de las cartas para publicar la venta.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const listing = await createListing(
        {
          kind,
          listingType,
          currency,
          title: listingType === "bulk" ? "Bulk" : title,
          imageUrl: imageUrl || undefined,
          items: listingType === "singles" ? items : [],
          ...(bulkPriceCents == null ? {} : { bulkPriceCents }),
        },
        token,
      );
      location.href = `/publi/${listing.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo publicar");
      setBusy(false);
    }
  }
  async function uploadImage(file: File) {
    if (!token) {
      setError("Iniciá sesión para subir una foto.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const blob = await upload(`listing-images/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        headers: { Authorization: `Bearer ${token}` },
      });
      setImageUrl(blob.url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo subir la foto.");
    } finally {
      setUploading(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="listing-options">
        <fieldset className="toggle-field">
          <legend>Tipo de publicación</legend>
          <div className="toggle-group">
            {(["singles", "bulk"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={listingType === value ? "active" : ""}
                aria-pressed={listingType === value}
                onClick={() => setListingType(value)}
              >
                {value === "singles" ? "Singles" : "Bulk"}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="toggle-field">
          <legend>Moneda</legend>
          <div className="toggle-group">
            {(["ARS", "USD"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={currency === value ? "active" : ""}
                aria-pressed={currency === value}
                onClick={() => setCurrency(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      {listingType === "singles" && (
        <label>
          Título
          <input
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === "sale" ? "Singles disponibles" : "Cartas que estoy buscando"}
          />
        </label>
      )}
      <label>
        Foto
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadImage(file);
          }}
        />
        {uploading && <small>Subiendo foto…</small>}
        {imageUrl && <small>Foto lista. También podés reemplazarla.</small>}
      </label>
      <details>
        <summary>Usar una URL de imagen</summary>
        <label>
          URL
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
          />
        </label>
      </details>
      {listingType === "bulk" ? (
        <label>
          Precio
          <input
            className="number-without-stepper"
            type="number"
            min="0"
            step="0.01"
            required
            onChange={(e) =>
              setBulkPriceCents(e.target.value ? Math.round(Number(e.target.value) * 100) : null)
            }
          />
        </label>
      ) : (
        <>
          <h2>Cartas</h2>
          {items.map((item, index) => (
            <div className="item-row" key={index}>
              <label>
                Carta
                <CardAutocomplete
                  value={item.name}
                  onSelect={(card) => update(index, { name: card.name, cardId: card.id })}
                />
              </label>
              <label>
                Cantidad
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => update(index, { quantity: Number(e.target.value) })}
                />
              </label>
              <label>
                Precio unitario
                <input
                  className="number-without-stepper"
                  type="number"
                  min="0"
                  step="0.01"
                  onChange={(e) =>
                    update(index, {
                      unitPriceCents: e.target.value
                        ? Math.round(Number(e.target.value) * 100)
                        : null,
                    })
                  }
                />
              </label>
              <label>
                Precio playset
                <input
                  className="number-without-stepper"
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={item.quantity < 3}
                  onChange={(e) =>
                    update(index, {
                      playsetPriceCents: e.target.value
                        ? Math.round(Number(e.target.value) * 100)
                        : null,
                    })
                  }
                />
              </label>
              {items.length > 1 && (
                <button type="button" onClick={() => setItems(items.filter((_, i) => i !== index))}>
                  ×
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setItems([...items, emptyItem()])}>
            Agregar carta
          </button>
        </>
      )}
      {error && <p className="error">{error}</p>}
      <button disabled={busy || uploading}>{busy ? "Publicando…" : "Publicar"}</button>
    </form>
  );
}
