import { Router } from "express";
import { z } from "zod";
import { db } from "./db.js";
import { requireAuth, requireCompletedProfile } from "./auth.js";

export const listingsRouter = Router();
const cardSchema = z.object({
  cardId: z.string().min(1),
  name: z.string().min(1),
  detail: z.string().trim().max(100).optional(),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative().nullable(),
  playsetPriceCents: z.number().int().nonnegative().nullable(),
});
const createSchema = z
  .object({
    kind: z.enum(["sale", "wanted"]),
    listingType: z.enum(["singles", "bulk"]).default("singles"),
    currency: z.enum(["ARS", "USD"]).default("ARS"),
    buyerPaysShipping: z.boolean().default(false),
    description: z.string().trim().max(500).optional(),
    imageUrls: z.array(z.url()).min(1).max(24).optional(),
    items: z.array(cardSchema),
  })
  .superRefine((value, context) => {
    if (value.kind === "sale" && !value.imageUrls?.length)
      context.addIssue({
        code: "custom",
        path: ["imageUrls"],
        message: "Sale publications require a photo",
      });
    if (value.listingType === "singles" && value.items.length === 0)
      context.addIssue({ code: "custom", path: ["items"], message: "Singles require cards" });
    if (value.listingType === "bulk" && value.items.length === 0)
      context.addIssue({ code: "custom", path: ["items"], message: "Other requires items" });
    if (value.listingType === "bulk" && !value.imageUrls?.length)
      context.addIssue({ code: "custom", path: ["imageUrls"], message: "Bulk requires a photo" });
    if (value.kind === "sale" && value.listingType === "singles")
      value.items.forEach((item, index) => {
        if (item.unitPriceCents == null && item.playsetPriceCents == null)
          context.addIssue({
            code: "custom",
            path: ["items", index],
            message: "At least one price is required",
          });
        if (item.playsetPriceCents != null && item.quantity < 3)
          context.addIssue({
            code: "custom",
            path: ["items", index, "playsetPriceCents"],
            message: "Playset pricing requires at least three units",
          });
      });
    if (value.kind === "sale" && value.listingType === "bulk")
      value.items.forEach((item, index) => {
        if (!item.detail)
          context.addIssue({
            code: "custom",
            path: ["items", index, "detail"],
            message: "Item detail is required",
          });
        if (item.unitPriceCents == null)
          context.addIssue({
            code: "custom",
            path: ["items", index, "unitPriceCents"],
            message: "Item price is required",
          });
      });
    if (value.kind === "wanted" && value.listingType !== "singles")
      context.addIssue({
        code: "custom",
        path: ["listingType"],
        message: "Wanted publications only support singles",
      });
  });

async function serializeListing(id: string, availableItemsOnly = false) {
  await db.execute({
    sql: `UPDATE listings SET status='expired' WHERE id=? AND status='active' AND expires_at <= ?`,
    args: [id, new Date().toISOString()],
  });
  const listing = await db.execute({
    sql: `SELECT l.*, u.name owner_name, u.username owner_username, u.avatar_url FROM listings l JOIN users u ON u.id=l.owner_id WHERE l.id=?`,
    args: [id],
  });
  const row = listing.rows[0];
  if (!row) return null;
  const items = await db.execute({
    sql: `SELECT i.*, card.subtitle, card.set_code,
                 i.quantity - COALESCE(SUM(CASE WHEN c.status != 'cancelled' THEN c.quantity ELSE 0 END),0) available_quantity
          FROM listing_items i
          LEFT JOIN cards card ON card.id=i.card_id
          LEFT JOIN claims c ON c.item_id=i.id
          WHERE i.listing_id=?
          GROUP BY i.id
          ${availableItemsOnly ? "HAVING available_quantity > 0" : ""}`,
    args: [id],
  });
  const images = await db.execute({
    sql: `SELECT url FROM listing_images WHERE listing_id=? ORDER BY position`,
    args: [id],
  });
  const imageUrls = images.rows.map((image) => String(image.url));
  if (!imageUrls.length && row.image_url) imageUrls.push(String(row.image_url));
  return {
    id: row.id,
    kind: row.kind,
    listingType: row.listing_type,
    currency: row.currency,
    buyerPaysShipping: Boolean(row.buyer_pays_shipping),
    description: row.description ? String(row.description) : null,
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
    status: Number(row.is_active) ? row.status : "inactive",
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    seller: {
      id: row.owner_id,
      username: row.owner_username,
      name: row.owner_name,
      avatarUrl: row.avatar_url,
    },
    items: items.rows.map((i) => ({
      id: i.id,
      cardId: i.card_id,
      name: i.card_name,
      subtitle: i.subtitle ? String(i.subtitle) : null,
      setCode: i.set_code ? String(i.set_code) : null,
      detail: i.detail ? String(i.detail) : null,
      quantity: i.quantity,
      availableQuantity: i.available_quantity,
      unitPriceCents: i.unit_price_cents,
      playsetPriceCents: i.playset_price_cents,
    })),
  };
}

