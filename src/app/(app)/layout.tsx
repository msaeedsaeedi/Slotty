import { AppHeader } from "@/components/app-header";
import { OfflineBanner } from "@/components/pwa";
import { requireUser } from "@/server/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <AppHeader user={user} />
      <OfflineBanner renderedAt={new Date().toISOString()} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">{children}</main>
    </>
  );
}
