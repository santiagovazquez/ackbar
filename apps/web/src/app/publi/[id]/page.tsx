import type { Metadata } from "next";
import { getListing } from "../../../lib/api";
import { ClaimControl } from "../../../components/claim-control";
import { formatDuration } from "../../../lib/format-duration";
import { ImageCarousel } from "../../../components/image-carousel";
import type { Currency } from "@swu/shared";
const money = (cents: number | null, currency: Currency) =>
  cents == null
    ? "—"
    : new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency,
      }).format(cents / 100);
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const listing = await getListing(id);
    const lines = listing.items
      .slice(0, 4)
      .map((item) =>
        listing.listingType === "bulk"
          ? `${item.detail} · ${money(item.unitPriceCents, listing.currency)}`
          : `${item.quantity}× ${item.name}${item.detail ? ` (${item.detail})` : ""} · ${money(item.unitPriceCents, listing.currency)}`,
      )
      .join(" | ");
    const name = listing.listingType === "bulk" ? "Otros artículos" : listing.items[0]?.name;
    return {
      title: `${name ?? "Publicación"} · SWU Mercado`,
      description: listing.description ?? lines,
      openGraph: {
        title: name ?? "Publicación en SWU Mercado",
        description: listing.description ?? lines,
        images: listing.imageUrls.map((url) => ({ url })),
      },
    };
  } catch {
    return { title: "Publicación no encontrada" };
  }
}
export default async function PublicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = await getListing(id);
  return (
    <main>
      <article className="publication">
        {listing.imageUrls.length > 0 && <ImageCarousel urls={listing.imageUrls} />}
        {listing.buyerPaysShipping && (
          <span className="shipping-pill">Envío a cargo del comprador</span>
        )}
        <p className="publication-byline">
          Publicado por{" "}
          <a
            href={
              listing.seller.username
                ? `/${listing.seller.username}`
                : `/perfil/${listing.seller.id}`
            }
          >
            {listing.seller.name}
          </a>{" "}
          <time dateTime={listing.createdAt}>{formatDuration(listing.createdAt)}</time>
        </p>
        {listing.description && <p className="listing-detail-description">{listing.description}</p>}
        <ClaimControl listing={listing} />
      </article>
    </main>
  );
}
