import { migrate, db } from "./db.js";

const catalogUrl = process.env.SWU_CARD_CATALOG_URL ?? "https://api.swuapi.com/export/all";

interface CatalogCard {
  id: string;
  name: string;
  subtitle: string | null;
  setCode: string;
  cardNumber: string;
}

function isCatalogCard(value: unknown): value is CatalogCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Record<string, unknown>;
  return (
    typeof card.id === "string" &&
    typeof card.name === "string" &&
    (typeof card.subtitle === "string" || card.subtitle === null) &&
    typeof card.setCode === "string" &&
    typeof card.cardNumber === "string"
  );
}

await migrate();

try {
  console.log(`Downloading the SWU card catalog from ${catalogUrl}...`);
  const response = await fetch(catalogUrl, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Card catalog request failed with HTTP ${response.status}`);

  const payload: unknown = await response.json();
  const rawCards =
    payload && typeof payload === "object" && Array.isArray((payload as { cards?: unknown }).cards)
      ? (payload as { cards: unknown[] }).cards
      : null;
  if (!rawCards) throw new Error("Card catalog response does not contain a cards array");

  // The export includes separate UUIDs for print variants. Its card ID identifies
  // the underlying playable card, which is what a marketplace listing needs.
  const cards = [
    ...new Map(rawCards.filter(isCatalogCard).map((card) => [card.id, card])).values(),
  ];
  if (cards.length === 0) throw new Error("Card catalog did not contain any valid cards");

  const batchSize = 250;
  for (let index = 0; index < cards.length; index += batchSize) {
    await db.batch(
      cards.slice(index, index + batchSize).map((card) => ({
        sql: `INSERT INTO cards (id,name,subtitle,set_code,card_number)
              VALUES (?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET
                name=excluded.name,
                subtitle=excluded.subtitle,
                set_code=excluded.set_code,
                card_number=excluded.card_number`,
        args: [card.id, card.name, card.subtitle, card.setCode, card.cardNumber],
      })),
      "write",
    );
  }

  console.log(`Schema ready; imported ${cards.length} SWU cards.`);
} finally {
  db.close();
}
