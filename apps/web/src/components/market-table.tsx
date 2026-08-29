"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Currency, Listing } from "@swu/shared";

const money = (cents: number | null, currency: Currency) =>
  cents == null
    ? "—"
    : new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(cents / 100);

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");

const publicationDate = (value: string) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value));

export function MarketTable({ listings }: { listings: Listing[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const filteredListings = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    if (!normalizedQuery) return listings;

    return listings.flatMap((listing) => {
      const items = listing.items.filter((item) =>
        normalize(
          [item.name, item.subtitle, item.detail, listing.description].filter(Boolean).join(" "),
        ).includes(normalizedQuery),
      );
      return items.length ? [{ ...listing, items }] : [];
    });
  }, [listings, query]);

  const openListing = (listingId: string) => router.push(`/publi/${listingId}`);

  return (
    <section className="market" aria-labelledby="market-title">
      <div className="market-heading">
        <div>
          <p className="eyebrow">MERCADO</p>
          <h1 id="market-title">Artículos en venta</h1>
        </div>
        <label className="market-search">
          <span className="visually-hidden">Buscar por artículo o nombre de carta</span>
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="m16 16 4 4" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar artículo o carta…"
          />
        </label>
      </div>

      {filteredListings.length ? (
        <div className="market-table-wrap">
          <table className="market-table">
            <thead>
              <tr>
                <th aria-label="Imagen">Foto</th>
                <th>Cantidad</th>
                <th>Artículo</th>
                <th>Detalle</th>
                <th>Precio unitario</th>
                <th>Precio playset</th>
              </tr>
            </thead>
            {filteredListings.map((listing) => (
              <tbody
                key={listing.id}
                className="market-listing-group"
                tabIndex={0}
                role="link"
                aria-label={`Ver publicación de ${listing.seller.name}`}
                onClick={() => openListing(listing.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openListing(listing.id);
                  }
                }}
              >
                <tr className="market-publication-intro">
                  <td colSpan={6}>
                    <div className="market-publication-summary">
                      <span className="market-publication-meta">
                        <strong>{listing.seller.name}</strong>
                        <span aria-hidden="true">·</span>
                        <time dateTime={listing.createdAt}>
                          Publicado el {publicationDate(listing.createdAt)}
                        </time>
                      </span>
                      {listing.description && (
                        <span
                          className="market-publication-description"
                          title={listing.description}
                        >
                          {listing.description}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
                {listing.items.map((item, index) => {
                  const isOther = listing.listingType === "bulk";
                  return (
                    <tr key={item.id}>
                      {index === 0 && (
                        <td className="market-thumbnail-cell" rowSpan={listing.items.length}>
                          {listing.imageUrls[0] || listing.imageUrl ? (
                            <img
                              src={listing.imageUrls[0] || listing.imageUrl || ""}
                              alt=""
                              className="market-thumbnail"
                            />
                          ) : (
                            <span className="market-thumbnail-placeholder" aria-hidden="true">
                              SWU
                            </span>
                          )}
                        </td>
                      )}
                      <td className="market-quantity">{isOther ? "" : item.availableQuantity}</td>
                      {isOther ? (
                        <td colSpan={2} className="market-article">
                          {item.detail || item.name}
                        </td>
                      ) : (
                        <>
                          <td className="market-article">
                            <span className="card-name">{item.name}</span>
                            {item.subtitle && (
                              <small className="card-subtitle">{item.subtitle}</small>
                            )}
                          </td>
                          <td className="market-detail">{item.detail || "—"}</td>
                        </>
                      )}
                      <td className="market-price">
                        {money(item.unitPriceCents, listing.currency)}
                      </td>
                      <td className="market-price">
                        {isOther ? "—" : money(item.playsetPriceCents, listing.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      ) : (
        <div className="empty-feed">
          <h2>
            {listings.length ? "No encontramos resultados" : "Todavía no hay artículos en venta"}
          </h2>
          <p className="muted">
            {listings.length
              ? "Probá con otro nombre o artículo."
              : "Las nuevas publicaciones aparecerán acá."}
          </p>
        </div>
      )}
    </section>
  );
}
