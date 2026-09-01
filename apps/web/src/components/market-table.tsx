"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Currency, Listing } from "@swu/shared";
import { formatDuration } from "../lib/format-duration";

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

const setCodeFor = (item: Listing["items"][number]) => {
  if (item.setCode) return item.setCode;
  const match = item.cardId.match(/^([A-Z0-9]+)_\d+$/i);
  return match?.[1]?.toUpperCase() ?? null;
};

export function MarketTable({ listings }: { listings: Listing[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const filteredListings = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    if (!normalizedQuery) return listings;

    return listings.flatMap((listing) => {
      const items = listing.items.filter((item) =>
        normalize(
          [item.name, setCodeFor(item), item.detail, listing.description].filter(Boolean).join(" "),
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
                <th className="market-image-heading" aria-label="Imagen" />
                <th className="market-quantity-heading" aria-label="Cantidad" />
                <th>Artículo</th>
                <th className="market-price market-unit-price" aria-label="Precio unitario">
                  Unidad
                </th>
                <th className="market-price market-playset-price" aria-label="Precio playset">
                  PS
                </th>
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
                  <td colSpan={5}>
                    <div className="market-publication-summary">
                      <span className="market-publication-meta">
                        <strong>{listing.seller.name}</strong>
                        <span aria-hidden="true">·</span>
                        <time dateTime={listing.createdAt}>
                          {formatDuration(listing.createdAt)}
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
                  const setCode = setCodeFor(item);
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
                        <td className="market-article">{item.detail || item.name}</td>
                      ) : (
                        <td className="market-article">
                          <span className="card-name">
                            {item.name}
                            {setCode && <small className="card-set">{setCode}</small>}
                          </span>
                          {item.detail && <small className="card-detail">{item.detail}</small>}
                        </td>
                      )}
                      <td className="market-price market-unit-price">
                        <span>{money(item.unitPriceCents, listing.currency)}</span>
                        {!isOther && item.playsetPriceCents != null && (
                          <span className="market-mobile-playset-price">
                            {money(item.playsetPriceCents, listing.currency)} (PS)
                          </span>
                        )}
                      </td>
                      <td className="market-price market-playset-price">
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
