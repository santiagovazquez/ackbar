import type { Listing } from "@swu/shared";
import { ClaimControl } from "./claim-control";
import { ImageCarousel } from "./image-carousel";
import { formatDuration } from "../lib/format-duration";

export function Publication({ listing }: { listing: Listing }) {
  return (
    <article className="publication">
      {listing.imageUrls.length > 0 && <ImageCarousel urls={listing.imageUrls} />}
      {listing.buyerPaysShipping && (
        <span className="shipping-pill">Envío a cargo del comprador</span>
      )}
      <p className="publication-byline">
        Publicado por{" "}
        <a
          href={
            listing.seller.username ? `/${listing.seller.username}` : `/perfil/${listing.seller.id}`
          }
        >
          {listing.seller.name}
        </a>{" "}
        <time dateTime={listing.createdAt}>{formatDuration(listing.createdAt)}</time>
      </p>
      {listing.description && <p className="listing-detail-description">{listing.description}</p>}
      <ClaimControl listing={listing} />
    </article>
  );
}