listingsRouter.get("/", async (req, res) => {
  await db.execute({
    sql: `UPDATE listings
          SET status='closed'
          WHERE kind='sale' AND status='active'
            AND NOT EXISTS (
              SELECT 1
              FROM listing_items i
              LEFT JOIN claims c ON c.item_id=i.id AND c.status != 'cancelled'
              WHERE i.listing_id=listings.id
              GROUP BY i.id
              HAVING i.quantity > COALESCE(SUM(c.quantity),0)
            )`,
    args: [],
  });
  const result = await db.execute({
    sql: `SELECT id FROM listings
          WHERE kind='sale' AND status='active' AND is_active=1 AND expires_at > ?
          ORDER BY created_at DESC, id DESC`,
    args: [new Date().toISOString()],
  });
  res.json(
    (await Promise.all(result.rows.map((row) => serializeListing(String(row.id), true)))).filter(
      Boolean,
    ),
  );
});
listingsRouter.get("/wanted", async (_req, res) => {
  const result = await db.execute({
    sql: `SELECT id FROM listings
          WHERE kind='wanted' AND status='active' AND is_active=1 AND expires_at > ?
          ORDER BY created_at DESC, id DESC`,
    args: [new Date().toISOString()],
  });
  res.json(
    (await Promise.all(result.rows.map((row) => serializeListing(String(row.id))))).filter(Boolean),
  );
});
listingsRouter.get("/cards/search", async (req, res) => {
  const query = String(req.query.q ?? "").trim();
  if (query.length < 1) return res.json([]);
  const terms = query.split(/\s+/).filter(Boolean).slice(0, 10);
  const escapeLike = (value: string) => value.replaceAll(/([\\%_])/g, "\\$1");
  const termFilters = terms
    .map(() => "(name LIKE ? ESCAPE '\\' OR COALESCE(subtitle, '') LIKE ? ESCAPE '\\')")
    .join(" AND ");
  const termArgs = terms.flatMap((term) => {
    const pattern = `%${escapeLike(term)}%`;
    return [pattern, pattern];
  });
  const escapedQuery = escapeLike(query);
  const result = await db.execute({
    sql: `SELECT id,name,subtitle,set_code,card_number
          FROM (
            SELECT id,name,subtitle,set_code,card_number,
                   ROW_NUMBER() OVER (
                     PARTITION BY name, COALESCE(subtitle, '')
                     ORDER BY set_code, card_number
                   ) AS variant_rank
            FROM cards AS card
            WHERE ${termFilters}
              AND (
                subtitle IS NOT NULL
                OR NOT EXISTS (
                  SELECT 1 FROM cards AS detailed
                  WHERE detailed.name = card.name AND detailed.subtitle IS NOT NULL
                )
              )
          )
          WHERE variant_rank = 1
          ORDER BY CASE
                     WHEN name LIKE ? ESCAPE '\\' THEN 0
                     WHEN name LIKE ? ESCAPE '\\' THEN 1
                     WHEN name LIKE ? ESCAPE '\\' THEN 2
                     WHEN COALESCE(subtitle, '') LIKE ? ESCAPE '\\' THEN 3
                     ELSE 4
                   END,
                   name, subtitle, set_code, card_number
          LIMIT 8`,
    args: [
      ...termArgs,
      escapedQuery,
      `${escapedQuery}%`,
      `%${escapedQuery}%`,
      `%${escapedQuery}%`,
    ],
  });
  res.json(result.rows);
});
listingsRouter.get("/:id", async (req, res) => {
  const value = await serializeListing(req.params.id);
  if (value) {
    res.json(value);
  } else {
    res.status(404).json({ error: "Publication not found" });
  }
});
listingsRouter.post("/", requireAuth, requireCompletedProfile, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid publication", details: parsed.error.flatten() });
  const id = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const storedItems = parsed.data.items;
  const statements = [
    {
      sql: `INSERT INTO listings (id, owner_id, kind, listing_type, currency, buyer_pays_shipping, title, description, image_url, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        req.user!.id,
        parsed.data.kind,
        parsed.data.listingType,
        parsed.data.currency,
        parsed.data.buyerPaysShipping ? 1 : 0,
        "",
        parsed.data.description || null,
        parsed.data.imageUrls?.[0] ?? null,
        now.toISOString(),
        expires.toISOString(),
      ],
    },
    ...(parsed.data.imageUrls ?? []).map((url, position) => ({
      sql: `INSERT INTO listing_images (id, listing_id, url, position) VALUES (?, ?, ?, ?)`,
      args: [crypto.randomUUID(), id, url, position],
    })),
    ...storedItems.flatMap((item) => [
      {
        sql: `INSERT INTO cards (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name`,
        args: [item.cardId, item.name],
      },
      {
        sql: `INSERT INTO listing_items (id, listing_id, card_id, card_name, detail, quantity, unit_price_cents, playset_price_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          crypto.randomUUID(),
          id,
          item.cardId,
          item.name,
          item.detail || null,
          item.quantity,
          item.unitPriceCents,
          item.playsetPriceCents,
        ],
      },
    ]),
  ];
  await db.batch(statements, "write");
  if (parsed.data.kind === "sale") {
    const cardIds = [...new Set(storedItems.map((item) => item.cardId))];
    const placeholders = cardIds.map(() => "?").join(",");
    const matches = await db.execute({
      sql: `SELECT l.owner_id, GROUP_CONCAT(DISTINCT i.card_name) card_names
            FROM listings l
            JOIN listing_items i ON i.listing_id=l.id
            WHERE l.kind='wanted' AND l.status='active' AND l.is_active=1
              AND l.expires_at>? AND l.owner_id!=? AND i.card_id IN (${placeholders})
            GROUP BY l.owner_id`,
      args: [now.toISOString(), req.user!.id, ...cardIds],
    });
    if (matches.rows.length) {
      await db.batch(
        matches.rows.map((match) => ({
          sql: `INSERT INTO notifications (id,user_id,type,listing_id,message,created_at)
                VALUES (?,?,'wanted_match',?,?,?)`,
          args: [
            crypto.randomUUID(),
            String(match.owner_id),
            id,
            `Nueva publicación con ${String(match.card_names)}`,
            now.toISOString(),
          ],
        })),
        "write",
      );
    }
  }
  res.status(201).json(await serializeListing(id));
});
listingsRouter.patch("/:id/deactivate", requireAuth, async (req, res) => {
  const result = await db.execute({
    sql: `UPDATE listings SET is_active=0, deactivated_at=? WHERE id=? AND owner_id=? AND is_active=1`,
    args: [new Date().toISOString(), String(req.params.id), req.user!.id],
  });
  if (result.rowsAffected) {
    res.status(204).end();
  } else {
    res.status(404).json({ error: "Publication not found" });
  }
});
