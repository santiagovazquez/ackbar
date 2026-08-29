import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { config } from "./config.js";
import { db, migrate } from "./db.js";

const itemSchema = z.object({
  id: z.string().min(1),
  cardId: z.string().min(1),
  name: z.string().min(1),
  detail: z.string().trim().min(1).max(100).optional(),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative().nullable(),
  playsetPriceCents: z.number().int().nonnegative().nullable().default(null),
});

const listingSchema = z
  .object({
    id: z.string().min(1),
    listingType: z.enum(["singles", "bulk"]),
    currency: z.enum(["ARS", "USD"]),
    buyerPaysShipping: z.boolean().default(false),
    description: z.string().trim().min(1).max(500),
    imageUrls: z.array(z.url()).min(1).max(24),
    createdAt: z.iso.datetime({ offset: true }).optional(),
    expiresInDays: z.number().int().positive().default(30),
    items: z.array(itemSchema).min(1),
  })
  .superRefine((listing, context) => {
    listing.items.forEach((item, index) => {
      if (
        listing.listingType === "singles" &&
        item.unitPriceCents == null &&
        item.playsetPriceCents == null
      )
        context.addIssue({
          code: "custom",
          path: ["items", index],
          message: "A single needs a unit or playset price",
        });
      if (listing.listingType === "bulk" && (!item.detail || item.unitPriceCents == null))
        context.addIssue({
          code: "custom",
          path: ["items", index],
          message: "An 'other' item needs detail and a unit price",
        });
    });
  });

const seedSchema = z.object({
  seller: z.object({
    id: z.string().min(1),
    email: z.email(),
    name: z.string().min(1),
    avatarUrl: z.url().nullable().default(null),
  }),
  listings: z.array(listingSchema),
});

if (process.env.NODE_ENV === "production" || !config.databaseUrl.startsWith("file:")) {
  throw new Error(
    `Local listing seeds only support file: databases (received ${config.databaseUrl.split(":")[0]}:)`,
  );
}

const inputPath = resolve(process.argv[2] ?? "seeds/local-listings.json");

try {
  const seed = seedSchema.parse(JSON.parse(await readFile(inputPath, "utf8")));
  await migrate();

  await db.execute({
    sql: `INSERT INTO users (id, google_sub, email, name, avatar_url)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET email=excluded.email, name=excluded.name, avatar_url=excluded.avatar_url`,
    args: [
      seed.seller.id,
      `local-seed:${seed.seller.id}`,
      seed.seller.email,
      seed.seller.name,
      seed.seller.avatarUrl,
    ],
  });

  for (const listing of seed.listings) {
    const createdAt = listing.createdAt ? new Date(listing.createdAt) : new Date();
    const expiresAt = new Date(createdAt.getTime() + listing.expiresInDays * 86_400_000);
    await db.batch(
      [
        { sql: `DELETE FROM listing_images WHERE listing_id=?`, args: [listing.id] },
        { sql: `DELETE FROM listing_items WHERE listing_id=?`, args: [listing.id] },
        {
          sql: `INSERT INTO listings
                (id, owner_id, kind, listing_type, currency, buyer_pays_shipping, title, description,
                 image_url, status, created_at, expires_at, deleted_at)
                VALUES (?, ?, 'sale', ?, ?, ?, '', ?, ?, 'active', ?, ?, NULL)
                ON CONFLICT(id) DO UPDATE SET
                  owner_id=excluded.owner_id, listing_type=excluded.listing_type,
                  currency=excluded.currency, buyer_pays_shipping=excluded.buyer_pays_shipping,
                  description=excluded.description, image_url=excluded.image_url, status='active',
                  created_at=excluded.created_at, expires_at=excluded.expires_at, deleted_at=NULL`,
          args: [
            listing.id,
            seed.seller.id,
            listing.listingType,
            listing.currency,
            listing.buyerPaysShipping ? 1 : 0,
            listing.description,
            listing.imageUrls[0]!,
            createdAt.toISOString(),
            expiresAt.toISOString(),
          ],
        },
        ...listing.imageUrls.map((url, position) => ({
          sql: `INSERT INTO listing_images (id, listing_id, url, position) VALUES (?, ?, ?, ?)`,
          args: [`${listing.id}:image:${position}`, listing.id, url, position],
        })),
        ...listing.items.flatMap((item) => [
          {
            sql: `INSERT INTO cards (id, name) VALUES (?, ?)
                  ON CONFLICT(id) DO UPDATE SET name=excluded.name`,
            args: [item.cardId, item.name],
          },
          {
            sql: `INSERT INTO listing_items
                  (id, listing_id, card_id, card_name, detail, quantity, unit_price_cents, playset_price_cents)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              item.id,
              listing.id,
              item.cardId,
              item.name,
              item.detail ?? null,
              item.quantity,
              item.unitPriceCents,
              item.playsetPriceCents,
            ],
          },
        ]),
      ],
      "write",
    );
  }

  console.log(`Imported ${seed.listings.length} local listing(s) from ${inputPath}.`);
} finally {
  db.close();
}
