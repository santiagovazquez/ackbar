"use client";
import { useRef, useState } from "react";
import type { CardInput, Currency, ListingKind, ListingType } from "@swu/shared";
import { createListing } from "../lib/api";
import { useAuth } from "./auth-provider";
import { CardAutocomplete } from "./card-autocomplete";

const MAX_IMAGES = 24;
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

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
  const [description, setDescription] = useState("");
  const [bulkPriceCents, setBulkPriceCents] = useState<number | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [items, setItems] = useState<CardInput[]>([emptyItem()]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const update = (index: number, patch: Partial<CardInput>) =>
    setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) {
      setError("Iniciá sesión con Google para publicar.");
      return;
    }
    if (imageUrls.length === 0) {
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
          ...(description.trim() ? { description: description.trim() } : {}),
          imageUrls: imageUrls.length ? imageUrls : undefined,
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
  async function uploadImages(files: File[]) {
    if (!token) {
      setError("Iniciá sesión para subir una foto.");
      return;
    }
    const availableSlots = MAX_IMAGES - imageUrls.length;
    const selectedFiles = files.slice(0, availableSlots);
    if (!selectedFiles.length) {
      setError(`Podés subir hasta ${MAX_IMAGES} imágenes por publicación.`);
      return;
    }
    const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (selectedFiles.some((file) => !acceptedTypes.has(file.type))) {
      setError("Las imágenes deben ser JPG, PNG o WebP.");
      return;
    }
    if (selectedFiles.some((file) => file.size > MAX_IMAGE_SIZE)) {
      setError("Cada imagen debe pesar 20 MB o menos.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const urls = await Promise.all(
        selectedFiles.map(async (file) => {
          const response = await fetch("/api/upload", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ contentType: file.type, size: file.size }),
          });
          const upload = (await response.json()) as {
            url?: string;
            fields?: Record<string, string>;
            publicUrl?: string;
            error?: string;
          };
          if (!response.ok || !upload.url || !upload.fields || !upload.publicUrl)
            throw new Error(upload.error ?? "No se pudo preparar la carga.");
          const form = new FormData();
          Object.entries(upload.fields).forEach(([name, value]) => form.append(name, value));
          form.append("file", file);
          const uploadResponse = await fetch(upload.url, { method: "POST", body: form });
          if (!uploadResponse.ok) throw new Error("No se pudo subir la imagen a S3.");
          return upload.publicUrl;
        }),
      );
      setImageUrls((current) => [...current, ...urls].slice(0, MAX_IMAGES));
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
      <label>
        <span>
          Descripción <span className="optional-label">Opcional</span>
        </span>
        <textarea
          rows={2}
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Agregá algún detalle sobre la publicación"
        />
      </label>
      <section className="image-upload-field" aria-labelledby="images-label">
        <div className="field-heading">
          <span id="images-label">Fotos</span>
          <small>
            {imageUrls.length}/{MAX_IMAGES}
          </small>
        </div>
        <div
          className={`image-dropzone${dragging ? " dragging" : ""}`}
          onClick={() => fileInput.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void uploadImages(Array.from(event.dataTransfer.files));
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") fileInput.current?.click();
          }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
          </svg>
          <strong>{dragging ? "Soltá las imágenes acá" : "Arrastrá tus imágenes acá"}</strong>
          <span>o hacé clic para elegir varias</span>
          <small>JPG, PNG o WebP · máximo 20 MB por imagen</small>
        </div>
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length) void uploadImages(files);
            event.target.value = "";
          }}
        />
        {uploading && <p className="upload-status">Subiendo imágenes…</p>}
        {imageUrls.length > 0 && (
          <div className="image-previews" aria-label="Imágenes subidas">
            {imageUrls.map((url, index) => (
              <div className="image-preview" key={url}>
                <img src={url} alt={`Vista previa ${index + 1}`} />
                {index === 0 && <span>Portada</span>}
                <button
                  type="button"
                  aria-label={`Quitar imagen ${index + 1}`}
                  onClick={() => setImageUrls((current) => current.filter((item) => item !== url))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
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
