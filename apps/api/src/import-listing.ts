import "dotenv/config";
import { createClient, type Client, type InValue } from "@libsql/client";
import { resolve } from "node:path";

type Arguments = {
  source: string;
  listingId: string;
  ownerEmail: string;
  confirm: boolean;
};

function usage(): never {
  throw new Error(
    "Usage: pnpm db:import-listing -- --source <local.db> --listing <id> --owner-email <email> [--confirm]",
  );
}

function parseArguments(values: string[]): Arguments {
  const valueAfter = (flag: string) => {
    const index = values.indexOf(flag);
    if (index < 0 || !values[index + 1] || values[index + 1]!.startsWith("--")) usage();
    return values[index + 1]!;
  };
  return {
    source: valueAfter("--source"),
    listingId: valueAfter("--listing"),
    ownerEmail: valueAfter("--owner-email").trim().toLowerCase(),
    confirm: values.includes("--confirm"),
  };
}

function sourceUrl(source: string) {
  return source.startsWith("file:") ? source : `file:${resolve(source)}`;
}

const dbValue = (value: InValue | undefined): InValue => value ?? null;

async function exactlyOneOwner(target: Client, email: string) {
  const result = await target.execute({
    sql: `SELECT id,email FROM users WHERE lower(email)=?`,
    args: [email],
  });
  if (result.rows.length !== 1)
    throw new Error(
      result.rows.length === 0
        ? `No production user found for ${email}`
        : `Multiple production users found for ${email}`,
    );
  return String(result.rows[0]!.id);
}

const args = parseArguments(process.argv.slice(2));
const targetUrl = process.env.DATABASE_URL;
if (!targetUrl) throw new Error("DATABASE_URL must point to the target database");
const resolvedSourceUrl = sourceUrl(args.source);
if (targetUrl === resolvedSourceUrl)
  throw new Error("Source and target databases must be different");

const source = createClient({ url: resolvedSourceUrl });
const target = createClient({
  url: targetUrl,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

try {
  const [listingResult, itemResult, imageResult] = await Promise.all([
    source.execute({ sql: `SELECT * FROM listings WHERE id=?`, args: [args.listingId] }),
    source.execute({
      sql: `SELECT * FROM listing_items WHERE listing_id=? ORDER BY rowid`,
      args: [args.listingId],
    }),
    source.execute({
      sql: `SELECT * FROM listing_images WHERE listing_id=? ORDER BY position`,
      args: [args.listingId],
    }),
  ]);
  const listing = listingResult.rows[0];
  if (!listing) throw new Error(`Source listing ${args.listingId} was not found`);
  if (!itemResult.rows.length) throw new Error("Source listing has no items");

  const ownerId = await exactlyOneOwner(target, args.ownerEmail);
  const collisionChecks = await Promise.all([
    target.execute({ sql: `SELECT id FROM listings WHERE id=?`, args: [args.listingId] }),
    target.execute({
      sql: `SELECT id FROM listing_items WHERE id IN (${itemResult.rows.map(() => "?").join(",")})`,
      args: itemResult.rows.map((item) => dbValue(item.id)),
    }),
    imageResult.rows.length
      ? target.execute({
          sql: `SELECT id FROM listing_images WHERE id IN (${imageResult.rows.map(() => "?").join(",")})`,
          args: imageResult.rows.map((image) => dbValue(image.id)),
        })
      : Promise.resolve({ rows: [] }),
  ]);
  if (collisionChecks.some((result) => result.rows.length > 0))
    throw new Error("The listing or one of its child IDs already exists in the target database");

  console.log(
    JSON.stringify(
      {
        source: resolvedSourceUrl,
        target: targetUrl.replace(/\/\/.*@/, "//***@"),
        listingId: args.listingId,
        description: listing.description,
        ownerEmail: args.ownerEmail,
        ownerId,
        items: itemResult.rows.length,
        images: imageResult.rows.length,
        expiresAt: listing.expires_at,
      },
      null,
      2,
    ),
  );

  if (!args.confirm) {
    console.log("Dry run only. Add --confirm to import this publication.");
    process.exitCode = 2;
  } else {
    await target.batch(
      [
        {
          sql: `INSERT INTO listings
                (id,owner_id,kind,listing_type,currency,buyer_pays_shipping,title,description,
                 image_url,status,created_at,expires_at,deleted_at,is_active,deactivated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            listing.id,
            ownerId,
            listing.kind,
            listing.listing_type,
            listing.currency,
            listing.buyer_pays_shipping,
            listing.title,
            listing.description,
            listing.image_url,
            listing.status,
            listing.created_at,
            listing.expires_at,
            listing.deleted_at,
            listing.is_active,
            listing.deactivated_at,
          ].map(dbValue),
        },
        ...itemResult.rows.map((item) => ({
          sql: `INSERT INTO listing_items
                (id,listing_id,card_id,card_name,detail,quantity,unit_price_cents,playset_price_cents)
                VALUES (?,?,?,?,?,?,?,?)`,
          args: [
            item.id,
            listing.id,
            item.card_id,
            item.card_name,
            item.detail,
            item.quantity,
            item.unit_price_cents,
            item.playset_price_cents,
          ].map(dbValue),
        })),
        ...imageResult.rows.map((image) => ({
          sql: `INSERT INTO listing_images (id,listing_id,url,position) VALUES (?,?,?,?)`,
          args: [image.id, listing.id, image.url, image.position].map(dbValue),
        })),
      ],
      "write",
    );
    console.log(`Imported listing ${args.listingId} for ${args.ownerEmail}.`);
  }
} finally {
  source.close();
  target.close();
}
