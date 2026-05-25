import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Providers } from "@/lib/providers/providers";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
	title: "Slotty — Student Scheduling & Evaluation Platform",
	description:
		"Book demo slots, record evaluations, and export results with ease.",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en" className={cn("font-sans", geist.variable)}>
			<body>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
