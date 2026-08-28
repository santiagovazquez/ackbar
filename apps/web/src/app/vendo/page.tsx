import { ListingForm } from "../../components/listing-form";
export default function SellPage() {
  return (
    <main>
      <h1>Publicar una venta</h1>
      <p className="muted">La publicación estará activa durante siete días.</p>
      <ListingForm kind="sale" />
    </main>
  );
}
