import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing/landing-page";
import { INSTITUTION } from "@/lib/site";
import { getCurrentUser } from "@/server/auth/session";

const title = `Uniflow — Demo booking and marking for ${INSTITUTION}`;
const description =
  "Demo week, minus the spreadsheet. Staff publish time slots, students book one under clear rules, TAs mark against a rubric on the day, and students see their marks only after the instructor releases them.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "Uniflow", title, description, url: "/" },
  twitter: { card: "summary_large_image", title, description },
};

/** Signed-in people go straight to their home; everyone else gets the public landing page. */
export default async function Home() {
  if (await getCurrentUser()) redirect("/dashboard");
  return <LandingPage />;
}
