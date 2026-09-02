import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireCompletedProfile } from "./auth.js";
import { db } from "./db.js";

export const claimsRouter = Router();
claimsRouter.use(requireAuth);
claimsRouter.use(requireCompletedProfile);
const claimSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().positive(),
  pricingMode: z.enum(["unit", "playset"]),
});

claimsRouter.get("/listing/:listingId", async (req, res) => {
  const listing = await db.execute({
    sql: `SELECT owner_id FROM listings WHERE id=?`,
    args: [String(req.params.listingId)],
  });
  if (!listing.rows[0]) return res.status(404).json({ error: "Publication not found" });
  const isOwner = listing.rows[0].owner_id === req.user!.id;
  const result = await db.execute({
    sql: `SELECT c.item_id itemId,
                 SUM(c.quantity) quantity,
                 SUM(c.amount_cents) amountCents,
                 u.id claimantId,
                 u.name claimantName,
                 u.username claimantUsername
          FROM claims c
          JOIN listing_items i ON i.id=c.item_id
          JOIN users u ON u.id=c.user_id
          WHERE i.listing_id=? AND (? OR c.user_id=?) AND c.status != 'cancelled'
          GROUP BY c.item_id, c.user_id
          ORDER BY MIN(c.created_at)`,
    args: [String(req.params.listingId), isOwner ? 1 : 0, req.user!.id],
  });
  res.json(
    isOwner
      ? result.rows
      : result.rows.map(({ itemId, quantity, amountCents }) => ({
          itemId,
          quantity,
          amountCents,
        })),
  );
});

