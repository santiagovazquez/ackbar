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
  counterparty_username: string | null;
  counterparty_whatsapp: string | null;
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
    image_url: string | null;
    status: string;
    created_at: string;
    claim_count: number;
    total_cents: number;
  }>;
  purchases: Exchange[];
  sales: Exchange[];
  ratings: RatingBreakdown;
}
type ListingsFilter = "active" | "inactive";
type SalesFilter = "active" | "inactive";
const LISTINGS_PER_PAGE = 5;
const listingStatusLabel = (status: string) =>
  ({
    active: "activa",
    closed: "cerrada",
    expired: "vencida",
    inactive: "desactivada",
    deleted: "eliminada",
  })[status] ?? "no disponible";
const exchangeStatusLabel = (status: string) =>
  ({
    claimed: "claimeado",
    delivered: "entregado",
  })[status] ?? status;
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
const ReputationSummary = ({
  label,
  positive,
  neutral,
  negative,
}: {
  label: string;
  positive: number;
  neutral: number;
  negative: number;
}) => (
  <div className="dashboard-reputation">
    <span>{label}</span>
    <div
      className="dashboard-reputation-values"
      aria-label={`${label}: ${positive} positivas, ${neutral} neutrales y ${negative} negativas`}
    >
      <strong className="positive">
        <i aria-hidden="true" />
        {positive}
      </strong>
      <strong className="neutral">
        <i aria-hidden="true" />
        {neutral}
      </strong>
      <strong className="negative">
        <i aria-hidden="true" />
        {negative}
      </strong>
    </div>
  </div>
);

