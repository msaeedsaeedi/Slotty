import { Analytics } from "@/components/analytics";
import { AppHeader } from "@/components/app-header";
import { OfflineOwner } from "@/components/pwa";
import { offlineOwner } from "@/server/offline-owner";
import { SurveyHost } from "@/components/survey";
import { analyticsEnabled } from "@/server/analytics-config";
import { requireUser } from "@/server/auth/session";
import { sharesUsageData } from "@/server/services/accounts";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // The product team's account is never tracked or surveyed: it would skew what it reads.
  const enabled = analyticsEnabled() && !user.isPlatform;
  const share = enabled && (await sharesUsageData(user));
  return (
    <>
      <AppHeader user={user} />
      <OfflineOwner owner={offlineOwner(user.id)} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">{children}</main>
      {!user.isPlatform && <SurveyHost />}
      <Analytics enabled={enabled} share={share} />
    </>
  );
}
