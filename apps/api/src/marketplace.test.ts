import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import supertest from "supertest";
import { rmSync } from "node:fs";

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    async verifyIdToken({ idToken }: { idToken: string }) {
      const identity =
        idToken === "seller-token"
          ? { sub: "seller", email: "seller@example.com", name: "Seller" }
          : { sub: "buyer", email: "buyer@example.com", name: "Buyer" };
      return { getPayload: () => identity };
    }
  },
}));

let request: ReturnType<typeof supertest>;
let database: typeof import("./db.js").db;
const databasePath = `/tmp/swu-marketplace-test-${process.pid}.db`;
const authenticated = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${databasePath}`;
  process.env.GOOGLE_CLIENT_ID = "test-client";
  const [{ app }, dbModule] = await Promise.all([import("./app.js"), import("./db.js")]);
  request = supertest(app);
  database = dbModule.db;
});

afterAll(() => {
  database.close();
  rmSync(databasePath, { force: true });
});

async function createPublication(kind: "sale", ownerToken: string) {
  const response = await request
    .post("/listings")
    .set(authenticated(ownerToken))
    .send({
      kind,
      description: "Cards for sale",
      imageUrls: ["https://example.com/cards.jpg"],
      items: [
        {
          cardId: "luke-skywalker",
          name: "Luke Skywalker",
          detail: "Hyperspace foil",
          quantity: 3,
          unitPriceCents: 1000,
          playsetPriceCents: 2500,
        },
      ],
    });
  expect(response.status).toBe(201);
  return response.body;
}

describe("marketplace lifecycle", () => {
  it("rejects anonymous publications and claims", async () => {
    expect((await request.post("/listings").send({})).status).toBe(401);
    expect(
      (await request.post("/claims").send({ itemId: "missing", quantity: 1, pricingMode: "unit" }))
        .status,
    ).toBe(401);
  });

  it("creates a USD other publication with individually priced items", async () => {
    const response = await request
      .post("/listings")
      .set(authenticated("seller-token"))
      .send({
        kind: "sale",
        listingType: "bulk",
        currency: "USD",
        buyerPaysShipping: true,
        description: "Complete collection",
        imageUrls: ["https://example.com/bulk.jpg", "https://example.com/bulk-detail.jpg"],
        items: [
          {
            cardId: "other-collection",
            name: "Artículo",
            detail: "Complete collection",
            quantity: 1,
            unitPriceCents: 12550,
            playsetPriceCents: null,
          },
          {
            cardId: "other-tokens",
            name: "Artículo",
            detail: "Tokens",
            quantity: 1,
            unitPriceCents: 500,
            playsetPriceCents: null,
          },
        ],
      });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.listingType).toBe("bulk");
    expect(response.body.currency).toBe("USD");
    expect(response.body.buyerPaysShipping).toBe(true);
    expect(response.body.imageUrls).toEqual([
      "https://example.com/bulk.jpg",
      "https://example.com/bulk-detail.jpg",
    ]);
    expect(response.body.imageUrl).toBe("https://example.com/bulk.jpg");
    expect(response.body.items).toHaveLength(2);
    expect(
      response.body.items.find((item: { detail: string }) => item.detail === "Complete collection")
        ?.unitPriceCents,
    ).toBe(12550);
    expect(response.body.items.some((item: { detail: string }) => item.detail === "Tokens")).toBe(
      true,
    );
  });

  it("closes a sale after a full playset claim and records fulfillment and rating", async () => {
    const listing = await createPublication("sale", "seller-token");
    expect(listing.items[0].detail).toBe("Hyperspace foil");
    expect(listing.items[0].subtitle).toBeNull();
    const claim = await request
      .post("/claims")
      .set(authenticated("buyer-token"))
      .send({ itemId: listing.items[0].id, quantity: 3, pricingMode: "playset" });
    expect(claim.status).toBe(201);
    expect(claim.body.amountCents).toBe(2500);

    const closed = await request.get(`/listings/${listing.id}`);
    expect(closed.status, JSON.stringify(closed.body)).toBe(200);
    expect(closed.body.status).toBe("closed");
    expect(closed.body.items[0].availableQuantity).toBe(0);

    expect(
      (
        await request
          .patch(`/claims/${claim.body.id}/status`)
          .set(authenticated("seller-token"))
          .send({ status: "delivered" })
      ).status,
    ).toBe(204);
    expect(
      (
        await request
          .patch(`/claims/${claim.body.id}/status`)
          .set(authenticated("buyer-token"))
          .send({ status: "received" })
      ).status,
    ).toBe(204);
    expect(
      (
        await request
          .patch(`/claims/${claim.body.id}/status`)
          .set(authenticated("seller-token"))
          .send({ status: "delivered" })
      ).status,
    ).toBe(403);
    expect(
      (
        await request
          .post("/users/ratings")
          .set(authenticated("buyer-token"))
          .send({ claimId: claim.body.id, value: "positive" })
      ).status,
    ).toBe(201);

    const profile = await request.get("/users/usr_seller");
    expect(Number(profile.body.sales)).toBe(1);
    expect(Number(profile.body.seller_positive)).toBe(1);
  });

  it("rejects wanted publications", async () => {
    const response = await request
      .post("/listings")
      .set(authenticated("buyer-token"))
      .send({ kind: "wanted", items: [] });
    expect(response.status).toBe(400);
  });
});
