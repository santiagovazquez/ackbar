"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function HomeTabs({
  active,
  query,
  onQueryChange,
}: {
  active: "listings" | "wanted";
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mobileSearchOpen) searchInput.current?.focus();
  }, [mobileSearchOpen]);

  return (
    <div className="home-subnav">
      <div className="home-subnav-inner">
        <nav className="home-tabs" aria-label="Secciones del mercado">
          <Link href="/" aria-current={active === "listings" ? "page" : undefined}>
            Publicaciones
          </Link>
          <Link href="/busquedas" aria-current={active === "wanted" ? "page" : undefined}>
            Búsquedas
          </Link>
        </nav>
        <label className={`market-search${mobileSearchOpen ? " mobile-search-open" : ""}`}>
          <span className="visually-hidden">
            {active === "listings" ? "Buscar por artículo o carta" : "Buscar por carta o persona"}
          </span>
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="m16 16 4 4" />
          </svg>
          <input
            ref={searchInput}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={
              active === "listings" ? "Buscar artículo o carta…" : "Buscar carta o persona…"
            }
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setMobileSearchOpen(false);
                searchInput.current?.blur();
              }
            }}
          />
        </label>
        <button
          className="mobile-search-toggle"
          type="button"
          aria-label={mobileSearchOpen ? "Cerrar buscador" : "Abrir buscador"}
          aria-expanded={mobileSearchOpen}
          onClick={() => setMobileSearchOpen((open) => !open)}
        >
          {mobileSearchOpen ? (
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="m16 16 4 4" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
