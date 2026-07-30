import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { de } from "@/i18n/de";
import { Nav } from "./nav";

/**
 * Inter is self-hosted by `next/font` at build time — no request to Google at runtime, which keeps
 * the app usable on the day FD's internet is down. It is published as `--font-sans`, the variable
 * `globals.css` maps onto Tailwind's `font-sans`, so every shadcn component picks it up.
 */
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

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
    <html lang="de" className={`h-full antialiased ${inter.variable}`}>
      {/* The bar stands above every page, so no route has to opt into it and none can forget. The
          layout itself stays a server component and reads no data — a fetch here would make every
          route in the application dynamic (US-17.1, PRD §7). */}
      <body className="min-h-full flex flex-col">
        <Nav />
        {children}
      </body>
    </html>
  );
}
