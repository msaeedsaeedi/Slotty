import Link from "next/link";
import { Bell, CalendarCheck, CalendarClock, LogOut, Shield, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Actor } from "@/server/services/access";
import { myRoleKinds } from "@/server/services/courses";
import { unreadCount } from "@/server/services/inbox";

export async function AppHeader({ user }: { user: Actor }) {
  const [unread, roles] = await Promise.all([unreadCount(user), myRoleKinds(user)]);
  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        <Link href="/dashboard" className="mr-2 flex items-center gap-2 font-semibold">
          <CalendarCheck className="size-5 text-primary" />
          Slotty
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard">Courses</Link>
          </Button>
          {roles.staff && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/today">
                <CalendarClock /> Demo day
              </Link>
            </Button>
          )}
          {roles.student && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/bookings">My bookings</Link>
            </Button>
          )}
          {user.isAdmin && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin">
                <Shield /> Admin
              </Link>
            </Button>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" aria-label={`Notifications (${unread} unread)`} className="relative">
            <Link href="/notifications">
              <Bell />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          </Button>
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
