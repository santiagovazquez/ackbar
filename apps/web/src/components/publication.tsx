import type { Listing } from "@swu/shared";
import { ClaimControl } from "./claim-control";
import { ImageCarousel } from "./image-carousel";
import { formatDuration } from "../lib/format-duration";
import { OwnerShareListingButton } from "./share-listing-button";

export function Publication({ listing }: { listing: Listing }) {
  const title =
    listing.listingType === "bulk" ? "Otros artículos" : (listing.items[0]?.name ?? "Publicación");
  return (
    <article className="publication">
      <OwnerShareListingButton
        ownerId={listing.seller.id}
        listingId={listing.id}
        title={title}
        itemNames={listing.items.map((item) =>
          listing.listingType === "bulk" ? (item.detail ?? item.name) : item.name,
        )}
      />
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
