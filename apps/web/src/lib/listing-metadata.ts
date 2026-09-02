import type { Currency, Listing, ListingItem } from "@swu/shared";

function trimTrailingZeroes(value: number): string {
  return value.toFixed(3).replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, "");
}

export function formatPreviewPrice(cents: number | null, currency: Currency): string | null {
  if (cents == null) return null;

  const amount = cents / 100;
  if (currency === "ARS") {
    return amount >= 1000
      ? `${trimTrailingZeroes(amount / 1000)}k`
      : new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(amount);
  }

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatSingle(item: ListingItem, currency: Currency): string {
  const price = formatPreviewPrice(item.unitPriceCents, currency);
  const playsetPrice = formatPreviewPrice(item.playsetPriceCents, currency);
  return [
    `${item.quantity}x ${item.name}${item.setCode ? ` (${item.setCode})` : ""}`,
    price,
    playsetPrice ? `PS ${playsetPrice}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function listingPreviewDescription(listing: Listing): string {
  const summary =
    listing.listingType === "singles"
      ? listing.items.map((item) => formatSingle(item, listing.currency)).join(", ")
      : listing.items
          .map((item) => {
            const price = formatPreviewPrice(item.unitPriceCents, listing.currency);
            return [item.detail, price].filter(Boolean).join(" ");
          })
          .join(", ");

  return [summary, listing.description?.trim()].filter(Boolean).join("\n");
}
