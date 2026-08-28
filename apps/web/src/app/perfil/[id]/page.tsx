import { apiUrl } from "../../../lib/api";
export default async function Profile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await fetch(`${apiUrl}/users/${id}`, { next: { revalidate: 60 } });
  if (!response.ok)
    return (
      <main>
        <h1>Perfil no encontrado</h1>
      </main>
    );
  const user = await response.json();
  return (
    <main>
      <h1>{user.name}</h1>
      <div className="grid">
        <section className="panel">
          <h2>Actividad</h2>
          <p>
            {user.sales ?? 0} ventas · {user.purchases ?? 0} compras
          </p>
        </section>
        <section className="panel">
          <h2>Como vendedor</h2>
          <p>
            🟢 {user.seller_positive ?? 0} · ⚪ {user.seller_neutral ?? 0} · 🔴{" "}
            {user.seller_negative ?? 0}
          </p>
        </section>
        <section className="panel">
          <h2>Como comprador</h2>
          <p>
            🟢 {user.buyer_positive ?? 0} · ⚪ {user.buyer_neutral ?? 0} · 🔴{" "}
            {user.buyer_negative ?? 0}
          </p>
        </section>
      </div>
      <h2>Publicaciones activas</h2>
      <div className="grid">
        {user.listings?.length ? (
          user.listings.map(
            (listing: { id: string; kind: string; title: string; image_url: string | null }) => (
              <a className="panel" href={`/publi/${listing.id}`} key={listing.id}>
                {listing.image_url && <img src={listing.image_url} alt="" />}
                <small>{listing.kind === "sale" ? "VENTA" : "BÚSQUEDA"}</small>
                <h3>{listing.title}</h3>
              </a>
            ),
          )
        ) : (
          <p className="muted">No tiene publicaciones activas.</p>
        )}
      </div>
    </main>
  );
}
