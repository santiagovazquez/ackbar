"use client";
import { useState } from "react";
import type { ListingItem } from "@swu/shared";
import { api } from "../lib/api";
import { useAuth } from "./auth-provider";

export function ClaimControl({ item }: { item: ListingItem }) {
  const { token } = useAuth();
  const [mode, setMode] = useState<"unit" | "playset">(
    item.unitPriceCents != null ? "unit" : "playset",
  );
  const [quantity, setQuantity] = useState(mode === "playset" ? 3 : 1);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (item.availableQuantity === 0) return null;
  async function claim() {
    if (!token) {
      setMessage("Iniciá sesión para hacer un claim.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api("/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ itemId: item.id, quantity, pricingMode: mode }),
      });
      setMessage("Claim confirmado. La carta quedó reservada.");
      setTimeout(() => location.reload(), 700);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo completar el claim.");
      setBusy(false);
    }
  }
  return (
    <div className="claim-control">
      <select
        value={mode}
        onChange={(event) => {
          const next = event.target.value as "unit" | "playset";
          setMode(next);
          setQuantity(next === "playset" ? 3 : 1);
        }}
      >
        <option value="unit" disabled={item.unitPriceCents == null}>
          Unidad
        </option>
        <option value="playset" disabled={item.playsetPriceCents == null}>
          Playset
        </option>
      </select>
      <input
        aria-label="Cantidad"
        type="number"
        min={mode === "playset" ? 3 : 1}
        step={mode === "playset" ? 3 : 1}
        max={item.availableQuantity}
        value={quantity}
        onChange={(event) => setQuantity(Number(event.target.value))}
      />
      <button type="button" disabled={busy || quantity > item.availableQuantity} onClick={claim}>
        {busy ? "Reservando…" : "Claim"}
      </button>
      {message && <small>{message}</small>}
    </div>
  );
}
