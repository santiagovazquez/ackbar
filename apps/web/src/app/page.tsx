import type { Currency, Listing } from "@swu/shared";
import { getListings } from "../lib/api";
import { SellLink } from "../components/sell-link";

const money = (cents: number | null, currency: Currency) =>
  cents == null
    ? null
    : new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(cents / 100);

function listingPrice(listing: Listing) {
  const prices = listing.items
    .flatMap((item) => [item.unitPriceCents, item.playsetPriceCents])
    .filter((price): price is number => price != null);
  return prices.length ? money(Math.min(...prices), listing.currency) : null;
}

function listingName(listing: Listing) {
  if (listing.listingType === "bulk") return "Otros artículos";
  const names = listing.items.slice(0, 2).map((item) => item.name);
  return `${names.join(", ")}${listing.items.length > 2 ? ` +${listing.items.length - 2}` : ""}`;
}

export default async function Home() {
  const listings = await getListings();

  return (
    <main>
      <section className="hero">
        <p>Mercado de la comunidad</p>
        <h1>Las cartas encuentran a su próximo jugador.</h1>
        <p>
          Publicá singles de Star Wars Unlimited, hacé tu claim y construí tu reputación dentro de
          la comunidad.
        </p>
        <div className="actions">
          <SellLink>Publicar venta</SellLink>
        </div>
      </section>
      <section className="feed" aria-labelledby="latest-publications">
        <div className="feed-heading">
          <div>
            <p className="eyebrow">COMUNIDAD</p>
            <h2 id="latest-publications">Últimas publicaciones</h2>
          </div>
          <p className="muted">Las más nuevas aparecen primero</p>
        </div>
        {listings.length ? (
          <div className="listing-grid">
            {listings.map((listing) => {
              const price = listingPrice(listing);
              return (
                <a className="listing-card" href={`/publi/${listing.id}`} key={listing.id}>
                  <div className="listing-card-image">
                    {listing.imageUrl ? (
                      <img src={listing.imageUrl} alt="" />
                    ) : (
                      <span aria-hidden="true">SWU</span>
                    )}
                    <span className="listing-kind sale">VENTA</span>
                  </div>
                  <div className="listing-card-body">
                    <h3>{listingName(listing)}</h3>
                    {listing.description && (
                      <p className="listing-description">{listing.description}</p>
                    )}
                    {price && (
                      <p className="listing-price">
                        {listing.items.length > 1 || listing.listingType === "singles"
                          ? "Desde "
                          : ""}
                        {price}
                      </p>
                    )}
                    <p className="listing-seller">{listing.seller.name}</p>
                    <time dateTime={listing.createdAt}>
                      {new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(
                        new Date(listing.createdAt),
                      )}
                    </time>
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          <div className="empty-feed">
            <h3>Todavía no hay publicaciones activas</h3>
            <p className="muted">Sé la primera persona en publicar cartas.</p>
            <SellLink>Crear publicación</SellLink>
          </div>
        )}
      </section>
    </main>
  );
}
