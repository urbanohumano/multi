import type { Metadata, Viewport } from "next";
import "./globals.css";
import { WalletProvider } from "@/lib/WalletContext";
import BottomNav from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "ValenCupón · Cupones de Valencia",
  description:
    "Busca y guarda los mejores cupones de descuento de los comercios de Valencia. Tu wallet de ahorro local.",
};

export const viewport: Viewport = {
  themeColor: "#f97316",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="font-sans antialiased">
        <WalletProvider>
          <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-white shadow-sm">
            <main className="flex-1 pb-24">{children}</main>
            <BottomNav />
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
