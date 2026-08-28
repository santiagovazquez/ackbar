import { ListingForm } from "../../components/listing-form";
export default function WantedPage() {
  return (
    <main>
      <h1>Publicar cartas buscadas</h1>
      <p className="muted">Contale a la comunidad qué necesitás.</p>
      <ListingForm kind="wanted" />
    </main>
  );
}
