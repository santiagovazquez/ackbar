import { describe, expect, it } from "vitest";
import { whatsappContactHref, type WhatsappClaim } from "./whatsapp";

const claim = (overrides: Partial<WhatsappClaim>): WhatsappClaim => ({
  quantity: 2,
  card_id: "ASH_001",
  card_name: "Luke Skywalker",
  card_set_code: "ASH",
  detail: null,
  listing_type: "singles",
  ...overrides,
});

describe("whatsappContactHref", () => {
  it("includes quantities, card sets and a natural Spanish list", () => {
    const href = whatsappContactHref("+54 9 11 1234-5678", [
      claim({}),
      claim({ quantity: 3, card_name: "Ahsoka Tano" }),
      claim({
        card_id: "bulk-item",
        card_name: "Lote",
        card_set_code: null,
        detail: "Anniquilator",
        listing_type: "bulk",
      }),
    ]);

    expect(href).toBe(
      `https://wa.me/5491112345678?text=${encodeURIComponent(
        "Hola! Te contacto por los claims de 2x Luke Skywalker (ASH), 3x Ahsoka Tano (ASH) y 2x Anniquilator en Ackb.ar",
      )}`,
    );
  });

  it("formats a single claimed item without a conjunction", () => {
    const href = whatsappContactHref("5491112345678", [claim({ quantity: 1 })]);

    expect(decodeURIComponent(href.split("?text=")[1]!)).toBe(
      "Hola! Te contacto por los claims de 1x Luke Skywalker (ASH) en Ackb.ar",
    );
  });
});
