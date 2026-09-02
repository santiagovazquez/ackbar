import type { Metadata } from "next";
import { getListing } from "../../../lib/api";
import { Publication } from "../../../components/publication";
import { listingPreviewDescription } from "../../../lib/listing-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const listing = await getListing(id);
    const name = listing.listingType === "bulk" ? "Otros artículos" : listing.items[0]?.name;
    const title = name ?? "Publicación en Ackbar";
    const description = listingPreviewDescription(listing);
    const images = listing.imageUrls.length ? [{ url: listing.imageUrls[0]! }] : undefined;
    return {
      title: `${name ?? "Publicación"} · Ackbar`,
      description,
      openGraph: {
        title,
        description,
        images,
      },
      twitter: { card: "summary_large_image", title, description, images: listing.imageUrls[0] },
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
      <Publication listing={listing} />
    </main>
  );
}
