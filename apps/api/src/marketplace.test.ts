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
  for (const [token, username, whatsapp] of [
    ["seller-token", "seller", "+5491111111111"],
    ["buyer-token", "buyer", "+5491122222222"],
  ] as const) {
    await request.get("/users/me").set(authenticated(token));
    const profile = await request
      .put("/users/me/profile")
      .set(authenticated(token))
      .send({ username, whatsapp });
    expect(profile.status).toBe(200);
  }
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
  it("requires WhatsApp and a username with at least three letters", async () => {
    for (const profile of [
      { username: "ab1", whatsapp: "+5491111111111" },
      { username: "abc_123", whatsapp: "+5491111111111" },
      { username: "abc-123", whatsapp: "" },
    ]) {
      const response = await request
        .put("/users/me/profile")
        .set(authenticated("seller-token"))
        .send(profile);
      expect(response.status).toBe(400);
    }

    const valid = await request
      .put("/users/me/profile")
      .set(authenticated("seller-token"))
      .send({ username: "abc-123", whatsapp: "+5491111111111" });
    expect(valid.status).toBe(200);
    expect(valid.body.user).toMatchObject({
      username: "abc-123",
      whatsapp: "+5491111111111",
    });

    const restored = await request
      .put("/users/me/profile")
      .set(authenticated("seller-token"))
      .send({ username: "seller", whatsapp: "+5491111111111" });
    expect(restored.status).toBe(200);
  });

  it("reserves existing top-level pages before public usernames", async () => {
    for (const username of ["vendo", "busco", "DASHBOARD", "perfil", "publi", "api"]) {
      const response = await request
        .put("/users/me/profile")
        .set(authenticated("seller-token"))
        .send({ username, whatsapp: "+5491111111111" });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe("Ese nombre de usuario está reservado");
    }

    const profile = await request.get("/users/seller");
    expect(profile.status).toBe(200);
  });

  it("allows switching among database users only through local auth", async () => {
    const googleIdentity = await request.get("/users/me").set(authenticated("seller-token"));
    expect(googleIdentity.status).toBe(200);
    expect(googleIdentity.body.user.id).toBe("usr_seller");

    await request.get("/users/me/dashboard").set(authenticated("seller-token"));
    await request.get("/users/me/dashboard").set(authenticated("buyer-token"));

    const users = await request.get("/users/local-auth");
    expect(users.status).toBe(200);
    const buyer = users.body.find((user: { email: string }) => user.email === "buyer@example.com");
    expect(buyer.token).toBe("local-user:usr_buyer");

    const localIdentity = await request.get("/users/me").set(authenticated(buyer.token));
    expect(localIdentity.status).toBe(200);
    expect(localIdentity.body.user.id).toBe("usr_buyer");

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
    expect(sellerClaims.body).toEqual([
      {
        itemId: listing.items[0].id,
        quantity: 3,
        amountCents: 2500,
        claimantId: "usr_buyer",
        claimantName: "Buyer",
        claimantUsername: "buyer",
      },
    ]);

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

    const profile = await request.get("/users/seller");
    expect(Number(profile.body.sales)).toBe(1);
    expect(Number(profile.body.seller_positive)).toBe(1);
  });

  it("hides claimed-out items from the home and closes a fully claimed publication", async () => {
    const publication = await request
      .post("/listings")
      .set(authenticated("seller-token"))
      .send({
        kind: "sale",
        description: "Two available cards",
        imageUrls: ["https://example.com/two-cards.jpg"],
        items: [
          {
            cardId: "item-one",
            name: "Item One",
            quantity: 1,
            unitPriceCents: 1000,
            playsetPriceCents: null,
          },
          {
            cardId: "item-two",
            name: "Item Two",
            quantity: 1,
            unitPriceCents: 2000,
            playsetPriceCents: null,
          },
        ],
      });
    expect(publication.status).toBe(201);

    await request
      .post("/claims")
      .set(authenticated("buyer-token"))
      .send({ itemId: publication.body.items[0].id, quantity: 1, pricingMode: "unit" });

    const partiallyAvailableHome = await request.get("/listings");
    const partialListing = partiallyAvailableHome.body.find(
      (listing: { id: string }) => listing.id === publication.body.id,
    );
    expect(partialListing.status).toBe("active");
    expect(partialListing.items).toHaveLength(1);
    expect(partialListing.items[0].id).toBe(publication.body.items[1].id);

    await request
      .post("/claims")
      .set(authenticated("buyer-token"))
      .send({ itemId: publication.body.items[1].id, quantity: 1, pricingMode: "unit" });

    const soldOutHome = await request.get("/listings");
    expect(
      soldOutHome.body.some((listing: { id: string }) => listing.id === publication.body.id),
    ).toBe(false);

    const closedPublication = await request.get(`/listings/${publication.body.id}`);
    expect(closedPublication.body.status).toBe("closed");
    expect(closedPublication.body.items).toHaveLength(2);
    expect(
      closedPublication.body.items.every(
        (item: { availableQuantity: number }) => item.availableQuantity === 0,
      ),
    ).toBe(true);
  });

  it("creates wanted publications with cards and quantities only", async () => {
    const response = await request
      .post("/listings")
      .set(authenticated("buyer-token"))
      .send({
        kind: "wanted",
        items: [
          {
            cardId: "SOR_001",
            name: "Luke Skywalker",
            quantity: 2,
            unitPriceCents: null,
            playsetPriceCents: null,
          },
        ],
      });
    expect(response.status).toBe(201);
    expect(response.body.kind).toBe("wanted");
    expect(response.body.imageUrls).toEqual([]);
    expect(response.body.items[0]).toMatchObject({ name: "Luke Skywalker", quantity: 2 });

    const wantedListings = await request.get("/listings/wanted");
    expect(wantedListings.status).toBe(200);
    expect(wantedListings.body[0]).toMatchObject({
      id: response.body.id,
      kind: "wanted",
      seller: { name: "Buyer" },
    });
  });

  it("notifies wanted-card matches and claims, and exposes wanted cards on profiles", async () => {
    const wanted = await request
      .post("/listings")
      .set(authenticated("buyer-token"))
      .send({
        kind: "wanted",
        items: [
          {
            cardId: "notification-test-card",
            name: "Notification Test Card",
            quantity: 1,
            unitPriceCents: null,
            playsetPriceCents: null,
          },
        ],
      });
    expect(wanted.status).toBe(201);

    const sale = await request
      .post("/listings")
      .set(authenticated("seller-token"))
      .send({
        kind: "sale",
        imageUrls: ["https://example.com/notification.jpg"],
        items: [
          {
            cardId: "notification-test-card",
            name: "Notification Test Card",
            quantity: 1,
            unitPriceCents: 500,
            playsetPriceCents: null,
          },
        ],
      });
    expect(sale.status).toBe(201);

    const buyerNotifications = await request
      .get("/users/me/notifications")
      .set(authenticated("buyer-token"));
    const match = buyerNotifications.body.find(
      (notification: { listing_id: string }) => notification.listing_id === sale.body.id,
    );
    expect(match).toMatchObject({ type: "wanted_match", read_at: null });

    const profile = await request.get("/users/buyer");
    expect(profile.body.listings).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: wanted.body.id, kind: "wanted" })]),
    );

    const claim = await request
      .post("/claims")
      .set(authenticated("buyer-token"))
      .send({ itemId: sale.body.items[0].id, quantity: 1, pricingMode: "unit" });
    expect(claim.status).toBe(201);
    const sellerNotifications = await request
      .get("/users/me/notifications")
      .set(authenticated("seller-token"));
    expect(sellerNotifications.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "claim", claim_id: claim.body.id })]),
    );

    expect(
      (
        await request
          .patch(`/users/me/notifications/${match.id}/read`)
          .set(authenticated("buyer-token"))
      ).status,
    ).toBe(204);
  });

  it("requires delivery and receipt before both parties can rate each other", async () => {
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
    ).toBe(403);
    expect(
      (
        await request
          .patch("/claims/batch/delivered")
          .set(authenticated("seller-token"))
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
    ).toBe(409);

    for (const claimId of claimIds) {
      expect(
        (
          await request
            .patch(`/claims/${claimId}/status`)
            .set(authenticated("buyer-token"))
            .send({ status: "received" })
        ).status,
      ).toBe(204);
    }

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
    ).toEqual(["received", "received"]);

    const sellerProfile = await request.get("/users/seller");
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
