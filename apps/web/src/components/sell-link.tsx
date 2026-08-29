"use client";
import { useAuth } from "./auth-provider";

export function SellLink({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth();
  if (isLoading || !token) return null;
  return (
    <a className="button" href="/vendo">
      {children}
    </a>
  );
}
