import { WantedTable } from "../../components/wanted-table";
import { getWantedListings } from "../../lib/api";

export default async function SearchesPage() {
  const listings = await getWantedListings();

  return (
    <main className="home-market">
      <WantedTable listings={listings} />
    </main>
  );
}
