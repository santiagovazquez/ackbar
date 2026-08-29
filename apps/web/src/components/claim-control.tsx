"use client";

import { useMemo, useState } from "react";
import type { Listing, ListingItem } from "@swu/shared";
import { api } from "../lib/api";
import { useAuth } from "./auth-provider";

type Selection = Record<string, number>;
const money = (cents: number | null, currency: Listing["currency"]) =>
  cents == null
    ? "—"
    : `${currency === "ARS" ? "$" : "US$"} ${(cents / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function totalFor(item: ListingItem, quantity: number) {
  if (item.playsetPriceCents != null && quantity >= 3)
    return (
      Math.floor(quantity / 3) * item.playsetPriceCents +
      (quantity % 3) * (item.unitPriceCents ?? 0)
    );
  return quantity * (item.unitPriceCents ?? 0);
}

export function ClaimControl({ listing }: { listing: Listing }) {
  const { token } = useAuth();
  const [selection, setSelection] = useState<Selection>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedItems = useMemo(
    () => listing.items.filter((item) => (selection[item.id] ?? 0) > 0),
    [listing.items, selection],
  );
  const total = selectedItems.reduce(
    (sum, item) => sum + totalFor(item, selection[item.id] ?? 0),
    0,
  );

  function add(item: ListingItem, quantity: number) {
    setMessage("");
    setSelection((current) => ({
      ...current,
      [item.id]: Math.min(item.availableQuantity, (current[item.id] ?? 0) + quantity),
    }));
  }
  function remove(item: ListingItem) {
    setSelection((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
  }
  async function confirm() {
    if (!token) {
      setMessage("Iniciá sesión para confirmar tus claims.");
      return;
    }
    setBusy(true);
    setMessage("");
    const claims = selectedItems.flatMap((item) => {
      const quantity = selection[item.id] ?? 0;
      const playsetQuantity = item.playsetPriceCents == null ? 0 : Math.floor(quantity / 3) * 3;
      const unitQuantity = quantity - playsetQuantity;
      return [
        ...(playsetQuantity
          ? [{ itemId: item.id, quantity: playsetQuantity, pricingMode: "playset" as const }]
          : []),
        ...(unitQuantity
          ? [{ itemId: item.id, quantity: unitQuantity, pricingMode: "unit" as const }]
          : []),
      ];
    });
    try {
      await api("/claims/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ claims }),
      });
      setMessage("Claims confirmados. Los artículos quedaron reservados.");
      setTimeout(() => location.reload(), 700);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron confirmar los claims.");
      setBusy(false);
    }
  }
  const actions = (item: ListingItem) =>
    listing.status === "active" && item.availableQuantity > 0 ? (
      <div className="table-actions">
        {item.unitPriceCents != null && (
          <button
            type="button"
            onClick={() => add(item, 1)}
            disabled={(selection[item.id] ?? 0) >= item.availableQuantity}
          >
            Claim
          </button>
        )}
        {item.playsetPriceCents != null && item.availableQuantity >= 3 && (
          <button
            type="button"
            className="secondary-action"
            onClick={() => add(item, 3)}
            disabled={(selection[item.id] ?? 0) + 3 > item.availableQuantity}
          >
            Claim PS
          </button>
        )}
      </div>
    ) : null;

  return (
    <>
      <div className="listing-table-wrap">
        <table className="listing-table">
          <thead>
            {listing.listingType === "singles" ? (
              <tr>
                <th>Cantidad</th>
                <th>Carta</th>
                <th>Detalle</th>
                <th>Precio unitario</th>
                <th>Precio playset</th>
                <th>Acciones</th>
              </tr>
            ) : (
              <tr>
                <th>Detalle</th>
                <th>Precio</th>
                <th>Acción</th>
              </tr>
            )}
          </thead>
          <tbody>
            {listing.items.map((item) =>
              listing.listingType === "singles" ? (
                <tr key={item.id} className={item.availableQuantity === 0 ? "locked" : ""}>
                  <td>{item.availableQuantity}</td>
                  <td>{item.name}</td>
                  <td>{item.detail ?? "—"}</td>
                  <td>{money(item.unitPriceCents, listing.currency)}</td>
                  <td>{money(item.playsetPriceCents, listing.currency)}</td>
                  <td>{actions(item)}</td>
                </tr>
              ) : (
                <tr key={item.id} className={item.availableQuantity === 0 ? "locked" : ""}>
                  <td>{item.detail ?? item.name}</td>
                  <td>{money(item.unitPriceCents, listing.currency)}</td>
                  <td>{actions(item)}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      {selectedItems.length > 0 && (
        <aside className="claim-summary" aria-label="Claims a confirmar">
          <h2>Tus claims</h2>
          <div className="claim-summary-items">
            {selectedItems.map((item) => (
              <div className="claim-summary-item" key={item.id}>
                <span>
                  <strong>{selection[item.id]}×</strong>{" "}
                  {listing.listingType === "bulk" ? (item.detail ?? item.name) : item.name}
                </span>
                <span>{money(totalFor(item, selection[item.id] ?? 0), listing.currency)}</span>
                <button
                  type="button"
                  className="remove-claim"
                  aria-label={`Quitar ${item.name}`}
                  onClick={() => remove(item)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <p className="claim-total">
            <span>Total</span>
            <strong>{money(total, listing.currency)}</strong>
          </p>
          <button type="button" onClick={confirm} disabled={busy}>
            {busy ? "Confirmando…" : "Confirmar claims"}
          </button>
          {message && <small>{message}</small>}
        </aside>
      )}
    </>
  );
}
