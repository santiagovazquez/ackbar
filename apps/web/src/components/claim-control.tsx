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
  const selectedQuantity = selectedItems.reduce((sum, item) => sum + (selection[item.id] ?? 0), 0);

  function changeQuantity(item: ListingItem, delta: number) {
    setMessage("");
    setSelection((current) => {
      const quantity = Math.max(
        0,
        Math.min(item.availableQuantity, (current[item.id] ?? 0) + delta),
      );
      const next = { ...current };
      if (quantity === 0) delete next[item.id];
      else next[item.id] = quantity;
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
  const actions = (item: ListingItem) => {
    if (listing.status !== "active" || item.availableQuantity === 0) return null;

    const quantity = selection[item.id] ?? 0;
    return (
      <div className="table-actions" aria-label={`Cantidad a claimear de ${item.name}`}>
        {quantity > 0 && (
          <button
            type="button"
            className="quantity-action"
            aria-label={`Quitar una unidad de ${item.name}`}
            onClick={() => changeQuantity(item, -1)}
          >
            −
          </button>
        )}
        <output className={quantity > 0 ? "claim-quantity selected" : "claim-quantity"}>
          {quantity}
        </output>
        {item.unitPriceCents != null && (
          <button
            type="button"
            onClick={() => changeQuantity(item, 1)}
            disabled={quantity >= item.availableQuantity}
          >
            +1
          </button>
        )}
        {item.playsetPriceCents != null && item.availableQuantity >= 3 && (
          <button
            type="button"
            onClick={() => changeQuantity(item, 3)}
            disabled={quantity + 3 > item.availableQuantity}
          >
            +PS
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="listing-table-wrap">
        <table className="listing-table">
          <thead>
            {listing.listingType === "singles" ? (
              <tr>
                <th aria-label="Cantidad" />
                <th>Carta</th>
                <th>Detalle</th>
                <th>Precio unitario</th>
                <th>Precio playset</th>
                <th>A claimear</th>
              </tr>
            ) : (
              <tr>
                <th>Detalle</th>
                <th>Precio</th>
                <th>A claimear</th>
              </tr>
            )}
          </thead>
          <tbody>
            {listing.items.map((item) =>
              listing.listingType === "singles" ? (
                <tr
                  key={item.id}
                  className={
                    item.availableQuantity === 0
                      ? "locked"
                      : (selection[item.id] ?? 0) > 0
                        ? "claim-selected"
                        : ""
                  }
                >
                  <td>{item.availableQuantity}</td>
                  <td>
                    <span className="card-name">{item.name}</span>
                    {item.subtitle && <small className="card-subtitle">{item.subtitle}</small>}
                  </td>
                  <td>{item.detail ?? "—"}</td>
                  <td>{money(item.unitPriceCents, listing.currency)}</td>
                  <td>{money(item.playsetPriceCents, listing.currency)}</td>
                  <td>{actions(item)}</td>
                </tr>
              ) : (
                <tr
                  key={item.id}
                  className={
                    item.availableQuantity === 0
                      ? "locked"
                      : (selection[item.id] ?? 0) > 0
                        ? "claim-selected"
                        : ""
                  }
                >
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
          <p className="claim-summary-count">
            {selectedQuantity} {selectedQuantity === 1 ? "carta" : "cartas"} en tu claim
          </p>
          <p className="claim-total">
            <span>Total</span>
            <strong>{money(total, listing.currency)}</strong>
          </p>
          <div className="claim-summary-actions">
            <button
              type="button"
              className="secondary-action"
              onClick={() => setSelection({})}
              disabled={busy}
            >
              Limpiar
            </button>
            <button type="button" onClick={confirm} disabled={busy}>
              {busy ? "Confirmando…" : "Confirmar claims"}
            </button>
          </div>
          {message && <small role="status">{message}</small>}
        </aside>
      )}
    </>
  );
}
