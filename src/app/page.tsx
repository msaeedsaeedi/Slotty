import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";

export default async function Home() {
  redirect((await getCurrentUser()) ? "/dashboard" : "/login");
}
