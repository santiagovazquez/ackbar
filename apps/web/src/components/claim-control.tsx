"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Listing, ListingItem } from "@swu/shared";
import { api } from "../lib/api";
import { useAuth } from "./auth-provider";

type Selection = Record<string, number>;
type ClaimedItem = {
  itemId: string;
  quantity: number;
  amountCents: number;
  claimantId?: string;
  claimantName?: string;
  claimantUsername?: string | null;
};
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
  const { token, user } = useAuth();
  const isOwner = user?.id === listing.seller.id;
  const showClaimActions = !token || Boolean(user && !isOwner);
  const [items, setItems] = useState(listing.items);
  const [selection, setSelection] = useState<Selection>({});
  const [claims, setClaims] = useState<ClaimedItem[]>([]);
  const claimed = useMemo(
    () => Object.fromEntries(claims.map((claim) => [claim.itemId, claim])),
    [claims],
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedItems = useMemo(
    () => items.filter((item) => (selection[item.id] ?? 0) > 0),
    [items, selection],
  );
  const loadClaimed = useCallback(async () => {
    if (!token) {
      setClaims([]);
      return;
    }
    const rows = await api<ClaimedItem[]>(`/claims/listing/${listing.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    setClaims(rows);
  }, [listing.id, token]);
  useEffect(() => {
    void loadClaimed().catch(() => setMessage("No pudimos cargar tus claims anteriores."));
  }, [loadClaimed]);
  const total = selectedItems.reduce(
    (sum, item) => sum + totalFor(item, selection[item.id] ?? 0),
    0,
  );
  const selectedQuantity = selectedItems.reduce((sum, item) => sum + (selection[item.id] ?? 0), 0);

  if (listing.kind === "wanted") {
    return (
      <div className="listing-table-wrap">
        <table className="listing-table">
          <thead>
            <tr>
              <th>Cantidad</th>
              <th>Carta</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.quantity}</td>
                <td>
                  <span className="card-name">
                    {item.name}
                    {item.setCode && <small className="card-set">{item.setCode}</small>}
                  </span>
                  {item.subtitle && <small className="card-subtitle">{item.subtitle}</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

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
      const confirmed = { ...selection };
      setItems((current) =>
        current.map((item) => ({
          ...item,
          availableQuantity: item.availableQuantity - (confirmed[item.id] ?? 0),
        })),
      );
      setClaims((current) => {
        const next = Object.fromEntries(current.map((claim) => [claim.itemId, claim]));
        selectedItems.forEach((item) => {
          const previous = next[item.id];
          const quantity = confirmed[item.id] ?? 0;
          next[item.id] = {
            itemId: item.id,
            quantity: (previous?.quantity ?? 0) + quantity,
            amountCents: (previous?.amountCents ?? 0) + totalFor(item, quantity),
            claimantId: user?.id ?? "",
            claimantName: user?.name ?? "",
            claimantUsername: user?.username ?? null,
          };
        });
        return Object.values(next);
      });
      setSelection({});
      setMessage("¡Listo! Tus artículos quedaron claimeados y reservados.");
      setBusy(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron confirmar los claims.");
      setBusy(false);
    }
  }
  const actions = (item: ListingItem) => {
    if (!showClaimActions || listing.status !== "active" || item.availableQuantity === 0)
      return null;

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
                {showClaimActions && <th>A claimear</th>}
              </tr>
            ) : (
              <tr>
                <th>Detalle</th>
                <th>Precio</th>
                {showClaimActions && <th>A claimear</th>}
              </tr>
            )}
          </thead>
          <tbody>
            {items.map((item) =>
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
                    <span className="card-name">
                      {item.name}
                      {item.setCode && <small className="card-set">{item.setCode}</small>}
                    </span>
                    {item.subtitle && <small className="card-subtitle">{item.subtitle}</small>}
                    {showClaimActions && claimed[item.id] && (
                      <small className="claimed-item-mark">
                        ✓ Claimeaste {claimed[item.id]!.quantity}
                      </small>
                    )}
                  </td>
                  <td>{item.detail ?? "—"}</td>
                  <td>{money(item.unitPriceCents, listing.currency)}</td>
                  <td>{money(item.playsetPriceCents, listing.currency)}</td>
                  {showClaimActions && <td>{actions(item)}</td>}
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
                  <td>
                    {item.detail ?? item.name}
                    {showClaimActions && claimed[item.id] && (
                      <small className="claimed-item-mark">
                        ✓ Claimeaste {claimed[item.id]!.quantity}
                      </small>
                    )}
                  </td>
                  <td>{money(item.unitPriceCents, listing.currency)}</td>
                  {showClaimActions && <td>{actions(item)}</td>}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      {showClaimActions && selectedItems.length > 0 && (
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
      {claims.length > 0 && (
        <aside
          className="claimed-summary"
          aria-label={
            isOwner ? "Claims realizados en esta publicación" : "Tus claims en esta publicación"
          }
        >
          <strong>
            {isOwner ? "Claims realizados en esta publicación" : "Tus claims en esta publicación"}
          </strong>
          <ul>
            {claims.map((claim) => {
              const item = items.find((candidate) => candidate.id === claim.itemId);
              return (
                <li key={`${claim.itemId}:${claim.claimantId ?? "self"}`}>
                  <span>
                    {claim.quantity}× {item?.detail ?? item?.name}
                    {isOwner && claim.claimantName && (
                      <>
                        {" · "}
                        {claim.claimantUsername ? (
                          <a href={`/${claim.claimantUsername}`}>{claim.claimantName}</a>
                        ) : (
                          claim.claimantName
                        )}
                      </>
                    )}
                  </span>
                  <strong>{money(claim.amountCents, listing.currency)}</strong>
                </li>
              );
            })}
          </ul>
        </aside>
      )}
      {message && selectedItems.length === 0 && (
        <p className="claim-message" role="status">
          {message}
        </p>
      )}
    </>
  );
}
