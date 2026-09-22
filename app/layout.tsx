import type { Metadata } from "next";
import AppProviders from "@/src/components/AppProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Supplide Partner Portal",
    template: "%s | Supplide",
  },
  description: "Secure B2B peptide ordering and administration.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
