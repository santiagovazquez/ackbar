export type ListingKind = "sale" | "wanted";
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
  title: string;
  imageUrl?: string;
  items: CardInput[];
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
  title: string;
  imageUrl: string | null;
  status: ListingStatus;
  createdAt: string;
  expiresAt: string;
  seller: UserSummary;
  items: ListingItem[];
}
