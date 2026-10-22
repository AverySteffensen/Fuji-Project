import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Fuji Purchasing Hub",
  description:
    "Purchase proposals, dated approvals, and purchase history for Fuji Silysia Chemical USA.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
