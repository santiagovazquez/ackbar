"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/auth-provider";
import { api } from "../../lib/api";

interface Exchange {
  id: string;
  quantity: number;
  amount_cents: number;
  status: string;
  card_id: string;
  card_name: string;
  card_set_code: string | null;
  detail: string | null;
  listing_id: string;
  listing_type: "singles" | "bulk";
  description: string | null;
  counterparty_id: string;
  counterparty_name: string;
  rated: number;
  currency: "ARS" | "USD";
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
const exchangeMoney = (cents: number, currency: Exchange["currency"]) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
  }).format(cents / 100);
type CurrencyTotals = Partial<Record<Exchange["currency"], number>>;
const exchangeTotals = (rows: Exchange[]) =>
  rows.reduce<CurrencyTotals>((totals, row) => {
    totals[row.currency] = (totals[row.currency] ?? 0) + row.amount_cents;
    return totals;
  }, {});
const pendingTotals = (rows: Exchange[]) =>
  exchangeTotals(rows.filter((row) => row.status === "claimed"));
const totalsLabel = (totals: CurrencyTotals) =>
  (["ARS", "USD"] as const)
    .filter((currency) => totals[currency])
    .map((currency) => exchangeMoney(totals[currency]!, currency))
    .join(" + ") || exchangeMoney(0, "ARS");
const setCodeFor = (claim: Exchange) => {
  if (claim.card_set_code) return claim.card_set_code;
  const match = claim.card_id.match(/^([A-Z0-9]+)_\d+$/i);
  return match?.[1]?.toUpperCase() ?? null;
};

