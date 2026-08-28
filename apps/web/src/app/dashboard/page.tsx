"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../components/auth-provider";
import { api } from "../../lib/api";

interface Exchange {
  id: string;
  quantity: number;
  amount_cents: number;
  status: string;
  card_name: string;
  listing_id: string;
  description: string | null;
  counterparty_id: string;
  counterparty_name: string;
  rated: number;
}
interface RatingBreakdown {
  positive: number;
  neutral: number;
  negative: number;
  buyer_positive: number;
  buyer_neutral: number;
  buyer_negative: number;
  seller_positive: number;
  seller_neutral: number;
  seller_negative: number;
}
interface DashboardData {
  user: { name: string };
  listings: Array<{
    id: string;
    kind: string;
    description: string | null;
    card_names: string | null;
    status: string;
    claim_count: number;
    total_cents: number;
  }>;
  purchases: Exchange[];
  sales: Exchange[];
  ratings: RatingBreakdown;
}
const money = (cents: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(cents / 100);

export default function Dashboard() {
  const { token } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!token) return;
    try {
      setData(
        await api<DashboardData>("/users/me/dashboard", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo cargar el panel.");
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);
  async function updateStatus(id: string, status: "delivered" | "received") {
    if (!token) return;
    await api(`/claims/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    await load();
  }
  async function rate(id: string, value: "positive" | "neutral" | "negative") {
    if (!token) return;
    await api("/users/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ claimId: id, value }),
    });
    await load();
  }
  async function removeListing(id: string) {
    if (!token || !confirm("¿Querés borrar esta publicación?")) return;
    await api(`/listings/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    await load();
  }
  if (!token)
    return (
      <main>
        <h1>Mi panel</h1>
        <p>Iniciá sesión con Google para ver tu actividad.</p>
      </main>
    );
  if (error)
    return (
      <main>
        <h1>Mi panel</h1>
        <p className="error">{error}</p>
      </main>
    );
  if (!data)
    return (
      <main>
        <h1>Mi panel</h1>
        <p>Cargando…</p>
      </main>
    );
  const exchanges = (rows: Exchange[], role: "buyer" | "seller") => (
    <div className="stack">
      {rows.length === 0 ? (
        <p className="muted">Todavía no hay operaciones.</p>
      ) : (
        rows.map((row) => (
          <article className="panel" key={row.id}>
            <span className="status">{row.status}</span>
            <h3>
              {row.quantity}× {row.card_name}
            </h3>
            <p>
              <a href={`/publi/${row.listing_id}`}>{row.card_name}</a> · {money(row.amount_cents)} ·
              con <a href={`/perfil/${row.counterparty_id}`}>{row.counterparty_name}</a>
            </p>
            <div className="actions">
              {role === "seller" && row.status === "claimed" && (
                <button onClick={() => updateStatus(row.id, "delivered")}>Marcar entregada</button>
              )}
              {role === "buyer" && row.status === "delivered" && (
                <button onClick={() => updateStatus(row.id, "received")}>Marcar recibida</button>
              )}
              {["delivered", "received"].includes(row.status) && !row.rated && (
                <>
                  <button onClick={() => rate(row.id, "positive")}>Positiva</button>
                  <button onClick={() => rate(row.id, "neutral")}>Neutral</button>
                  <button onClick={() => rate(row.id, "negative")}>Negativa</button>
                </>
              )}
            </div>
          </article>
        ))
      )}
    </div>
  );
  return (
    <main>
      <h1>Hola, {data.user.name}</h1>
      <div className="actions">
        <a className="button" href="/vendo">
          Publicar venta
        </a>
      </div>
      <div className="grid">
        <section className="panel">
          <h2>Reputación como vendedor</h2>
          <p>
            🟢 {data.ratings.seller_positive} · ⚪ {data.ratings.seller_neutral} · 🔴{" "}
            {data.ratings.seller_negative}
          </p>
        </section>
        <section className="panel">
          <h2>Reputación como comprador</h2>
          <p>
            🟢 {data.ratings.buyer_positive} · ⚪ {data.ratings.buyer_neutral} · 🔴{" "}
            {data.ratings.buyer_negative}
          </p>
        </section>
        <section className="panel">
          <h2>Resumen</h2>
          <p>
            {data.listings.length} publicaciones · {data.sales.length} ventas ·{" "}
            {data.purchases.length} compras
          </p>
        </section>
      </div>
      <h2>Mis publicaciones</h2>
      <div className="stack">
        {data.listings.length === 0 ? (
          <p className="muted">Todavía no publicaste.</p>
        ) : (
          data.listings.map((listing) => (
            <article className="panel" key={listing.id}>
              <span className="status">{listing.status}</span>
              <h3>
                <a href={`/publi/${listing.id}`}>{listing.card_names ?? "Bulk"}</a>
              </h3>
              {listing.description && <p>{listing.description}</p>}
              <p>
                {listing.claim_count} claims · {money(listing.total_cents)}
              </p>
              <button onClick={() => removeListing(listing.id)}>Borrar</button>
            </article>
          ))
        )}
      </div>
      <h2>Ventas</h2>
      {exchanges(data.sales, "seller")}
      <h2>Compras</h2>
      {exchanges(data.purchases, "buyer")}
    </main>
  );
}
