export type ListingKind = "sale";
export type ListingType = "singles" | "bulk";
export type Currency = "ARS" | "USD";
export type ListingStatus = "active" | "closed" | "expired" | "deleted";
export type RatingValue = "positive" | "neutral" | "negative";

export interface CardInput {
  cardId: string;
  name: string;
  quantity: number;
  unitPriceCents: number | null;
  playsetPriceCents: number | null;
}

export interface CreateListingInput {
  kind: ListingKind;
  listingType: ListingType;
  currency: Currency;
  description?: string;
  imageUrls?: string[];
  items: CardInput[];
  bulkPriceCents?: number;
}

export interface UserSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface ListingItem {
  id: string;
  cardId: string;
  name: string;
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
  description: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  status: ListingStatus;
  createdAt: string;
  expiresAt: string;
  seller: UserSummary;
  items: ListingItem[];
}