export default function Dashboard() {
  const { token, isLoading } = useAuth();
  const router = useRouter();
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
  useEffect(() => {
    if (!isLoading && !token) router.replace("/");
  }, [isLoading, router, token]);
  async function deliverClaims(claimIds: string[]) {
    if (!token) return;
    await api("/claims/batch/delivered", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ claimIds }),
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
  async function deactivateListing(id: string) {
    if (!token || !confirm("¿Querés desactivar esta publicación?")) return;
    await api(`/listings/${id}/deactivate`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    await load();
  }
  if (isLoading || !token) return null;
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
  const salesByDelivery = data.sales.reduce<
    Array<{ key: string; buyerId: string; buyerName: string; claims: Exchange[] }>
  >((groups, claim) => {
    const key = `${claim.listing_id}:${claim.counterparty_id}`;
    const group = groups.find((candidate) => candidate.key === key);
    if (group) group.claims.push(claim);
    else
      groups.push({
        key,
        buyerId: claim.counterparty_id,
        buyerName: claim.counterparty_name,
        claims: [claim],
      });
    return groups;
  }, []);
  const sales = (
    <div className="stack">
      {salesByDelivery.length === 0 ? (
        <p className="muted">Todavía no hay operaciones.</p>
      ) : (
        salesByDelivery.map((group) => {
          const pendingClaims = group.claims.filter((claim) => claim.status === "claimed");
          return (
            <article className="panel" key={group.key}>
              <span className="status">
                {pendingClaims.length > 0 ? "claimed" : group.claims[0]!.status}
              </span>
              <h3>
                Entrega a <a href={`/perfil/${group.buyerId}`}>{group.buyerName}</a>
              </h3>
              <p>
                <a href={`/publi/${group.claims[0]!.listing_id}`}>
                  {group.claims[0]!.description || "Ver publicación"}
                </a>
              </p>
              <div className="market-table-wrap">
                <table className="market-table">
                  <thead>
                    <tr>
                      <th className="market-quantity-heading" aria-label="Cantidad" />
                      <th>Artículo</th>
                      <th className="market-price market-playset-price">Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.claims.map((claim) => {
                      const setCode = setCodeFor(claim);
                      return (
                        <tr key={claim.id}>
                          <td className="market-quantity">{claim.quantity}</td>
                          <td className="market-article">
                            <a href={`/publi/${claim.listing_id}`}>
                              {claim.listing_type === "bulk" ? (
                                claim.detail || claim.card_name
                              ) : (
                                <>
                                  <span className="card-name">
                                    {claim.card_name}
                                    {setCode && <small className="card-set">{setCode}</small>}
                                  </span>
                                  {claim.detail && (
                                    <small className="card-detail">{claim.detail}</small>
                                  )}
                                </>
                              )}
                            </a>
                          </td>
                          <td className="market-price market-playset-price">
                            {exchangeMoney(claim.amount_cents, claim.currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={2}>Total</th>
                      <td className="market-price market-playset-price">
                        {totalsLabel(exchangeTotals(group.claims))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="actions">
                {pendingClaims.length > 0 && (
                  <button onClick={() => deliverClaims(pendingClaims.map((claim) => claim.id))}>
                    Marcar todo entregado
                  </button>
                )}
              </div>
              {group.claims
                .filter((claim) => ["delivered", "received"].includes(claim.status) && !claim.rated)
                .map((claim) => (
                  <div className="actions" key={`${claim.id}:rating`}>
                    <span>Calificar {claim.detail || claim.card_name}:</span>
                    <button onClick={() => rate(claim.id, "positive")}>Positiva</button>
                    <button onClick={() => rate(claim.id, "neutral")}>Neutral</button>
                    <button onClick={() => rate(claim.id, "negative")}>Negativa</button>
                  </div>
                ))}
            </article>
          );
        })
      )}
    </div>
  );
  const claimsBySeller = data.purchases.reduce<
    Array<{ id: string; name: string; claims: Exchange[] }>
  >((groups, claim) => {
    const group = groups.find((candidate) => candidate.id === claim.counterparty_id);
    if (group) group.claims.push(claim);
    else groups.push({ id: claim.counterparty_id, name: claim.counterparty_name, claims: [claim] });
    return groups;
  }, []);
  const claims = (
    <div className="stack">
      {claimsBySeller.length === 0 ? (
        <p className="muted">Todavía no hiciste claims.</p>
      ) : (
        <>
          <section className="panel">
            <strong>Total pendiente: {totalsLabel(pendingTotals(data.purchases))}</strong>
          </section>
          {claimsBySeller.map((group) => (
            <section className="panel" key={group.id}>
              <h3>
                <a href={`/perfil/${group.id}`}>{group.name}</a>
              </h3>
              <div className="market-table-wrap">
                <table className="market-table">
                  <thead>
                    <tr>
                      <th className="market-quantity-heading" aria-label="Cantidad" />
                      <th>Artículo</th>
                      <th className="market-price market-playset-price">Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.claims.map((claim) => {
                      const setCode = setCodeFor(claim);
                      return (
                        <tr key={claim.id}>
                          <td className="market-quantity">{claim.quantity}</td>
                          <td className="market-article">
                            <a href={`/publi/${claim.listing_id}`}>
                              {claim.listing_type === "bulk" ? (
                                claim.detail || claim.card_name
                              ) : (
                                <>
                                  <span className="card-name">
                                    {claim.card_name}
                                    {setCode && <small className="card-set">{setCode}</small>}
                                  </span>
                                  {claim.detail && (
                                    <small className="card-detail">{claim.detail}</small>
                                  )}
                                </>
                              )}
                            </a>
                          </td>
                          <td className="market-price market-playset-price">
                            {exchangeMoney(claim.amount_cents, claim.currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={2}>Total pendiente a {group.name}</th>
                      <td className="market-price market-playset-price">
                        {totalsLabel(pendingTotals(group.claims))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          ))}
        </>
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
            {data.purchases.length} claims
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
              {listing.status !== "inactive" && (
                <button onClick={() => deactivateListing(listing.id)}>Desactivar</button>
              )}
            </article>
          ))
        )}
      </div>
      <h2>Ventas</h2>
      {sales}
      <h2>Mis claims</h2>
      {claims}
    </main>
  );
}
