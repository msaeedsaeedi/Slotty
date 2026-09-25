import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegistrar } from "@/components/pwa";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Slotty", template: "%s · Slotty" },
  description: "Book, run and mark university demos and vivas in one place.",
  applicationName: "Slotty",
  appleWebApp: { capable: true, title: "Slotty", statusBarStyle: "default" },
  icons: { apple: "/icons/192" },
};

export const viewport: Viewport = { themeColor: "#111111" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-muted/30">
        {children}
        <Toaster richColors position="top-center" />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
