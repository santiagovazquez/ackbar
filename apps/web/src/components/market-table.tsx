"use client";

import { useMemo, useState } from "react";
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

export function MarketTable({ listings }: { listings: Listing[] }) {
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () => listings.flatMap((listing) => listing.items.map((item) => ({ listing, item }))),
    [listings],
  );
  const filteredRows = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    if (!normalizedQuery) return rows;
    return rows.filter(({ listing, item }) =>
      normalize([item.name, item.detail, listing.description].filter(Boolean).join(" ")).includes(
        normalizedQuery,
      ),
    );
  }, [query, rows]);

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

      {filteredRows.length ? (
        <div className="market-table-wrap">
          <table className="market-table">
            <thead>
              <tr>
                <th>Cantidad</th>
                <th>Artículo</th>
                <th>Detalle</th>
                <th>Precio unitario</th>
                <th>Precio playset</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(({ listing, item }) => {
                const isOther = listing.listingType === "bulk";
                return (
                  <tr key={`${listing.id}-${item.id}`}>
                    <td className="market-quantity">{isOther ? "" : item.availableQuantity}</td>
                    {isOther ? (
                      <td colSpan={2} className="market-article">
                        {item.detail || item.name}
                      </td>
                    ) : (
                      <>
                        <td className="market-article">{item.name}</td>
                        <td className="market-detail">{item.detail || "—"}</td>
                      </>
                    )}
                    <td className="market-price">{money(item.unitPriceCents, listing.currency)}</td>
                    <td className="market-price">
                      {isOther ? "—" : money(item.playsetPriceCents, listing.currency)}
                    </td>
                    <td>
                      <a className="market-link" href={`/publi/${listing.id}`}>
                        Ver publicación <span aria-hidden="true">→</span>
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-feed">
          <h2>{rows.length ? "No encontramos resultados" : "Todavía no hay artículos en venta"}</h2>
          <p className="muted">
            {rows.length
              ? "Probá con otro nombre o artículo."
              : "Las nuevas publicaciones aparecerán acá."}
          </p>
        </div>
      )}
    </section>
  );
}
