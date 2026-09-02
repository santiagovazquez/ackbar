import { Router } from "express";
import { z } from "zod";
import { db } from "./db.js";
import {
  authenticateGoogleToken,
  authenticateLocalToken,
  createSession,
  destroySession,
  localAuthToken,
  requireAuth,
} from "./auth.js";
import { config } from "./config.js";
import { isReservedProfileUsername } from "@swu/shared";

export const usersRouter = Router();
usersRouter.post("/session/google", async (req, res) => {
  const credential = z.object({ credential: z.string().min(1) }).safeParse(req.body);
  if (!credential.success) return res.status(400).json({ error: "Google credential required" });
  try {
    const user = await authenticateGoogleToken(credential.data.credential);
    if (!user) return res.status(401).json({ error: "Invalid Google identity" });
    await destroySession(req, res);
    await createSession(res, user.id);
    res.json({ user });
  } catch {
    res.status(401).json({ error: "Invalid or expired Google identity" });
  }
});
usersRouter.post("/session/local", async (req, res) => {
  if (!config.localAuthEnabled) return res.status(404).json({ error: "Not found" });
  const token = z.object({ token: z.string() }).safeParse(req.body);
  if (!token.success || !token.data.token.startsWith("local-user:"))
    return res.status(401).json({ error: "Invalid local identity" });
  const identity = await authenticateLocalToken(token.data.token);
  if (!identity) return res.status(401).json({ error: "Invalid local identity" });
  await destroySession(req, res);
  await createSession(res, identity.id);
  res.status(204).end();
});
usersRouter.delete("/session", async (req, res) => {
  await destroySession(req, res);
  res.status(204).end();
});
usersRouter.get("/local-auth", async (_req, res) => {
  if (!config.localAuthEnabled) return res.status(404).json({ error: "Not found" });
  const users = await db.execute(
    `SELECT id,name,email,avatar_url FROM users ORDER BY name COLLATE NOCASE, email COLLATE NOCASE`,
  );
  res.json(
    users.rows.map((user) => ({
      id: String(user.id),
      name: String(user.name),
      email: String(user.email),
      avatarUrl: user.avatar_url == null ? null : String(user.avatar_url),
      token: localAuthToken(String(user.id)),
    })),
  );
});
usersRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
usersRouter.get("/me/notifications", requireAuth, async (req, res) => {
  const result = await db.execute({
    sql: `SELECT id,type,listing_id,claim_id,message,read_at,created_at
          FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50`,
    args: [req.user!.id],
  });
  res.json(result.rows);
});
usersRouter.patch("/me/notifications/:id/read", requireAuth, async (req, res) => {
  const result = await db.execute({
    sql: `UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?`,
    args: [new Date().toISOString(), String(req.params.id), req.user!.id],
  });
  if (!result.rowsAffected) return res.status(404).json({ error: "Notification not found" });
  res.status(204).end();
});
const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .max(30)
    .regex(/^(?=(?:[^a-z]*[a-z]){3})[a-z0-9-]+$/),
  whatsapp: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/),
});
usersRouter.put("/me/profile", requireAuth, async (req, res) => {
  const body = profileSchema.safeParse(req.body);
  if (!body.success)
    return res.status(400).json({
      error:
        "El nombre de usuario debe tener al menos 3 letras y sólo puede contener letras, números y -. Usá un WhatsApp internacional, por ejemplo +5491123456789",
    });
  if (isReservedProfileUsername(body.data.username))
    return res.status(409).json({ error: "Ese nombre de usuario está reservado" });
  try {
    await db.execute({
      sql: `UPDATE users SET username=?, whatsapp=? WHERE id=?`,
      args: [body.data.username, body.data.whatsapp, req.user!.id],
    });
    res.json({
      user: { ...req.user, username: body.data.username, whatsapp: body.data.whatsapp },
    });
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message))
      return res.status(409).json({ error: "Ese nombre de usuario ya está en uso" });
    throw error;
  }
});
usersRouter.get("/me/dashboard", requireAuth, async (req, res) => {
  await db.execute({
    sql: `UPDATE listings SET status='expired' WHERE owner_id=? AND status='active' AND expires_at<=?`,
    args: [req.user!.id, new Date().toISOString()],
  });
  const listings = await db.execute({
    sql: `SELECT l.id,l.kind,l.description,COALESCE((SELECT li.url FROM listing_images li WHERE li.listing_id=l.id ORDER BY li.position LIMIT 1),l.image_url) image_url,CASE WHEN l.is_active=0 THEN 'inactive' ELSE l.status END status,l.created_at,l.expires_at,GROUP_CONCAT(DISTINCT i.card_name) card_names,COUNT(DISTINCT c.id) claim_count,COALESCE(SUM(CASE WHEN c.status!='cancelled' THEN c.amount_cents ELSE 0 END),0) total_cents FROM listings l LEFT JOIN listing_items i ON i.listing_id=l.id LEFT JOIN claims c ON c.item_id=i.id WHERE l.owner_id=? GROUP BY l.id ORDER BY l.created_at DESC`,
    args: [req.user!.id],
  });
  const purchases = await db.execute({
    sql: `SELECT c.id,c.quantity,c.amount_cents,c.status,c.created_at,i.card_id,i.card_name,i.detail,card.set_code card_set_code,l.id listing_id,l.description,l.currency,l.listing_type,u.id counterparty_id,u.name counterparty_name,u.username counterparty_username,u.whatsapp counterparty_whatsapp,EXISTS(SELECT 1 FROM ratings r WHERE r.claim_id=c.id AND r.from_user_id=?) rated FROM claims c JOIN listing_items i ON i.id=c.item_id LEFT JOIN cards card ON card.id=i.card_id JOIN listings l ON l.id=i.listing_id JOIN users u ON u.id=CASE WHEN l.kind='sale' THEN l.owner_id ELSE c.user_id END WHERE ((l.kind='sale' AND c.user_id=?) OR (l.kind='wanted' AND l.owner_id=?)) AND c.status!='cancelled' ORDER BY c.created_at DESC`,
    args: [req.user!.id, req.user!.id, req.user!.id],
  });
  const sales = await db.execute({
    sql: `SELECT c.id,c.quantity,c.amount_cents,c.status,c.created_at,i.card_id,i.card_name,i.detail,card.set_code card_set_code,l.id listing_id,l.description,l.currency,l.listing_type,u.id counterparty_id,u.name counterparty_name,u.username counterparty_username,u.whatsapp counterparty_whatsapp,EXISTS(SELECT 1 FROM ratings r WHERE r.claim_id=c.id AND r.from_user_id=?) rated FROM claims c JOIN listing_items i ON i.id=c.item_id LEFT JOIN cards card ON card.id=i.card_id JOIN listings l ON l.id=i.listing_id JOIN users u ON u.id=CASE WHEN l.kind='sale' THEN c.user_id ELSE l.owner_id END WHERE ((l.kind='sale' AND l.owner_id=?) OR (l.kind='wanted' AND c.user_id=?)) AND c.status!='cancelled' ORDER BY c.created_at DESC`,
    args: [req.user!.id, req.user!.id, req.user!.id],
  });
  const ratings = await db.execute({
    sql: `SELECT COALESCE(SUM(value='positive'),0) positive,COALESCE(SUM(value='neutral'),0) neutral,COALESCE(SUM(value='negative'),0) negative,COALESCE(SUM(role='buyer' AND value='positive'),0) buyer_positive,COALESCE(SUM(role='buyer' AND value='neutral'),0) buyer_neutral,COALESCE(SUM(role='buyer' AND value='negative'),0) buyer_negative,COALESCE(SUM(role='seller' AND value='positive'),0) seller_positive,COALESCE(SUM(role='seller' AND value='neutral'),0) seller_neutral,COALESCE(SUM(role='seller' AND value='negative'),0) seller_negative FROM ratings WHERE to_user_id=?`,
    args: [req.user!.id],
  });
  res.json({
    user: req.user,
    listings: listings.rows,
    purchases: purchases.rows,
    sales: sales.rows,
    ratings: ratings.rows[0],
  });
});
usersRouter.get("/:username", async (req, res) => {
  const user = await db.execute({
    sql: `SELECT id,name,username,avatar_url FROM users WHERE username=? COLLATE NOCASE OR id=?`,
    args: [req.params.username, req.params.username],
  });
  if (!user.rows[0]) return res.status(404).json({ error: "User not found" });
  const userId = String(user.rows[0].id);
  const stats = await db.execute({
    sql: `SELECT (SELECT COUNT(*) FROM claims c JOIN listing_items i ON i.id=c.item_id JOIN listings l ON l.id=i.listing_id WHERE c.status!='cancelled' AND ((l.kind='sale' AND l.owner_id=?) OR (l.kind='wanted' AND c.user_id=?))) sales, (SELECT COUNT(*) FROM claims c JOIN listing_items i ON i.id=c.item_id JOIN listings l ON l.id=i.listing_id WHERE c.status!='cancelled' AND ((l.kind='sale' AND c.user_id=?) OR (l.kind='wanted' AND l.owner_id=?))) purchases, COALESCE(SUM(role='buyer' AND value='positive'),0) buyer_positive,COALESCE(SUM(role='buyer' AND value='neutral'),0) buyer_neutral,COALESCE(SUM(role='buyer' AND value='negative'),0) buyer_negative,COALESCE(SUM(role='seller' AND value='positive'),0) seller_positive,COALESCE(SUM(role='seller' AND value='neutral'),0) seller_neutral,COALESCE(SUM(role='seller' AND value='negative'),0) seller_negative FROM ratings WHERE to_user_id=?`,
    args: [userId, userId, userId, userId, userId],
  });
  const listings = await db.execute({
    sql: `SELECT id,kind,description,image_url,created_at,expires_at FROM listings WHERE owner_id=? AND status='active' AND is_active=1 AND expires_at>? ORDER BY created_at DESC`,
    args: [userId, new Date().toISOString()],
  });
  res.json({ ...user.rows[0], ...stats.rows[0], listings: listings.rows });
});
usersRouter.post("/ratings", requireAuth, async (req, res) => {
  const body = z
    .object({
      claimId: z.string(),
      value: z.enum(["positive", "neutral", "negative"]),
      comment: z.string().max(500).optional(),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid rating" });
  const claim = await db.execute({
    sql: `SELECT CASE WHEN l.kind='sale' THEN c.user_id ELSE l.owner_id END buyer_id,CASE WHEN l.kind='sale' THEN l.owner_id ELSE c.user_id END seller_id,c.status FROM claims c JOIN listing_items i ON i.id=c.item_id JOIN listings l ON l.id=i.listing_id WHERE c.id=?`,
    args: [body.data.claimId],
  });
  const row = claim.rows[0];
  if (!row || row.status !== "received")
    return res.status(409).json({ error: "The exchange is not complete" });
  const isSeller = row.seller_id === req.user!.id;
  const toUserId = isSeller ? row.buyer_id : row.seller_id;
  if (!toUserId || toUserId === req.user!.id)
    return res.status(403).json({ error: "Rating is not allowed" });
  await db.execute({
    sql: `INSERT INTO ratings (id, claim_id, from_user_id, to_user_id, role, value, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      crypto.randomUUID(),
      body.data.claimId,
      req.user!.id,
      toUserId,
      isSeller ? "buyer" : "seller",
      body.data.value,
      body.data.comment ?? null,
      new Date().toISOString(),
    ],
  });
  res.status(201).json({ ok: true });
});
