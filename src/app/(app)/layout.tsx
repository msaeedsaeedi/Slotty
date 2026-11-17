import { Analytics } from "@/components/analytics";
import { AppHeader } from "@/components/app-header";
import { OfflineBanner } from "@/components/pwa";
import { SurveyHost } from "@/components/survey";
import { analyticsEnabled } from "@/server/analytics-config";
import { requireUser } from "@/server/auth/session";
import { sharesUsageData } from "@/server/services/accounts";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const enabled = analyticsEnabled();
  const share = enabled && (await sharesUsageData(user));
  return (
    <>
      <AppHeader user={user} />
      <OfflineBanner renderedAt={new Date().toISOString()} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">{children}</main>
      <SurveyHost />
      <Analytics enabled={enabled} share={share} />
    </>
  );
}
