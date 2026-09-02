import { createClient } from "@libsql/client";
import { config } from "./config.js";

export const db = createClient({ url: config.databaseUrl, authToken: config.databaseAuthToken });

export async function migrate() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, google_sub TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, avatar_url TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS listings (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN ('sale','wanted')), title TEXT NOT NULL, image_url TEXT, buyer_pays_shipping INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed','expired','deleted')), created_at TEXT NOT NULL, expires_at TEXT NOT NULL, deleted_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS listing_items (id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES listings(id), card_id TEXT NOT NULL, card_name TEXT NOT NULL, detail TEXT, quantity INTEGER NOT NULL CHECK(quantity > 0), unit_price_cents INTEGER, playset_price_cents INTEGER)`,
    `CREATE TABLE IF NOT EXISTS listing_images (id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES listings(id), url TEXT NOT NULL, position INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS claims (id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES listing_items(id), user_id TEXT NOT NULL REFERENCES users(id), quantity INTEGER NOT NULL CHECK(quantity > 0), pricing_mode TEXT NOT NULL CHECK(pricing_mode IN ('unit','playset')), amount_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'claimed' CHECK(status IN ('claimed','delivered','received','cancelled')), created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS ratings (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES claims(id), from_user_id TEXT NOT NULL REFERENCES users(id), to_user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL CHECK(role IN ('buyer','seller')), value TEXT NOT NULL CHECK(value IN ('positive','neutral','negative')), comment TEXT, created_at TEXT NOT NULL, UNIQUE(claim_id, from_user_id))`,
    `CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), type TEXT NOT NULL CHECK(type IN ('wanted_match','claim')), listing_id TEXT NOT NULL REFERENCES listings(id), claim_id TEXT REFERENCES claims(id), message TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, name TEXT NOT NULL, subtitle TEXT, set_code TEXT, card_number TEXT, UNIQUE(name, subtitle, set_code, card_number))`,
    `CREATE INDEX IF NOT EXISTS idx_listings_owner ON listings(owner_id)`,
    `CREATE INDEX IF NOT EXISTS idx_claims_item ON claims(item_id)`,
    `CREATE INDEX IF NOT EXISTS idx_listing_images_listing ON listing_images(listing_id, position)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at)`,
  ];
  await db.batch(
    statements.map((sql) => ({ sql })),
    "write",
  );
  const listingColumns = await db.execute("PRAGMA table_info(listings)");
  const columnNames = new Set(listingColumns.rows.map((column) => String(column.name)));
  const additions = [
    !columnNames.has("listing_type") &&
      `ALTER TABLE listings ADD COLUMN listing_type TEXT NOT NULL DEFAULT 'singles' CHECK(listing_type IN ('singles','bulk'))`,
    !columnNames.has("currency") &&
      `ALTER TABLE listings ADD COLUMN currency TEXT NOT NULL DEFAULT 'ARS' CHECK(currency IN ('ARS','USD'))`,
    !columnNames.has("description") && `ALTER TABLE listings ADD COLUMN description TEXT`,
    !columnNames.has("buyer_pays_shipping") &&
      `ALTER TABLE listings ADD COLUMN buyer_pays_shipping INTEGER NOT NULL DEFAULT 0`,
    !columnNames.has("is_active") &&
      `ALTER TABLE listings ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`,
    !columnNames.has("deactivated_at") && `ALTER TABLE listings ADD COLUMN deactivated_at TEXT`,
  ].filter((sql): sql is string => Boolean(sql));
  if (additions.length) {
    await db.batch(
      additions.map((sql) => ({ sql })),
      "write",
    );
  }
  const listingItemColumns = await db.execute("PRAGMA table_info(listing_items)");
  if (!listingItemColumns.rows.some((column) => String(column.name) === "detail")) {
    await db.execute(`ALTER TABLE listing_items ADD COLUMN detail TEXT`);
  }
  const userColumns = await db.execute("PRAGMA table_info(users)");
  const userColumnNames = new Set(userColumns.rows.map((column) => String(column.name)));
  const userAdditions = [
    !userColumnNames.has("username") && `ALTER TABLE users ADD COLUMN username TEXT`,
    !userColumnNames.has("whatsapp") && `ALTER TABLE users ADD COLUMN whatsapp TEXT`,
  ].filter((sql): sql is string => Boolean(sql));
  if (userAdditions.length) {
    await db.batch(
      userAdditions.map((sql) => ({ sql })),
      "write",
    );
  }
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase ON users(username COLLATE NOCASE) WHERE username IS NOT NULL`,
  );
  await db.execute(
    `UPDATE listings SET description=title WHERE description IS NULL AND title IS NOT NULL AND title!=''`,
  );
  await db.execute(
    `UPDATE listings SET is_active=0, deactivated_at=COALESCE(deactivated_at, deleted_at) WHERE status='deleted'`,
  );
}
