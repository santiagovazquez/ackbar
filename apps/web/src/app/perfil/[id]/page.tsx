import type { Listing } from "@swu/shared";
import { Publication } from "../../../components/publication";
import { apiUrl, getListing } from "../../../lib/api";

const ReputationSummary = ({
  label,
  positive,
  neutral,
  negative,
}: {
  label: string;
  positive: number;
  neutral: number;
  negative: number;
}) => (
  <div className="dashboard-reputation">
    <span>{label}</span>
    <div
      className="dashboard-reputation-values"
      aria-label={`${label}: ${positive} positivas, ${neutral} neutrales y ${negative} negativas`}
    >
      <strong className="positive">
        <i aria-hidden="true" />
        {positive}
      </strong>
      <strong className="neutral">
        <i aria-hidden="true" />
        {neutral}
      </strong>
      <strong className="negative">
        <i aria-hidden="true" />
        {negative}
      </strong>
    </div>
  </div>
);

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
  const listings = (
    await Promise.all(
      (user.listings ?? []).map(async ({ id }: { id: string }) => {
        try {
          return await getListing(id);
        } catch {
          return null;
        }
      }),
    )
  ).filter((listing: Listing | null): listing is Listing => listing !== null);
  return (
    <main>
      <section className="panel dashboard-overview">
        <div className="dashboard-overview-user">
          <h1>{user.name}</h1>
          <div className="dashboard-overview-stats" aria-label="Resumen de actividad">
            <span>
              <strong>{user.sales ?? 0}</strong> ventas
            </span>
            <span>
              <strong>{user.purchases ?? 0}</strong> compras
            </span>
          </div>
        </div>
        <div className="dashboard-reputations">
          <ReputationSummary
            label="Como vendedor"
            positive={user.seller_positive ?? 0}
            neutral={user.seller_neutral ?? 0}
            negative={user.seller_negative ?? 0}
          />
          <ReputationSummary
            label="Como comprador"
            positive={user.buyer_positive ?? 0}
            neutral={user.buyer_neutral ?? 0}
            negative={user.buyer_negative ?? 0}
          />
        </div>
      </section>
      <h2>Publicaciones activas</h2>
      <div className="profile-publications">
        {listings.length ? (
          listings.map((listing) => <Publication listing={listing} key={listing.id} />)
        ) : (
          <p className="muted">No tiene publicaciones activas.</p>
        )}
      </div>
    </main>
  );
}
