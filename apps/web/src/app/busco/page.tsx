"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ListingForm } from "../../components/listing-form";
import { useAuth } from "../../components/auth-provider";

export default function WantedPage() {
  const { token, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !token) router.replace("/");
  }, [isLoading, router, token]);

  if (isLoading || !token) return null;

  return (
    <main>
      <h1>Publicar una búsqueda</h1>
      <p className="muted">Cargá las cartas y cantidades que estás buscando.</p>
      <ListingForm kind="wanted" />
    </main>
  );
}
