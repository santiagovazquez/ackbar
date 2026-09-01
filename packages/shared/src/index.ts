export type ListingKind = "sale" | "wanted";
export type ListingType = "singles" | "bulk";
export type Currency = "ARS" | "USD";
export type ListingStatus = "active" | "closed" | "expired" | "inactive";
export type RatingValue = "positive" | "neutral" | "negative";

// Top-level application routes take precedence over public profile URLs.
export const RESERVED_PROFILE_USERNAMES = [
  "api",
  "busco",
  "busquedas",
  "dashboard",
  "perfil",
  "publi",
  "vendo",
] as const;

export function isReservedProfileUsername(username: string): boolean {
  return (RESERVED_PROFILE_USERNAMES as readonly string[]).includes(username.toLowerCase());
}

export interface CardInput {
  cardId: string;
  name: string;
  detail?: string;
  quantity: number;
  unitPriceCents: number | null;
  playsetPriceCents: number | null;
}

export interface CreateListingInput {
  kind: ListingKind;
  listingType: ListingType;
  currency: Currency;
  buyerPaysShipping?: boolean;
  description?: string;
  imageUrls?: string[];
  items: CardInput[];
}

export interface UserSummary {
  id: string;
  username: string | null;
  name: string;
  avatarUrl: string | null;
}

export interface ListingItem {
  id: string;
  cardId: string;
  name: string;
  subtitle: string | null;
  setCode: string | null;
  detail: string | null;
  quantity: number;
  availableQuantity: number;
  unitPriceCents: number | null;
  playsetPriceCents: number | null;
}

export interface Listing {
  id: string;
  kind: ListingKind;
  listingType: ListingType;
  currency: Currency;
  buyerPaysShipping: boolean;
  description: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  status: ListingStatus;
  createdAt: string;
  expiresAt: string;
  seller: UserSummary;
  items: ListingItem[];
}
