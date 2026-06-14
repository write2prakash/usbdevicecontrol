import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "USB Control SaaS",
  description: "Multi-tenant USB control system for Windows endpoints.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
