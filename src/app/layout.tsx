import type { Metadata } from "next";
import "./globals.css";
import { de } from "@/i18n/de";

export const metadata: Metadata = {
  title: de.app.name,
  description: de.app.tagline,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
