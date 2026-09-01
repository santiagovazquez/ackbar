"use client";

import type { Listing } from "@swu/shared";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDuration } from "../lib/format-duration";
import { HomeTabs } from "./home-tabs";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");

const setCodeFor = (item: Listing["items"][number]) => {
  if (item.setCode) return item.setCode;
  return item.cardId.match(/^([A-Z0-9]+)_\d+$/i)?.[1]?.toUpperCase() ?? null;
};

export function WantedTable({ listings }: { listings: Listing[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    return listings.flatMap((listing) =>
      listing.items
        .filter((item) =>
          normalize(
            [item.name, item.subtitle, setCodeFor(item), listing.seller.name]
              .filter(Boolean)
              .join(" "),
          ).includes(normalizedQuery),
        )
        .map((item) => ({ listing, item })),
    );
  }, [listings, query]);

  return (
    <>
      <HomeTabs active="wanted" query={query} onQueryChange={setQuery} />
      <section className="market" aria-label="Cartas buscadas">
        {rows.length ? (
          <div className="market-table-wrap">
            <table className="market-table wanted-table">
              <thead>
                <tr>
                  <th>Cant.</th>
                  <th>Carta</th>
                  <th>Buscada por</th>
                  <th>Publicada</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ listing, item }) => {
                  const setCode = setCodeFor(item);
                  return (
                    <tr
                      key={item.id}
                      className="wanted-row"
                      tabIndex={0}
                      role="link"
                      aria-label={`Ver búsqueda de ${listing.seller.name}`}
                      onClick={() => router.push(`/publi/${listing.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(`/publi/${listing.id}`);
                        }
                      }}
                    >
                      <td className="wanted-quantity">{item.quantity}</td>
                      <td className="market-article">
                        <span className="card-name">
                          {item.name}
                          {setCode && <small className="card-set">{setCode}</small>}
                        </span>
                        {item.subtitle && <small className="card-subtitle">{item.subtitle}</small>}
                      </td>
                      <td className="wanted-person">{listing.seller.name}</td>
                      <td>
                        <time dateTime={listing.createdAt}>
                          {formatDuration(listing.createdAt)}
                        </time>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-feed">
            <h2>
              {listings.length ? "No encontramos resultados" : "Todavía no hay cartas buscadas"}
            </h2>
            <p className="muted">
              {listings.length
                ? "Probá con otra carta o persona."
                : "Las nuevas búsquedas aparecerán acá."}
            </p>
          </div>
        )}
      </section>
    </>
  );
}
