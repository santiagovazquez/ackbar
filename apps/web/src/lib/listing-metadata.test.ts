import { describe, expect, it } from "vitest";
import type { Listing } from "@swu/shared";
import { formatPreviewPrice, listingPreviewDescription } from "./listing-metadata";

const listing = {
  listingType: "singles",
  currency: "ARS",
  description: "Entrego en dados",
  items: [
    { name: "Luke Skywalker", setCode: "ASH", quantity: 2, unitPriceCents: 150000 },
    {
      name: "Ahsoka Tano",
      setCode: "ASH",
      quantity: 3,
      unitPriceCents: 1000000,
      playsetPriceCents: 1200000,
    },
  ],
} as Listing;

describe("listing preview metadata", () => {
  it("uses compact thousands for Argentine pesos", () => {
    expect(formatPreviewPrice(150000, "ARS")).toBe("1.5k");
    expect(formatPreviewPrice(1000000, "ARS")).toBe("10k");
  });

  it("summarizes singles and puts the seller description on the last line", () => {
    expect(listingPreviewDescription(listing)).toBe(
      "2x Luke Skywalker (ASH) 1.5k, 3x Ahsoka Tano (ASH) 10k PS 12k\nEntrego en dados",
    );
  });
});
