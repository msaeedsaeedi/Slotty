import { Analytics } from "@/components/analytics";
import { AppHeader } from "@/components/app-header";
import { OfflineOwner } from "@/components/pwa";
import { offlineOwner } from "@/server/offline-owner";
import { SurveyHost } from "@/components/survey";
import { analyticsEnabled } from "@/server/analytics-config";
import { requireUser } from "@/server/auth/session";
import { sharesUsageData } from "@/server/services/accounts";
import { myRoleKinds } from "@/server/services/courses";
import { offlineNeeds } from "@/domain/offline-pages";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // The product team's account is never tracked or surveyed: it would skew what it reads.
  const enabled = analyticsEnabled() && !user.isPlatform;
  const [share, roles] = await Promise.all([enabled && sharesUsageData(user), myRoleKinds(user)]);
  // Only what this account's role uses is set up on the device (#179).
  const needs = offlineNeeds({ outsideCourses: user.isAdmin || Boolean(user.isPlatform), staff: roles.staff });
  return (
    <>
      <AppHeader user={user} roles={roles} needs={needs} />
      <OfflineOwner owner={offlineOwner(user.id)} needs={needs} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">{children}</main>
      {!user.isPlatform && <SurveyHost />}
      <Analytics enabled={enabled} share={share} />
    </>
  );
}
