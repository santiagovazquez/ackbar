import type { Metadata } from "next";
import { AuthProvider } from "../components/auth-provider";
import { SiteFooter } from "../components/site-footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ackbar",
  description: "Compra y venta de singles de Star Wars Unlimited",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>{children}</AuthProvider>
        <SiteFooter />
      </body>
    </html>
  );
}
