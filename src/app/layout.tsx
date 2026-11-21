import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegistrar } from "@/components/pwa";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  // Absolute links for Open Graph images and canonical URLs; unset in dev, where Next uses localhost.
  metadataBase: process.env.APP_URL ? new URL(process.env.APP_URL) : undefined,
  title: { default: "Slotty", template: "%s · Slotty" },
  description: "Book, run and mark university demos and vivas in one place.",
  applicationName: "Slotty",
  appleWebApp: { capable: true, title: "Slotty", statusBarStyle: "default" },
  // Listed explicitly: an icons object here replaces the file-based app/icon.svg.
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], apple: "/icons/192" },
};

export const viewport: Viewport = { themeColor: "#111111" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The landing and public pages scroll smoothly (landing.css); this tells Next.js to turn that off during route changes.
    <html lang="en" data-scroll-behavior="smooth" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-muted/30">
        {children}
        <Toaster richColors position="top-center" />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