claimsRouter.post("/batch", async (req, res) => {
  const parsed = z.object({ claims: z.array(claimSchema).min(1).max(100) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid claims" });
  const transaction = await db.transaction("write");
  const created: { id: string; amountCents: number }[] = [];
  const listingIds = new Set<string>();
  try {
    for (const { itemId, quantity, pricingMode } of parsed.data.claims) {
      const itemResult = await transaction.execute({
        sql: `SELECT i.*, l.id listing_id, l.owner_id, l.status, l.is_active, l.expires_at, i.quantity - COALESCE(SUM(CASE WHEN c.status != 'cancelled' THEN c.quantity ELSE 0 END),0) available FROM listing_items i JOIN listings l ON l.id=i.listing_id LEFT JOIN claims c ON c.item_id=i.id WHERE i.id=? GROUP BY i.id`,
        args: [itemId],
      });
      const item = itemResult.rows[0];
      if (
        !item ||
        item.status !== "active" ||
        Number(item.is_active) !== 1 ||
        String(item.expires_at) <= new Date().toISOString()
      )
        throw new Error("Publication is not active");
      if (item.owner_id === req.user!.id) throw new Error("You cannot claim your own publication");
      if (pricingMode === "playset" && quantity % 3 !== 0)
        throw new Error("Playset quantity must be a multiple of three");
      if (Number(item.available) < quantity) throw new Error("Not enough units available");
      const price = pricingMode === "playset" ? item.playset_price_cents : item.unit_price_cents;
      if (price == null) throw new Error("Selected pricing mode is unavailable");
      const amount = Number(price) * (pricingMode === "playset" ? quantity / 3 : quantity);
      const id = crypto.randomUUID();
      await transaction.execute({
        sql: `INSERT INTO claims (id, item_id, user_id, quantity, pricing_mode, amount_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [id, itemId, req.user!.id, quantity, pricingMode, amount, new Date().toISOString()],
      });
      await transaction.execute({
        sql: `INSERT INTO notifications (id,user_id,type,listing_id,claim_id,message,created_at)
              VALUES (?,?,'claim',?,?,?,?)`,
        args: [
          crypto.randomUUID(),
          String(item.owner_id),
          String(item.listing_id),
          id,
          `🔒 ${quantity}x ${String(item.card_name)} (${req.user!.name})`,
          new Date().toISOString(),
        ],
      });
      created.push({ id, amountCents: amount });
      listingIds.add(String(item.listing_id));
    }
    for (const listingId of listingIds) {
      await transaction.execute({
        sql: `UPDATE listings SET status='closed' WHERE id=? AND NOT EXISTS (SELECT 1 FROM listing_items i LEFT JOIN claims c ON c.item_id=i.id AND c.status != 'cancelled' WHERE i.listing_id=? GROUP BY i.id HAVING i.quantity > COALESCE(SUM(c.quantity),0))`,
        args: [listingId, listingId],
      });
    }
    await transaction.commit();
    res.status(201).json({
      claims: created,
      amountCents: created.reduce((sum, claim) => sum + claim.amountCents, 0),
    });
  } catch (error) {
    if (!transaction.closed) await transaction.rollback();
    res
      .status(409)
      .json({ error: error instanceof Error ? error.message : "Claims could not be completed" });
  }
});

claimsRouter.post("/", async (req, res) => {
  const parsed = claimSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid claim" });
  const { itemId, quantity, pricingMode } = parsed.data;
  const transaction = await db.transaction("write");
  try {
    const itemResult = await transaction.execute({
      sql: `SELECT i.*, l.id listing_id, l.owner_id, l.status, l.is_active, l.expires_at, i.quantity - COALESCE(SUM(CASE WHEN c.status != 'cancelled' THEN c.quantity ELSE 0 END),0) available FROM listing_items i JOIN listings l ON l.id=i.listing_id LEFT JOIN claims c ON c.item_id=i.id WHERE i.id=? GROUP BY i.id`,
      args: [itemId],
    });
    const item = itemResult.rows[0];
    if (
      !item ||
      item.status !== "active" ||
      Number(item.is_active) !== 1 ||
      String(item.expires_at) <= new Date().toISOString()
    ) {
      await transaction.rollback();
      return res.status(409).json({ error: "Publication is not active" });
    }
    if (item.owner_id === req.user!.id) {
      await transaction.rollback();
      return res.status(409).json({ error: "You cannot claim your own publication" });
    }
    if (pricingMode === "playset" && quantity % 3 !== 0) {
      await transaction.rollback();
      return res.status(400).json({ error: "Playset quantity must be a multiple of three" });
    }
    if (Number(item.available) < quantity) {
      await transaction.rollback();
      return res.status(409).json({ error: "Not enough units available" });
    }
    const price = pricingMode === "playset" ? item.playset_price_cents : item.unit_price_cents;
    if (price == null) {
      await transaction.rollback();
      return res.status(400).json({ error: "Selected pricing mode is unavailable" });
    }
    const amount = Number(price) * (pricingMode === "playset" ? quantity / 3 : quantity);
    const id = crypto.randomUUID();
    await transaction.execute({
      sql: `INSERT INTO claims (id, item_id, user_id, quantity, pricing_mode, amount_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, itemId, req.user!.id, quantity, pricingMode, amount, new Date().toISOString()],
    });
    await transaction.execute({
      sql: `INSERT INTO notifications (id,user_id,type,listing_id,claim_id,message,created_at)
            VALUES (?,?,'claim',?,?,?,?)`,
      args: [
        crypto.randomUUID(),
        String(item.owner_id),
        String(item.listing_id),
        id,
        `🔒 ${quantity}x ${String(item.card_name)} (${req.user!.name})`,
        new Date().toISOString(),
      ],
    });
    await transaction.execute({
      sql: `UPDATE listings SET status='closed' WHERE id=(SELECT listing_id FROM listing_items WHERE id=?) AND NOT EXISTS (SELECT 1 FROM listing_items i LEFT JOIN claims c ON c.item_id=i.id AND c.status != 'cancelled' WHERE i.listing_id=(SELECT listing_id FROM listing_items WHERE id=?) GROUP BY i.id HAVING i.quantity > COALESCE(SUM(c.quantity),0))`,
      args: [itemId, itemId],
    });
    await transaction.commit();
    res.status(201).json({ id, amountCents: amount });
  } catch {
    if (!transaction.closed) await transaction.rollback();
    res.status(409).json({ error: "Claim could not be completed" });
  }
});

claimsRouter.patch("/:id/status", async (req, res) => {
  const body = z.object({ status: z.enum(["delivered", "received"]) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid status" });
  const result = await db.execute({
    sql: `UPDATE claims SET status=? WHERE id=? AND ((?='delivered' AND status='claimed') OR (?='received' AND status='delivered')) AND EXISTS (SELECT 1 FROM listing_items i JOIN listings l ON l.id=i.listing_id WHERE i.id=claims.item_id AND ((?='delivered' AND ((l.kind='sale' AND l.owner_id=?) OR (l.kind='wanted' AND claims.user_id=?))) OR (?='received' AND ((l.kind='sale' AND claims.user_id=?) OR (l.kind='wanted' AND l.owner_id=?)))))`,
    args: [
      body.data.status,
      String(req.params.id),
      body.data.status,
      body.data.status,
      body.data.status,
      req.user!.id,
      req.user!.id,
      body.data.status,
      req.user!.id,
      req.user!.id,
    ],
  });
  if (result.rowsAffected) {
    res.status(204).end();
  } else {
    res.status(403).json({ error: "Status change is not allowed" });
  }
});

claimsRouter.patch("/batch/delivered", async (req, res) => {
  const body = z
    .object({ claimIds: z.array(z.string().min(1)).min(1).max(100) })
    .refine(({ claimIds }) => new Set(claimIds).size === claimIds.length)
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid claims" });

  const placeholders = body.data.claimIds.map(() => "?").join(",");
  const transaction = await db.transaction("write");
  try {
    const claims = await transaction.execute({
      sql: `SELECT c.id,c.user_id,l.id listing_id,l.owner_id,c.status
            FROM claims c
            JOIN listing_items i ON i.id=c.item_id
            JOIN listings l ON l.id=i.listing_id
            WHERE c.id IN (${placeholders})`,
      args: body.data.claimIds,
    });
    const first = claims.rows[0];
    const isOneDelivery =
      claims.rows.length === body.data.claimIds.length &&
      first &&
      claims.rows.every(
        (claim) =>
          claim.status === "claimed" &&
          claim.listing_id === first.listing_id &&
          claim.user_id === first.user_id &&
          claim.owner_id === req.user!.id,
      );
    if (!isOneDelivery) {
      await transaction.rollback();
      return res.status(403).json({ error: "Delivery is not allowed" });
    }
    await transaction.execute({
      sql: `UPDATE claims SET status='delivered' WHERE id IN (${placeholders})`,
      args: body.data.claimIds,
    });
    await transaction.commit();
    res.status(204).end();
  } catch {
    if (!transaction.closed) await transaction.rollback();
    res.status(409).json({ error: "Claims could not be delivered together" });
  }
});
