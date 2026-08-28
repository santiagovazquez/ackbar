import type { Metadata } from "next";
import { getListing } from "../../../lib/api";
import { ClaimControl } from "../../../components/claim-control";
const money = (cents: number | null) =>
  cents == null
    ? "—"
    : new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 0,
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
      .map((item) => `${item.quantity}× ${item.name} · ${money(item.unitPriceCents)}`)
      .join(" | ");
    return {
      title: `${listing.title} · SWU Mercado`,
      description: lines,
      openGraph: {
        title: listing.title,
        description: lines,
        images: listing.imageUrl ? [{ url: listing.imageUrl }] : [],
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
        {listing.imageUrl && <img src={listing.imageUrl} alt="Cartas de la publicación" />}
        <p className="muted">
          {listing.kind === "sale" ? "VENTA" : "BÚSQUEDA"} · {listing.status.toUpperCase()}
        </p>
        <h1>{listing.title}</h1>
        <p>
          Publicado por <a href={`/perfil/${listing.seller.id}`}>{listing.seller.name}</a>
        </p>
        {listing.items.map((item) => (
          <section key={item.id} className={item.availableQuantity === 0 ? "locked" : ""}>
            <h2>
              {item.availableQuantity === 0 ? "🔒 " : ""}
              {item.name}
            </h2>
            <p>
              {item.availableQuantity} de {item.quantity} disponibles · unidad{" "}
              {money(item.unitPriceCents)}
              {item.playsetPriceCents != null && ` · playset ${money(item.playsetPriceCents)}`}
            </p>
            {listing.status === "active" && <ClaimControl item={item} />}
          </section>
        ))}
      </article>
    </main>
  );
}
