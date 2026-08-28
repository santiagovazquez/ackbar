import { createClient } from "@libsql/client";
import { config } from "./config.js";

export const db = createClient({ url: config.databaseUrl, authToken: config.databaseAuthToken });

export async function migrate() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, google_sub TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, avatar_url TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS listings (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN ('sale','wanted')), title TEXT NOT NULL, image_url TEXT, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed','expired','deleted')), created_at TEXT NOT NULL, expires_at TEXT NOT NULL, deleted_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS listing_items (id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES listings(id), card_id TEXT NOT NULL, card_name TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0), unit_price_cents INTEGER, playset_price_cents INTEGER)`,
    `CREATE TABLE IF NOT EXISTS listing_images (id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES listings(id), url TEXT NOT NULL, position INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS claims (id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES listing_items(id), user_id TEXT NOT NULL REFERENCES users(id), quantity INTEGER NOT NULL CHECK(quantity > 0), pricing_mode TEXT NOT NULL CHECK(pricing_mode IN ('unit','playset')), amount_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'claimed' CHECK(status IN ('claimed','delivered','received','cancelled')), created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS ratings (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES claims(id), from_user_id TEXT NOT NULL REFERENCES users(id), to_user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL CHECK(role IN ('buyer','seller')), value TEXT NOT NULL CHECK(value IN ('positive','neutral','negative')), comment TEXT, created_at TEXT NOT NULL, UNIQUE(claim_id, from_user_id))`,
    `CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, name TEXT NOT NULL, subtitle TEXT, set_code TEXT, card_number TEXT, UNIQUE(name, subtitle, set_code, card_number))`,
    `CREATE INDEX IF NOT EXISTS idx_listings_owner ON listings(owner_id)`,
    `CREATE INDEX IF NOT EXISTS idx_claims_item ON claims(item_id)`,
    `CREATE INDEX IF NOT EXISTS idx_listing_images_listing ON listing_images(listing_id, position)`,
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
  ].filter((sql): sql is string => Boolean(sql));
  if (additions.length) {
    await db.batch(
      additions.map((sql) => ({ sql })),
      "write",
    );
  }
}
