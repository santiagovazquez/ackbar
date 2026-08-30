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
  it("allows switching among database users only through local auth", async () => {
    await request.get("/users/me/dashboard").set(authenticated("seller-token"));
    await request.get("/users/me/dashboard").set(authenticated("buyer-token"));

    const users = await request.get("/users/local-auth");
    expect(users.status).toBe(200);
    const buyer = users.body.find((user: { email: string }) => user.email === "buyer@example.com");
    expect(buyer.token).toBe("local-user:usr_buyer");

    const dashboard = await request.get("/users/me/dashboard").set(authenticated(buyer.token));
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.user).toMatchObject({ id: "usr_buyer", name: "Buyer" });
    expect(
      (await request.get("/users/me/dashboard").set(authenticated("local-user:missing"))).status,
    ).toBe(401);
  });

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

    const ownClaims = await request
      .get(`/claims/listing/${listing.id}`)
      .set(authenticated("buyer-token"));
    expect(ownClaims.status).toBe(200);
    expect(ownClaims.body).toEqual([
      { itemId: listing.items[0].id, quantity: 3, amountCents: 2500 },
    ]);
    const sellerClaims = await request
      .get(`/claims/listing/${listing.id}`)
      .set(authenticated("seller-token"));
    expect(sellerClaims.body).toEqual([]);

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

  it("lets the buyer complete a delivery and both parties rate each other", async () => {
    const listing = await createPublication("sale", "seller-token");
    const first = await request
      .post("/claims")
      .set(authenticated("buyer-token"))
      .send({ itemId: listing.items[0].id, quantity: 1, pricingMode: "unit" });
    const second = await request
      .post("/claims")
      .set(authenticated("buyer-token"))
      .send({ itemId: listing.items[0].id, quantity: 1, pricingMode: "unit" });

    const claimIds = [first.body.id, second.body.id];
    expect(
      (
        await request
          .patch("/claims/batch/delivered")
          .set(authenticated("buyer-token"))
          .send({ claimIds })
      ).status,
    ).toBe(204);

    expect(
      (
        await request
          .post("/users/ratings")
          .set(authenticated("buyer-token"))
          .send({ claimId: claimIds[0], value: "positive" })
      ).status,
    ).toBe(201);
    expect(
      (
        await request
          .post("/users/ratings")
          .set(authenticated("seller-token"))
          .send({ claimId: claimIds[0], value: "neutral" })
      ).status,
    ).toBe(201);

    const dashboard = await request.get("/users/me/dashboard").set(authenticated("seller-token"));
    expect(
      dashboard.body.sales
        .filter((claim: { id: string }) => claimIds.includes(claim.id))
        .map((claim: { status: string }) => claim.status),
    ).toEqual(["delivered", "delivered"]);

    const sellerProfile = await request.get("/users/usr_seller");
    const buyerProfile = await request.get("/users/usr_buyer");
    expect(Number(sellerProfile.body.seller_positive)).toBeGreaterThanOrEqual(1);
    expect(Number(buyerProfile.body.buyer_neutral)).toBe(1);
  });

  it("deactivates a publication while preserving its claims and rejecting new ones", async () => {
    const listing = await createPublication("sale", "seller-token");
    const firstClaim = await request
      .post("/claims")
      .set(authenticated("buyer-token"))
      .send({ itemId: listing.items[0].id, quantity: 1, pricingMode: "unit" });
    expect(firstClaim.status).toBe(201);

    const deactivation = await request
      .patch(`/listings/${listing.id}/deactivate`)
      .set(authenticated("seller-token"));
    expect(deactivation.status).toBe(204);

    const detail = await request.get(`/listings/${listing.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.status).toBe("inactive");
    expect(detail.body.items[0].availableQuantity).toBe(2);

    const home = await request.get("/listings");
    expect(home.body.some((row: { id: string }) => row.id === listing.id)).toBe(false);

    const newClaim = await request
      .post("/claims")
      .set(authenticated("buyer-token"))
      .send({ itemId: listing.items[0].id, quantity: 1, pricingMode: "unit" });
    expect(newClaim.status).toBe(409);
    expect(newClaim.body.error).toBe("Publication is not active");

    const dashboard = await request.get("/users/me/dashboard").set(authenticated("seller-token"));
    const dashboardListing = dashboard.body.listings.find(
      (row: { id: string }) => row.id === listing.id,
    );
    expect(dashboardListing.status).toBe("inactive");
    expect(Number(dashboardListing.claim_count)).toBe(1);
  });
});