export default function Dashboard() {
  const { token, isLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [listingsFilter, setListingsFilter] = useState<ListingsFilter>("active");
  const [listingsPage, setListingsPage] = useState(1);
  const [salesFilter, setSalesFilter] = useState<SalesFilter>("active");
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
  useEffect(() => {
    const closeListingMenus = (except?: HTMLDetailsElement | null) => {
      document
        .querySelectorAll<HTMLDetailsElement>(".dashboard-listing-menu[open]")
        .forEach((menu) => {
          if (menu !== except) menu.open = false;
        });
    };
    const handlePointerDown = (event: PointerEvent) => {
      const clickedMenu =
        event.target instanceof Element
          ? event.target.closest<HTMLDetailsElement>(".dashboard-listing-menu")
          : null;
      closeListingMenus(clickedMenu);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const openMenu = document.querySelector<HTMLDetailsElement>(".dashboard-listing-menu[open]");
      if (!openMenu) return;
      openMenu.open = false;
      openMenu.querySelector<HTMLElement>("summary")?.focus();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
  async function deliverClaims(claimIds: string[]) {
    if (!token) return;
    await api("/claims/batch/delivered", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ claimIds }),
    });
    await load();
  }
  async function receiveClaims(claimIds: string[]) {
    if (!token) return;
    await Promise.all(
      claimIds.map((claimId) =>
        api(`/claims/${claimId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: "received" }),
        }),
      ),
    );
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
  const filteredSalesByDelivery = salesByDelivery.filter((group) => {
    const groupAlreadyRated = group.claims.some((claim) => Boolean(claim.rated));
    const isActive =
      group.claims.some((claim) => claim.status === "claimed") ||
      (!groupAlreadyRated &&
        group.claims.some((claim) => claim.status === "received" && !claim.rated));
    return salesFilter === "active" ? isActive : !isActive;
  });
  const sales = (
    <div className="stack">
      {filteredSalesByDelivery.length === 0 ? (
        <p className="muted">
          {salesByDelivery.length === 0
            ? "Todavía no hay operaciones."
            : `No tenés ventas ${salesFilter === "active" ? "activas" : "inactivas"}.`}
        </p>
      ) : (
        filteredSalesByDelivery.map((group) => {
          const pendingClaims = group.claims.filter((claim) => claim.status === "claimed");
          const ratingClaim = group.claims.find(
            (claim) => claim.status === "received" && !claim.rated,
          );
          const groupAlreadyRated = group.claims.some((claim) => Boolean(claim.rated));
          return (
            <article className="panel" key={group.key}>
              <span className="status">
                {exchangeStatusLabel(
                  pendingClaims.length > 0 ? "claimed" : group.claims[0]!.status,
                )}
              </span>
              <h3>
                Entrega a{" "}
                <a
                  href={
                    group.claims[0]!.counterparty_username
                      ? `/${group.claims[0]!.counterparty_username}`
                      : `/perfil/${group.buyerId}`
                  }
                >
                  {group.buyerName}
                </a>
              </h3>
              {group.claims[0]!.counterparty_whatsapp && (
                <a
                  className="whatsapp-contact"
                  href={`https://wa.me/${group.claims[0]!.counterparty_whatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Contactar por WhatsApp
                </a>
              )}
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
              {pendingClaims.length === 0 && ratingClaim && !groupAlreadyRated && (
                <div className="actions">
                  <span>Calificar a {group.buyerName} como comprador:</span>
                  <button onClick={() => rate(ratingClaim.id, "positive")}>Positiva</button>
                  <button onClick={() => rate(ratingClaim.id, "neutral")}>Neutral</button>
                  <button onClick={() => rate(ratingClaim.id, "negative")}>Negativa</button>
                </div>
              )}
            </article>
          );
        })
      )}
    </div>
  );
  const claimsBySeller = data.purchases.reduce<
    Array<{ key: string; id: string; name: string; claims: Exchange[] }>
  >((groups, claim) => {
    const key = `${claim.listing_id}:${claim.counterparty_id}`;
    const group = groups.find((candidate) => candidate.key === key);
    if (group) group.claims.push(claim);
    else
      groups.push({
        key,
        id: claim.counterparty_id,
        name: claim.counterparty_name,
        claims: [claim],
      });
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
          {claimsBySeller.map((group) => {
            const pendingClaims = group.claims.filter((claim) => claim.status === "claimed");
            const deliveredClaims = group.claims.filter((claim) => claim.status === "delivered");
            const ratingClaim = group.claims.find(
              (claim) => claim.status === "received" && !claim.rated,
            );
            const groupAlreadyRated = group.claims.some((claim) => Boolean(claim.rated));
            return (
              <section className="panel" key={group.key}>
                <h3>
                  <a
                    href={
                      group.claims[0]!.counterparty_username
                        ? `/${group.claims[0]!.counterparty_username}`
                        : `/perfil/${group.id}`
                    }
                  >
                    {group.name}
                  </a>
                </h3>
                {group.claims[0]!.counterparty_whatsapp && (
                  <a
                    className="whatsapp-contact"
                    href={`https://wa.me/${group.claims[0]!.counterparty_whatsapp.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Contactar por WhatsApp
                  </a>
                )}
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
                <div className="actions">
                  {deliveredClaims.length > 0 && (
                    <button onClick={() => receiveClaims(deliveredClaims.map((claim) => claim.id))}>
                      Marcar como recibido
                    </button>
                  )}
                </div>
                {pendingClaims.length === 0 && ratingClaim && !groupAlreadyRated && (
                  <div className="actions">
                    <span>Calificar a {group.name} como vendedor:</span>
                    <button onClick={() => rate(ratingClaim.id, "positive")}>Positiva</button>
                    <button onClick={() => rate(ratingClaim.id, "neutral")}>Neutral</button>
                    <button onClick={() => rate(ratingClaim.id, "negative")}>Negativa</button>
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
  const filteredListings = [...data.listings]
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    .filter((listing) =>
      listingsFilter === "active" ? listing.status === "active" : listing.status !== "active",
    );
  const listingsPageCount = Math.max(1, Math.ceil(filteredListings.length / LISTINGS_PER_PAGE));
  const currentListingsPage = Math.min(listingsPage, listingsPageCount);
  const paginatedListings = filteredListings.slice(
    (currentListingsPage - 1) * LISTINGS_PER_PAGE,
    currentListingsPage * LISTINGS_PER_PAGE,
  );
  const changeListingsFilter = (filter: ListingsFilter) => {
    setListingsFilter(filter);
    setListingsPage(1);
  };
  return (
    <main>
      <section className="panel dashboard-overview">
        <div className="dashboard-overview-user">
          <h1>Hola, {data.user.name}</h1>
          <div className="dashboard-overview-stats" aria-label="Resumen de actividad">
            <span>
              <strong>{data.listings.length}</strong> publicaciones
            </span>
            <span>
              <strong>{data.sales.length}</strong> ventas
            </span>
          </div>
        </div>
        <div className="dashboard-reputations">
          <ReputationSummary
            label="Como vendedor"
            positive={data.ratings.seller_positive}
            neutral={data.ratings.seller_neutral}
            negative={data.ratings.seller_negative}
          />
          <ReputationSummary
            label="Como comprador"
            positive={data.ratings.buyer_positive}
            neutral={data.ratings.buyer_neutral}
            negative={data.ratings.buyer_negative}
          />
        </div>
        <a className="button" href="/vendo">
          Publicar venta
        </a>
      </section>
      <div className="section-heading">
        <h2>Mis publicaciones</h2>
        <div className="toggle-group" role="group" aria-label="Filtrar publicaciones">
          <button
            type="button"
            className={listingsFilter === "active" ? "active" : undefined}
            aria-pressed={listingsFilter === "active"}
            onClick={() => changeListingsFilter("active")}
          >
            Activas
          </button>
          <button
            type="button"
            className={listingsFilter === "inactive" ? "active" : undefined}
            aria-pressed={listingsFilter === "inactive"}
            onClick={() => changeListingsFilter("inactive")}
          >
            Inactivas
          </button>
        </div>
      </div>
      <div className="stack">
        {paginatedListings.length === 0 ? (
          <p className="muted">
            {data.listings.length === 0
              ? "Todavía no publicaste."
              : `No tenés publicaciones ${listingsFilter === "active" ? "activas" : "inactivas"}.`}
          </p>
        ) : (
          paginatedListings.map((listing) => (
            <article
              className={`panel dashboard-listing${listing.image_url ? "" : " dashboard-listing-no-image"}`}
              key={listing.id}
            >
              {listing.image_url && (
                <a href={`/publi/${listing.id}`} className="dashboard-listing-image-link">
                  <img
                    className="dashboard-listing-image"
                    src={listing.image_url}
                    alt={
                      listing.card_names
                        ? `Foto de ${listing.card_names}`
                        : "Foto de la publicación"
                    }
                  />
                </a>
              )}
              <div className="dashboard-listing-content">
                <span className="status">{listingStatusLabel(listing.status)}</span>
                <h3>
                  <a href={`/publi/${listing.id}`}>{listing.card_names ?? "Bulk"}</a>
                </h3>
                {listing.description && <p>{listing.description}</p>}
                <p>
                  {listing.claim_count} claims · {money(listing.total_cents)}
                </p>
              </div>
              {listing.status !== "inactive" && (
                <details className="dashboard-listing-menu">
                  <summary aria-label="Opciones de la publicación" title="Opciones">
                    <span aria-hidden="true">•••</span>
                  </summary>
                  <div className="dashboard-listing-menu-popover">
                    <button type="button" onClick={() => deactivateListing(listing.id)}>
                      Desactivar
                    </button>
                  </div>
                </details>
              )}
            </article>
          ))
        )}
        {listingsPageCount > 1 && (
          <nav className="pagination" aria-label="Páginas de publicaciones">
            <button
              type="button"
              disabled={currentListingsPage === 1}
              onClick={() => setListingsPage(currentListingsPage - 1)}
            >
              Anterior
            </button>
            <span>
              Página {currentListingsPage} de {listingsPageCount}
            </span>
            <button
              type="button"
              disabled={currentListingsPage === listingsPageCount}
              onClick={() => setListingsPage(currentListingsPage + 1)}
            >
              Siguiente
            </button>
          </nav>
        )}
      </div>
      <div className="section-heading">
        <h2>Ventas</h2>
        <div className="toggle-group" role="group" aria-label="Filtrar ventas">
          <button
            type="button"
            className={salesFilter === "active" ? "active" : undefined}
            aria-pressed={salesFilter === "active"}
            onClick={() => setSalesFilter("active")}
          >
            Activas
          </button>
          <button
            type="button"
            className={salesFilter === "inactive" ? "active" : undefined}
            aria-pressed={salesFilter === "inactive"}
            onClick={() => setSalesFilter("inactive")}
          >
            Inactivas
          </button>
        </div>
      </div>
      {sales}
      <h2>Mis claims</h2>
      {claims}
    </main>
  );
}
