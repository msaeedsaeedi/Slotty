import Link from "next/link";
import { BarChart3, CalendarClock, LogOut, Shield, UserRound } from "lucide-react";
import { UniflowMark } from "@/components/uniflow-mark";
import { FeedbackButton } from "@/components/feedback-button";
import { LiveBell } from "@/components/live-bell";
import { Button } from "@/components/ui/button";
import type { Actor } from "@/server/services/access";
import { myRoleKinds } from "@/server/services/courses";
import { unreadCount } from "@/server/services/inbox";

export async function AppHeader({ user }: { user: Actor }) {
  const [unread, roles] = await Promise.all([unreadCount(user), myRoleKinds(user)]);
  // Admins run the platform and never join courses, so the console is all they need.
  const admin = user.isAdmin;
  // The product team's dedicated account sees only its own area.
  const platform = Boolean(user.isPlatform);
  const outsideCourses = admin || platform;
  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        <Link href={admin ? "/admin" : platform ? "/platform" : "/dashboard"} className="mr-2 flex items-center gap-2 font-semibold">
          <UniflowMark className="size-6 text-primary" />
          Uniflow
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {!outsideCourses && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard">Home</Link>
            </Button>
          )}
          {!outsideCourses && roles.hosts && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/today">
                <CalendarClock /> Demo day
              </Link>
            </Button>
          )}
          {!outsideCourses && roles.student && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/bookings">My demos</Link>
            </Button>
          )}
          {admin && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin">
                <Shield /> Administration
              </Link>
            </Button>
          )}
          {platform && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/platform">
                <BarChart3 /> Platform
              </Link>
            </Button>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          {!outsideCourses && <FeedbackButton />}
          <LiveBell initial={unread} />
          <Link href="/account" className="hidden max-w-40 truncate text-sm text-muted-foreground hover:text-foreground sm:inline">
            {user.name}
          </Link>
          <Button asChild variant="ghost" size="icon" aria-label="Account" className="sm:hidden">
            <Link href="/account">
              <UserRound />
            </Link>
          </Button>
          <form action="/logout" method="post">
            <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
              <LogOut />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
