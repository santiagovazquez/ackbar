import type { CreateListingInput, Listing } from "@swu/shared";

export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { credentials: "include", ...options });
  if (!response.ok) throw new Error((await response.json()).error ?? "Request failed");
  return response.status === 204 ? (undefined as T) : response.json();
}
export const getListing = (id: string) => api<Listing>(`/listings/${id}`, { cache: "no-store" });
export const getListings = () => api<Listing[]>("/listings", { cache: "no-store" });
export const getWantedListings = () => api<Listing[]>("/listings/wanted", { cache: "no-store" });
export const createListing = (input: CreateListingInput) =>
  api<Listing>("/listings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
