import { getListings } from "../lib/api";
import { MarketTable } from "../components/market-table";

export default async function Home() {
  const listings = await getListings();

  return (
    <main className="home-market">
      <MarketTable listings={listings} />
    </main>
  );
}
