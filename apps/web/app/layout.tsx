import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UI Quality Platform",
  description: "Automated UI defect scanning — layout, accessibility, and visual regressions, caught before your users find them.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
