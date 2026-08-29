"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ListingForm } from "../../components/listing-form";
import { useAuth } from "../../components/auth-provider";
export default function SellPage() {
  const { token, isLoading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!isLoading && !token) router.replace("/");
  }, [isLoading, router, token]);
  if (isLoading || !token) return null;
  return (
    <main>
      <h1>Publicar una venta</h1>
      <p className="muted">La publicación estará activa durante siete días.</p>
      <ListingForm kind="sale" />
    </main>
  );
}
