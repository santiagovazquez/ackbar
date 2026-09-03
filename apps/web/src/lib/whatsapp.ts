export interface WhatsappClaim {
  quantity: number;
  card_id: string;
  card_name: string;
  card_set_code: string | null;
  detail: string | null;
  listing_type: "singles" | "bulk";
}

const setCodeFor = (claim: WhatsappClaim) => {
  if (claim.card_set_code) return claim.card_set_code;
  const match = claim.card_id.match(/^([A-Z0-9]+)_\d+$/i);
  return match?.[1]?.toUpperCase() ?? null;
};

const claimLabel = (claim: WhatsappClaim) => {
  const name = claim.listing_type === "bulk" ? claim.detail || claim.card_name : claim.card_name;
  const setCode = claim.listing_type === "singles" ? setCodeFor(claim) : null;
  return `${claim.quantity}x ${name}${setCode ? ` (${setCode})` : ""}`;
};

const spanishList = (values: string[]) => {
  if (values.length < 2) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} y ${values.at(-1)}`;
};

export const whatsappContactHref = (phone: string, claims: WhatsappClaim[]) => {
  const number = phone.replace(/\D/g, "");
  const items = spanishList(claims.map(claimLabel));
  const message = `Hola! Te contacto por los claims de ${items} en Ackb.ar`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
};
